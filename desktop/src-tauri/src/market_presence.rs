//! WFM WebSocket v0.13 contract; token stays inside Rust memory.
//! Official: 42bytes-team/wfm-docs/docs/websockets/{authentication,status-and-activity,overview}.mdx
use serde::Serialize;
use serde_json::{json, Value};
use std::{net::{Shutdown, TcpStream, ToSocketAddrs}, sync::{mpsc, Arc, Mutex, OnceLock}, time::{Duration, Instant}};
use tungstenite::{client::IntoClientRequest, protocol::{Message, WebSocketConfig}, stream::MaybeTlsStream, WebSocket};
use crate::market::PresenceCredential;

#[derive(Clone, Default, Serialize)]
#[serde(rename_all="camelCase")]
pub struct PresenceView {
    pub account_id: String, pub platform: String, pub connected: bool, pub authenticated: bool,
    pub ready: bool, pub status: Option<String>, pub pending: bool, pub error: Option<String>,
    pub revision: Option<u64>, pub auto_mode: bool,
}
struct Protocol { view: PresenceView, auth_id: String, pending_id: Option<String> }
impl Protocol {
    fn message(&mut self, value: &Value) {
        let route=value["route"].as_str().unwrap_or("");
        if route=="@wfm|cmd/auth/signIn:ok" && value["id"].as_str()==Some(&self.auth_id) { self.view.authenticated=true; return; }
        if route=="@wfm|cmd/auth/signIn:error" { self.view.error=Some("市场状态认证失败，请重新登录".into()); self.view.authenticated=false; return; }
        let event=route=="@wfm|event/status/set";
        let ack=route=="@wfm|cmd/status/set:ok" && self.pending_id.as_deref()==value["id"].as_str() && self.pending_id.is_some();
        if self.view.authenticated && (event||ack) {
            if let Some(stream)=value.pointer("/meta/stream").and_then(Value::as_str) { if stream!=format!("status:{}",self.view.account_id) {return;} }
            let revision=value.pointer("/meta/revision").and_then(Value::as_u64);
            if let (Some(old),Some(next))=(self.view.revision,revision) { if next<=old {if ack {self.pending_id=None;self.view.pending=false;}return;} }
            let Some(status)=value.pointer("/payload/status").and_then(Value::as_str).filter(|s| matches!(*s,"online"|"ingame"|"invisible"|"offline")) else {return;};
            self.view.status=Some(status.into());self.view.ready=true;self.view.revision=revision.or(self.view.revision);self.view.error=None;
            if ack {self.pending_id=None;self.view.pending=false;}
        } else if route=="@wfm|cmd/status/set:error" || route=="@wfm|protect/error" {
            if self.pending_id.as_deref()==value["id"].as_str() {self.pending_id=None;self.view.pending=false;self.view.error=Some("市场未接受此次状态变更".into());}
        }
    }
}
type Socket=WebSocket<MaybeTlsStream<TcpStream>>;
struct Active { socket:Socket, protocol:Protocol, epoch:u64, received:Instant, ping:Instant, pending_at:Option<Instant>, started:Instant }
enum Command { Connect(PresenceCredential,bool), Set{epoch:u64,status:String}, Auto{epoch:u64,enabled:bool}, Stop }
struct Actor { tx:mpsc::SyncSender<Command>, view:Arc<Mutex<PresenceView>> }
static ACTOR:OnceLock<Actor>=OnceLock::new();
static TCP:OnceLock<Mutex<Option<TcpStream>>>=OnceLock::new();
fn close_transport() {if let Ok(mut tcp)=TCP.get_or_init(||Mutex::new(None)).lock(){if let Some(stream)=tcp.take(){let _=stream.shutdown(Shutdown::Both);}}}
pub fn invalidate(){close_transport();if let Some(actor)=ACTOR.get(){if let Ok(mut view)=actor.view.lock(){*view=PresenceView::default();}}}
pub fn shutdown(){invalidate();if let Some(actor)=ACTOR.get(){let _=actor.tx.try_send(Command::Stop);}}
fn publish(state:&Arc<Mutex<PresenceView>>,view:PresenceView){if let Ok(mut target)=state.lock(){*target=view;}}
fn connect(credential:PresenceCredential)->Result<Active,String>{
    if !crate::market::presence_epoch_current(credential.epoch){return Err("市场会话已变化".into());}
    let addresses=("ws.warframe.market",443).to_socket_addrs().map_err(|_|"状态服务域名解析失败")?;
    let mut stream=None;
    for address in addresses.take(4){if let Ok(tcp)=TcpStream::connect_timeout(&address,Duration::from_secs(8)){stream=Some(tcp);break;}}
    let stream=stream.ok_or("状态服务连接超时")?;
    stream.set_read_timeout(Some(Duration::from_secs(10))).map_err(|_|"状态连接初始化失败")?;
    stream.set_write_timeout(Some(Duration::from_secs(8))).map_err(|_|"状态连接初始化失败")?;
    if let Ok(mut control)=TCP.get_or_init(||Mutex::new(None)).lock(){*control=Some(stream.try_clone().map_err(|_|"状态连接初始化失败")?);}
    let mut request="wss://ws.warframe.market/socket".into_client_request().map_err(|_|"状态协议初始化失败")?;
    request.headers_mut().insert("Sec-WebSocket-Protocol", "wfm".parse().unwrap());
    let config=WebSocketConfig::default().max_message_size(Some(65536)).max_frame_size(Some(65536));
    let (mut socket,response)=tungstenite::client_tls_with_config(request,stream,Some(config),None).map_err(|_|"状态 TLS / WebSocket 握手失败")?;
    if response.headers().get("Sec-WebSocket-Protocol").and_then(|h|h.to_str().ok())!=Some("wfm"){return Err("状态服务未确认 wfm 子协议".into());}
    match socket.get_mut(){MaybeTlsStream::Plain(t)=>{let _=t.set_read_timeout(Some(Duration::from_millis(150)));},MaybeTlsStream::Rustls(t)=>{let _=t.sock.set_read_timeout(Some(Duration::from_millis(150)));},_=>{}}
    if !crate::market::presence_epoch_current(credential.epoch){return Err("市场会话已变化".into());}
    let auth_id=format!("auth-{}",credential.epoch);
    socket.send(Message::Text(json!({"route":"@wfm|cmd/auth/signIn","id":auth_id,"payload":{"token":credential.token}}).to_string().into())).map_err(|_|"状态认证请求发送失败")?;
    Ok(Active {socket,epoch:credential.epoch,received:Instant::now(),ping:Instant::now(),pending_at:None,started:Instant::now(),protocol:Protocol {view:PresenceView{account_id:credential.account_id,platform:credential.platform,connected:true,..Default::default()},auth_id,pending_id:None}})
}
fn auto_status(running:Option<bool>)->Option<&'static str>{running.map(|open|if open{"ingame"}else{"invisible"})}
fn game_running()->Option<bool>{
    #[cfg(windows)] {Some(crate::helper_inventory::game_pid().is_some())}
    #[cfg(not(windows))] {None}
}
fn actor()->&'static Actor { ACTOR.get_or_init(||{
    let (tx,rx)=mpsc::sync_channel::<Command>(16);let view=Arc::new(Mutex::new(PresenceView::default()));let output=view.clone();
    std::thread::spawn(move ||{
        let mut active:Option<Active>=None;let mut sequence=0u64;let mut desired:Option<(String,String,u64)>=None;let mut retry_at:Option<Instant>=None;let mut backoff=0u32;let mut auto_epoch:Option<u64>=None;let mut auto_checked=Instant::now()-Duration::from_secs(10);
        loop {
            let mut command=if active.is_some(){rx.try_recv().ok()}else{match rx.recv_timeout(Duration::from_millis(500)){Ok(c)=>Some(c),Err(mpsc::RecvTimeoutError::Timeout)=>None,Err(_)=>break}};
            if command.is_none() && active.is_none() {
                if let Some((account,platform,epoch))=desired.as_ref() {
                    if !crate::market::presence_epoch_current(*epoch) {desired=None;retry_at=None;}
                    else if retry_at.is_some_and(|at|Instant::now()>=at) {
                        match crate::market::presence_credential(account,platform,false) {Ok(credential)=>{command=Some(Command::Connect(credential,false));},Err(_)=>{desired=None;retry_at=None;}}
                    }
                }
            }
            if let Some(command)=command {match command {
                Command::Stop=>{close_transport();break;},
                Command::Connect(credential,force)=>{
                    if !force && active.as_ref().is_some_and(|a|a.epoch==credential.epoch){continue;}
                    close_transport();active=None;
                    let account=credential.account_id.clone();let platform=credential.platform.clone();
                    desired=Some((account.clone(),platform.clone(),credential.epoch));retry_at=None;
                    match connect(credential){Ok(next)=>{publish(&output,next.protocol.view.clone());active=Some(next);},Err(error)=>{close_transport();backoff=(backoff+1).min(10);retry_at=Some(Instant::now()+Duration::from_secs((1u64<<backoff).min(600)));publish(&output,PresenceView{account_id:account,platform,error:Some(error),..Default::default()});}}
                },
                Command::Auto{epoch,enabled}=>if let Some(a)=active.as_mut(){if a.epoch==epoch&&crate::market::presence_epoch_current(epoch){auto_epoch=if enabled{Some(epoch)}else{None};a.protocol.view.auto_mode=enabled;auto_checked=Instant::now()-Duration::from_secs(10);publish(&output,a.protocol.view.clone());}},
                Command::Set{epoch,status}=>if let Some(a)=active.as_mut(){
                    if a.epoch!=epoch||!crate::market::presence_epoch_current(epoch){close_transport();active=None;desired=None;retry_at=None;continue;}
                    auto_epoch=None;a.protocol.view.auto_mode=false;
                    if !a.protocol.view.ready||!a.protocol.view.authenticated||a.protocol.view.pending {continue;}
                    sequence+=1;let id=format!("status-{epoch}-{sequence}");
                    match a.socket.send(Message::Text(json!({"route":"@wfm|cmd/status/set","id":id,"payload":{"status":status}}).to_string().into())) {
                        Ok(())=>{a.protocol.pending_id=Some(id);a.protocol.view.pending=true;a.pending_at=Some(Instant::now());},
                        Err(_)=>{a.protocol.view.error=Some("状态发送结果未知，请重连核对服务端状态".into());close_transport();a.protocol.view.connected=false;a.protocol.view.ready=false;}
                    }
                    publish(&output,a.protocol.view.clone());
                }
            }}
            let Some(a)=active.as_mut() else {continue;};
            if !crate::market::presence_epoch_current(a.epoch){auto_epoch=None;close_transport();active=None;desired=None;retry_at=None;publish(&output,PresenceView::default());continue;}
            a.protocol.view.auto_mode=auto_epoch==Some(a.epoch);
            if a.protocol.view.auto_mode&&a.protocol.view.ready&&a.protocol.view.authenticated&&!a.protocol.view.pending&&auto_checked.elapsed()>=Duration::from_secs(5){
                auto_checked=Instant::now();
                if let Some(target)=auto_status(game_running()) {if a.protocol.view.status.as_deref()!=Some(target){
                    sequence+=1;let id=format!("auto-{}-{sequence}",a.epoch);
                    match a.socket.send(Message::Text(json!({"route":"@wfm|cmd/status/set","id":id,"payload":{"status":target}}).to_string().into())){
                        Ok(())=>{a.protocol.pending_id=Some(id);a.protocol.view.pending=true;a.pending_at=Some(Instant::now());},
                        Err(_)=>{a.protocol.view.error=Some("Auto 状态发送结果未知，请重连核对".into());close_transport();a.protocol.view.connected=false;a.protocol.view.ready=false;}
                    }
                    publish(&output,a.protocol.view.clone());
                }}
            }
            let mut disconnected=false;let mut auth_failed=false;
            match a.socket.read(){
                Ok(Message::Text(text))=>{a.received=Instant::now();if let Ok(value)=serde_json::from_str::<Value>(&text){a.protocol.message(&value);if value["route"]=="@wfm|cmd/auth/signIn:error"{auth_failed=true;disconnected=true;}if a.protocol.view.ready{backoff=0;}if !a.protocol.view.pending {a.pending_at=None;}publish(&output,a.protocol.view.clone());}},
                Ok(Message::Ping(payload))=>{a.received=Instant::now();let _=a.socket.send(Message::Pong(payload));},
                Ok(Message::Pong(_))=>{a.received=Instant::now();},Ok(Message::Close(_))=>{disconnected=true;},Ok(_)=>{},
                Err(tungstenite::Error::Io(ref error)) if matches!(error.kind(),std::io::ErrorKind::WouldBlock|std::io::ErrorKind::TimedOut)=>{},
                Err(_)=>{disconnected=true;}
            }
            if a.ping.elapsed()>Duration::from_secs(25){a.ping=Instant::now();if a.socket.send(Message::Ping(Vec::new().into())).is_err(){disconnected=true;}}
            if a.received.elapsed()>Duration::from_secs(90)||(!a.protocol.view.ready&&a.started.elapsed()>Duration::from_secs(20)){disconnected=true;}
            if a.pending_at.is_some_and(|at|at.elapsed()>Duration::from_secs(15)){a.protocol.view.pending=false;a.protocol.pending_id=None;a.pending_at=None;a.protocol.view.error=Some("状态回执超时，请重连核对；未自动重试".into());publish(&output,a.protocol.view.clone());}
            if disconnected {let view=PresenceView{account_id:a.protocol.view.account_id.clone(),platform:a.protocol.view.platform.clone(),error:Some(if auth_failed{"状态认证失败，请重新登录"}else{"状态连接已断开，正在等待重连"}.into()),..Default::default()};close_transport();active=None;if auth_failed{desired=None;retry_at=None;}else{backoff=(backoff+1).min(10);retry_at=Some(Instant::now()+Duration::from_secs((1u64<<backoff).min(600)));}publish(&output,view);}
        }
    });Actor{tx,view}
})}
#[tauri::command]
pub async fn market_presence(action:String,status:Option<String>,expected_account:String,expected_platform:String)->Result<PresenceView,String>{
    tauri::async_runtime::spawn_blocking(move ||{
        let credential=crate::market::presence_credential(&expected_account,&expected_platform,matches!(action.as_str(),"set"|"auto"))?;
        let worker=actor();
        match action.as_str(){
            "connect"|"reconnect"=>worker.tx.try_send(Command::Connect(credential,action=="reconnect")).map_err(|_|"状态任务忙，请稍后重试")?,
            "set"=>{let status=status.filter(|s|matches!(s.as_str(),"online"|"ingame"|"invisible")).ok_or("状态值无效")?;worker.tx.try_send(Command::Set{epoch:credential.epoch,status}).map_err(|_|"状态任务忙，请稍后重试")?;},
            "auto"=>{let enabled=match status.as_deref(){Some("true")=>true,Some("false")=>false,_=>return Err("Auto 模式值无效".into())};worker.tx.try_send(Command::Auto{epoch:credential.epoch,enabled}).map_err(|_|"状态任务忙，请稍后重试")?;},
            "state"=>{},_=>return Err("未知状态操作".into())
        }
        let view=worker.view.lock().map_err(|_|"状态锁错误")?.clone();
        if !view.account_id.is_empty() && (view.account_id!=expected_account||view.platform!=expected_platform){return Ok(PresenceView::default());}
        Ok(view)
    }).await.map_err(|_|"状态任务失败".to_string())?
}
#[cfg(test)]
mod tests {
    use super::*;
    fn state()->Protocol{Protocol{view:PresenceView{account_id:"a".into(),connected:true,..Default::default()},auth_id:"auth".into(),pending_id:None}}
    #[test] fn automatic_presence_uses_game_process_and_keeps_unknown_unset(){assert_eq!(auto_status(Some(true)),Some("ingame"));assert_eq!(auto_status(Some(false)),Some("invisible"));assert_eq!(auto_status(None),None);}
    #[test] fn authentication_alone_does_not_assert_current_status(){let mut p=state();p.message(&json!({"route":"@wfm|cmd/auth/signIn:ok","id":"auth"}));assert!(p.view.authenticated);assert!(!p.view.ready);p.message(&json!({"route":"@wfm|event/status/set","payload":{"status":"online"},"meta":{"stream":"status:a","revision":2}}));assert!(p.view.ready);assert_eq!(p.view.status.as_deref(),Some("online"));}
    #[test] fn stale_foreign_and_uncorrelated_statuses_do_not_overwrite_truth(){let mut p=state();p.view.authenticated=true;p.view.status=Some("ingame".into());p.view.revision=Some(3);for message in [json!({"route":"@wfm|event/status/set","payload":{"status":"online"},"meta":{"stream":"status:b","revision":4}}),json!({"route":"@wfm|event/status/set","payload":{"status":"online"},"meta":{"stream":"status:a","revision":2}}),json!({"route":"@wfm|event/status/set","payload":{"status":"online"},"meta":{"stream":"status:a","revision":3}}),json!({"route":"@wfm|cmd/status/set:ok","id":"other","payload":{"status":"online"}})]{p.message(&message);assert_eq!(p.view.status.as_deref(),Some("ingame"));}}
    #[test] fn acknowledged_updates_clear_pending_without_optimistic_status(){let mut p=state();p.view.authenticated=true;p.view.pending=true;p.pending_id=Some("set-1".into());assert_eq!(p.view.status,None);p.message(&json!({"route":"@wfm|cmd/status/set:ok","id":"set-1","payload":{"status":"invisible"}}));assert!(!p.view.pending);assert_eq!(p.view.status.as_deref(),Some("invisible"));assert!(!serde_json::to_string(&p.view).unwrap().contains("token"));}
}

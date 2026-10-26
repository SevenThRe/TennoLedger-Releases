//! Bounded, schema-whitelisted local diagnostics. No raw bodies, credentials or auto-upload.
use serde::{Deserialize,Serialize};
use serde_json::{json,Value};
use std::{io::Write,path::{Path,PathBuf},sync::{Mutex,OnceLock,atomic::{AtomicU64,Ordering}},time::Instant};
use tauri::Manager;
const LIMIT:u64=2*1024*1024;
static STORE:OnceLock<Mutex<LogStore>>=OnceLock::new();
static SEQUENCE:AtomicU64=AtomicU64::new(1);
static FAILURES:AtomicU64=AtomicU64::new(0);
#[derive(Clone,Serialize,Deserialize)]
#[serde(deny_unknown_fields)]
struct Event {
    timestamp:String,process:u32,id:u64,component:String,operation:String,phase:String,
    #[serde(skip_serializing_if="Option::is_none")] status:Option<u16>,
    #[serde(skip_serializing_if="Option::is_none")] elapsed_ms:Option<u64>,
    #[serde(skip_serializing_if="Option::is_none")] platform:Option<String>,
    #[serde(skip_serializing_if="Option::is_none")] authenticated:Option<bool>,
    #[serde(skip_serializing_if="Option::is_none")] verified:Option<bool>,
    #[serde(skip_serializing_if="Option::is_none")] html_response:Option<bool>,
    fields:Vec<String>,codes:Vec<String>,
    #[serde(default,skip_serializing_if="Option::is_none")] source:Option<String>,
    #[serde(default,skip_serializing_if="Option::is_none")] column:Option<u32>,
    #[serde(skip_serializing_if="Option::is_none")] fault:Option<String>,
    #[serde(skip_serializing_if="Option::is_none")] line:Option<u32>,
}
fn selected(value:&str,allowed:&[&str])->String{if allowed.contains(&value){value.into()}else{"other".into()}}
fn field(value:&str)->bool{["itemId","type","platinum","quantity","visible","rank","perTrade","charges","subtype","amberStars","cyanStars","attributes","starting_price","buyout_price"].contains(&value)}
fn code(value:&str)->bool{value.len()<=120&&(value.starts_with("app.errors.")||value.starts_with("app.field."))&&value.bytes().all(|c|c.is_ascii_alphanumeric()||b"._-".contains(&c))}
impl Event {
    fn new(component:&str,operation:&str)->Self{Self{timestamp:chrono::Utc::now().to_rfc3339(),process:std::process::id(),id:SEQUENCE.fetch_add(1,Ordering::Relaxed),component:component.into(),operation:operation.into(),phase:"start".into(),status:None,elapsed_ms:None,platform:None,authenticated:None,verified:None,html_response:None,fields:vec![],codes:vec![],source:None,column:None,fault:None,line:None}}
    fn clean(mut self)->Self{
        self.timestamp=chrono::DateTime::parse_from_rfc3339(&self.timestamp).map(|t|t.to_rfc3339()).unwrap_or_default();
        self.component=selected(&self.component,&["app","wm","frontend","collector"]);
        self.operation=selected(&self.operation,&["startup","native_panic","window_error","unhandled_rejection","handled_error","session_validate","signin","items","book","mine","review","create","update","delete","close","auction","auction_create","auction_update","auction_close","auctions_mine","riven_attributes","riven_weapons","rivens","updater","inventory_sync"]);
        self.phase=selected(&self.phase,&["start","success","rejected","uncertain","interrupted","error"]);
        self.platform=self.platform.filter(|v|["pc","ps4","xbox","switch","mobile"].contains(&v.as_str()));
        self.fields.retain(|v|field(v));self.fields.sort();self.fields.dedup();self.fields.truncate(16);
        self.codes.retain(|v|code(v));self.codes.sort();self.codes.dedup();self.codes.truncate(8);
        self.source=self.source.filter(|s|s=="app_bundle"||(s.len()<=64&&s.ends_with(".rs")&&s[..s.len()-3].bytes().all(|b|b.is_ascii_lowercase()||b.is_ascii_digit()||b==b'_')));
        self.fault=self.fault.map(|s|selected(&s,&["timeout","connection","transport","type_error","reference_error","syntax_error","network_error","native_panic","other"]));
        self
    }
}
struct LogStore{directory:PathBuf,limit:u64}
impl LogStore {
    fn new(directory:PathBuf,limit:u64)->std::io::Result<Self>{std::fs::create_dir_all(&directory)?;Ok(Self{directory,limit})}
    fn file(&self,n:usize)->PathBuf{self.directory.join(if n==0{"events.jsonl".into()}else{format!("events.{n}.jsonl")})}
    fn append(&self,event:Event)->std::io::Result<()>{
        let mut bytes=serde_json::to_vec(&event.clean())?;bytes.push(b'\n');
        if std::fs::metadata(self.file(0)).map(|m|m.len()).unwrap_or(0)+bytes.len() as u64>self.limit{
            if self.file(2).exists(){std::fs::remove_file(self.file(2))?;}
            for n in (0..2).rev(){if self.file(n).exists(){std::fs::rename(self.file(n),self.file(n+1))?;}}
        }
        let mut file=std::fs::OpenOptions::new().create(true).append(true).open(self.file(0))?;file.write_all(&bytes)?;file.flush()
    }
    fn events(&self)->Vec<Event>{
        let mut rows=Vec::new();
        for n in (0..3).rev(){if let Ok(bytes)=std::fs::read(self.file(n)){if bytes.len() as u64>self.limit+8192{continue;}for line in bytes.split(|b|*b==b'\n'){if line.len()<=8192{if let Ok(event)=serde_json::from_slice::<Event>(line){rows.push(event.clean());}}}}}
        if rows.len()>2000{rows.drain(..rows.len()-2000);}rows
    }
}
fn record(event:Event){if let Some(store)=STORE.get(){if let Ok(store)=store.lock(){if store.append(event).is_err(){FAILURES.fetch_add(1,Ordering::Relaxed);}}}}
pub fn initialize(directory:&Path){
    match LogStore::new(directory.join("logs"),LIMIT){Ok(store)=>{let _=STORE.set(Mutex::new(store));record(Event::new("app","startup"));},Err(_)=>{FAILURES.fetch_add(1,Ordering::Relaxed);}}
}
pub fn ready(){let mut event=Event::new("app","startup");event.phase="success".into();record(event);}
fn inventory_event(scan_code:&str,complete:Option<bool>,elapsed_ms:u64)->Event{
    let stage=scan_code.strip_prefix("helper-invalid-inventory:").unwrap_or(scan_code);
    let stage=selected(stage,&["helper-current","helper-missing","helper-session-unavailable","helper-auth-failed","helper-account-mismatch","helper-network-failed","helper-start-failed","helper-timeout","helper-cancelled","identity-invalid","login-changed-during-read","storage-lock","storage-active-scope","identity-selection-blocked","storage-load","storage-save","history-save-failed","normalize-core-structure","normalize-timestamp","normalize-item-type","normalize-quantity","normalize-quantity-limit","normalize-list-type","normalize-xp","normalize-validation","acquisition-older","acquisition-live-preferred","acquisition-incomplete","acquisition-invalid-time","acquisition-unknown-identity","account-not-accepted","core-structure","invalid-json","identity-root","output-missing"]);
    let mut event=Event::new("collector","inventory_sync");event.phase=if stage=="helper-current"{"success"}else{"rejected"}.into();event.elapsed_ms=Some(elapsed_ms);event.verified=complete;event.codes=vec![format!("app.errors.collector.{stage}")];event
}
pub fn inventory_result(scan_code:&str,complete:Option<bool>,elapsed_ms:u64){record(inventory_event(scan_code,complete,elapsed_ms));}
pub fn install_panic_hook(){let previous=std::panic::take_hook();std::panic::set_hook(Box::new(move|info|{let mut event=Event::new("app","native_panic");event.phase="error".into();event.fault=Some("native_panic".into());event.line=info.location().map(|p|p.line());event.source=info.location().and_then(|p|Path::new(p.file()).file_name()).map(|s|s.to_string_lossy().to_string());if let Some(store)=STORE.get(){if let Ok(store)=store.try_lock(){let _=store.append(event);}}previous(info);}));}
pub struct RequestTrace{event:Event,start:Instant,finished:bool}
impl RequestTrace {
    pub fn begin(operation:&str,platform:&str,authenticated:bool,verified:Option<bool>,body:&Value)->Self{
        let mut event=Event::new("wm",operation);event.platform=Some(platform.into());event.authenticated=Some(authenticated);event.verified=verified;
        event.fields=body.as_object().map(|o|o.keys().filter(|v|field(v)).cloned().collect()).unwrap_or_default();record(event.clone());Self{event,start:Instant::now(),finished:false}
    }
    pub fn id(&self)->String{format!("D-{}-{}",self.event.process,self.event.id)}
    pub fn response(&mut self,status:u16,html:bool,result:&Result<Value,String>){
        let mut event=self.event.clone();event.status=Some(status);event.html_response=Some(html);event.elapsed_ms=Some(self.start.elapsed().as_millis() as u64);
        event.phase=if result.is_ok(){"success"}else if matches!(status,400|401|403|404|405|409|410|413|415|422|429)||result.as_ref().err().is_some_and(|s|s.starts_with("市场业务拒绝：")){"rejected"}else{"uncertain"}.into();
        if let Err(error)=result {event.codes=error.split(|c:char|!c.is_ascii_alphanumeric()&&!"._-".contains(c)).filter(|v|code(v)).map(str::to_string).collect();}
        record(event);self.finished=true;
    }
    pub fn network(&mut self,error:&reqwest::Error){let mut event=self.event.clone();event.phase="uncertain".into();event.elapsed_ms=Some(self.start.elapsed().as_millis() as u64);event.fault=Some(if error.is_timeout(){"timeout"}else if error.is_connect(){"connection"}else{"transport"}.into());record(event);self.finished=true;}
}
impl Drop for RequestTrace{fn drop(&mut self){if !self.finished{let mut event=self.event.clone();event.phase="interrupted".into();event.elapsed_ms=Some(self.start.elapsed().as_millis() as u64);record(event);}}}
#[tauri::command]
pub fn diagnostics_client_event(kind:String,code:String,line:Option<u32>,column:Option<u32>){let mut event=Event::new("frontend",&kind);event.phase="error".into();event.fault=Some(code);event.line=line;event.column=column;event.source=Some("app_bundle".into());record(event);}
#[tauri::command]
pub fn diagnostics_log_status()->Value{json!({"enabled":STORE.get().is_some(),"writeFailures":FAILURES.load(Ordering::Relaxed),"maxBytes":LIMIT*3,"automaticUpload":false})}
#[tauri::command]
pub fn diagnostics_open_logs()->Result<(),String>{
    let directory=STORE.get().ok_or("日志尚未初始化")?.lock().map_err(|_|"日志繁忙")?.directory.clone();
    #[cfg(windows)]{std::process::Command::new("explorer.exe").arg(directory).spawn().map_err(|_|"无法打开日志目录")?;Ok(())}
    #[cfg(not(windows))]{let _=directory;Err("当前平台不支持打开日志目录".into())}
}
#[tauri::command]
pub async fn diagnostics_export_report(app:tauri::AppHandle,window:tauri::WebviewWindow)->Result<Option<String>,String>{
    #[cfg(windows)]let owner=window.hwnd().map_err(|_|"无法获取窗口")?.0 as usize;
    #[cfg(not(windows))]let owner=0usize;
    tauri::async_runtime::spawn_blocking(move||{
        use sha2::{Digest,Sha256};use std::io::Read;
        let events=STORE.get().ok_or("日志尚未初始化")?.lock().map_err(|_|"日志繁忙")?.events();
        let mut hash=Sha256::new();let mut file=std::fs::File::open(std::env::current_exe().map_err(|_|"无法读取程序版本")?).map_err(|_|"无法读取程序版本")?;let mut buffer=[0u8;65536];loop{let n=file.read(&mut buffer).map_err(|_|"无法读取程序版本")?;if n==0{break;}hash.update(&buffer[..n]);}
        let readiness=crate::app_preferences::app_diagnostics(app.clone(),app.state::<crate::AppState>(),app.state::<crate::collector::Collector>()).ok();
        let readiness=json!({"collectorEnabled":readiness.as_ref().and_then(|s|s["collectorEnabled"].as_bool()),"helperAvailable":readiness.as_ref().and_then(|s|s["helperAvailable"].as_bool()),"ocrAvailable":readiness.as_ref().and_then(|s|s["ocrAvailable"].as_bool()),"inventoryComplete":readiness.as_ref().and_then(|s|s["inventoryComplete"].as_bool())});
        let market=crate::market::diagnostic_state();
        let report=build_report(events,&app.package_info().version.to_string(),&format!("{:x}",hash.finalize()),&readiness,&market);
        let name=format!("TennoLedger-debug-{}.json",chrono::Utc::now().format("%Y%m%d-%H%M%S"));
        let Some(path)=crate::save_dialog::choose(owner,&name)? else{return Ok(None)};
        crate::backup::write(&path,&serde_json::to_string_pretty(&report).map_err(|_|"无法生成诊断报告")?)?;Ok(Some(path.to_string_lossy().into_owned()))
    }).await.map_err(|_|"诊断报告导出失败".to_string())?
}
fn safe_status(value:&Value,keys:&[&str],platform:bool)->Value{
    let mut result=serde_json::Map::new();for key in keys{if let Some(v)=value.get(*key).and_then(Value::as_bool){result.insert((*key).into(),json!(v));}}
    if platform{if let Some(v)=value["platform"].as_str().filter(|s|["pc","ps4","xbox","switch","mobile"].contains(s)){result.insert("platform".into(),json!(v));}}Value::Object(result)
}
fn build_report(mut events:Vec<Event>,version:&str,hash:&str,readiness:&Value,market:&Value)->Value{
    if events.len()>2000{events.drain(..events.len()-2000);}
    let events:Vec<_>=events.into_iter().map(Event::clean).collect();
    json!({"schemaVersion":1,"generatedAt":chrono::Utc::now().to_rfc3339(),"appVersion":version,"executableSha256":hash,"os":std::env::consts::OS,"architecture":std::env::consts::ARCH,"logging":diagnostics_log_status(),"readiness":safe_status(readiness,&["collectorEnabled","helperAvailable","ocrAvailable","inventoryComplete"],false),"market":safe_status(market,&["connected","verified","remembered","hasSessionError","unavailable"],true),"events":events,"privacy":{"credentialsIncluded":false,"requestBodiesIncluded":false,"inventoryIncluded":false,"accountNamesIncluded":false,"automaticUpload":false}})
}
#[cfg(test)]mod tests{
    use super::*;
    #[test]fn inventory_rejections_are_loggable_without_raw_helper_data(){
        let event=inventory_event("helper-invalid-inventory:acquisition-incomplete",Some(false),42).clean();
        assert_eq!(event.component,"collector");assert_eq!(event.operation,"inventory_sync");assert_eq!(event.phase,"rejected");assert_eq!(event.verified,Some(false));assert_eq!(event.codes,vec!["app.errors.collector.acquisition-incomplete"]);
        let secret="private-token@example.com";let text=serde_json::to_string(&inventory_event(secret,None,0).clean()).unwrap();assert!(!text.contains(secret));assert!(text.contains("app.errors.collector.other"));
        assert_eq!(inventory_event("helper-current",Some(true),10).clean().phase,"success");
    }
    #[test]fn schema_drops_secrets_and_rotation_is_bounded(){
        let directory=std::env::temp_dir().join(format!("tennoledger-log-test-{}-{}",std::process::id(),SEQUENCE.fetch_add(1,Ordering::Relaxed)));
        let store=LogStore::new(directory.clone(),1024).unwrap();let secret="synthetic-password-token@example.com";
        for _ in 0..30{let mut event=Event::new(secret,secret);event.platform=Some(secret.into());event.fault=Some(secret.into());event.codes=vec![secret.into(),"app.errors.forbidden".into()];event.fields=vec![secret.into(),"password".into(),"Authorization".into(),"quantity".into()];store.append(event).unwrap();}
        let rows=store.events();assert!(!rows.is_empty());let json=serde_json::to_string(&rows).unwrap();assert!(!json.contains(secret));assert!(!json.contains("password"));assert!(!json.contains("Authorization"));assert!(json.contains("app.errors.forbidden"));assert!(json.contains("quantity"));
        assert!(std::fs::read_dir(&directory).unwrap().count()<=3);for n in 0..3{if store.file(n).exists(){assert!(std::fs::metadata(store.file(n)).unwrap().len()<=1024);std::fs::remove_file(store.file(n)).unwrap();}}std::fs::remove_dir(directory).unwrap();
    }
    #[test]fn report_whitelists_runtime_metadata_and_is_a_valid_export(){
        let secret="private-token-email@example.com";let mut event=Event::new(secret,secret);event.codes=vec![secret.into()];event.source=Some(secret.into());
        let report=build_report(vec![event],"0.1.0",&"0".repeat(64),&json!({"email":secret,"collectorEnabled":true}),&json!({"token":secret,"accountName":secret,"platform":secret,"connected":true}));
        let text=serde_json::to_string_pretty(&report).unwrap();assert!(!text.contains(secret));assert!(!text.contains("accountName\""));assert_eq!(report["market"]["connected"],true);
        let path=std::env::temp_dir().join(format!("tennoledger-report-test-{}.json",std::process::id()));crate::backup::write(&path,&text).unwrap();let saved:Value=serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();assert_eq!(saved["schemaVersion"],1);std::fs::remove_file(path).unwrap();
    }
    #[test]fn arbitrary_server_text_and_paths_are_not_loggable_codes(){for s in ["Authorization: Bearer secret","C:/Users/Private/wm-session.dpapi","person@example.com","app.errors.a b"]{assert!(!code(s));}assert!(code("app.errors.notVerified"));}
}

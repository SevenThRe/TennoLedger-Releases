use crate::world::Notice;
use tauri::{Emitter, Manager};
pub struct ClientDiagnostics {
    pub ready: std::sync::atomic::AtomicBool,
    path: std::path::PathBuf,
    lock: std::sync::Mutex<()>,
}
impl ClientDiagnostics {
    pub fn new(dir: &std::path::Path) -> Self {
        Self {
            ready: std::sync::atomic::AtomicBool::new(false),
            path: dir.join(format!("notification-trace-{}.jsonl", std::process::id())),
            lock: std::sync::Mutex::new(()),
        }
    }
    pub fn record(&self, event: serde_json::Value) {
        use std::io::Write;
        if let Ok(_lock) = self.lock.lock() {
            if let Ok(mut file) = std::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(&self.path)
            {
                if file.metadata().is_ok_and(|m| m.len() > 512 * 1024) {
                    let _ = file.set_len(0);
                }
                let row = serde_json::json!({"time":chrono::Utc::now().to_rfc3339(),"pid":std::process::id(),"event":event});
                let _ = writeln!(file, "{}", row);
            }
        }
    }
}
#[derive(serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientTrace {
    pub stage: String,
    pub id: Option<String>,
    pub visible: bool,
    pub focused: bool,
    pub width: Option<f64>,
    pub height: Option<f64>,
    pub x: Option<f64>,
    pub y: Option<f64>,
    pub viewport_width: Option<f64>,
    pub viewport_height: Option<f64>,
    pub hit_visible: Option<bool>,
}
#[tauri::command]
pub fn world_notification_trace(
    trace: ClientTrace,
    state: tauri::State<ClientDiagnostics>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    if !["ready", "received", "rendered", "dismissed"].contains(&trace.stage.as_str())
        || trace.id.as_ref().is_some_and(|id| id.len() > 256)
    {
        return Err("提醒诊断字段无效".into());
    }
    if trace.stage == "ready" {
        state.ready.store(true, std::sync::atomic::Ordering::SeqCst);
    }
    let mut event = serde_json::to_value(trace).map_err(|e| e.to_string())?;
    if let Some(window) = app.get_webview_window("main") {
        let position = window.outer_position().ok();
        let size = window.outer_size().ok();
        let monitor = window.current_monitor().ok().flatten();
        event["window"] = serde_json::json!({"x":position.map(|p|p.x),"y":position.map(|p|p.y),"width":size.map(|s|s.width),"height":size.map(|s|s.height),"scale":window.scale_factor().ok(),"monitorWorkArea":monitor.map(|m|serde_json::json!({"x":m.work_area().position.x,"y":m.work_area().position.y,"width":m.work_area().size.width,"height":m.work_area().size.height}))});
    }
    state.record(event);
    Ok(())
}
pub fn deliver(app: &tauri::AppHandle, notice: &Notice) -> Result<(), String> {
    if let Some(service)=app.try_state::<std::sync::Arc<crate::world::WorldService>>(){return service.deliver_notice(app,notice);}
    // Neither channel depends on the other. Include native failures in the event
    // itself so the visible toast and persisted history report the same result.
    let mut outgoing = notice.clone();
    outgoing.delivery_error = native(app, notice).err();
    if let Some(diagnostics) = app.try_state::<ClientDiagnostics>() {
        diagnostics.record(serde_json::json!({"stage":"native-send","id":notice.id,"error":outgoing.delivery_error,"environment":environment()}));
    }
    if app.emit("world-notification", &outgoing).is_err() {
        let prefix = outgoing
            .delivery_error
            .take()
            .map(|s| s + "；")
            .unwrap_or_default();
        outgoing.delivery_error = Some(prefix + "应用内通知发送失败");
    }
    outgoing.delivery_error.map_or(Ok(()), Err)
}
pub fn initialize(app: &tauri::AppHandle) {
    #[cfg(windows)]
    if let Err(error) = crate::toolkit_toast::register(app) {
        if let Some(state) = app.try_state::<ClientDiagnostics>() {
            state.record(serde_json::json!({"stage":"toast-register-failed","error":error}));
        }
    }
    #[cfg(not(windows))]
    let _ = app;
}
pub fn environment() -> String {
    #[cfg(windows)]
    {
        match unsafe { ::windows::Win32::UI::Shell::SHQueryUserNotificationState() }.map(|s| s.0) {
            Ok(1) => "not-present",
            Ok(2) => "busy",
            Ok(3) => "d3d-fullscreen",
            Ok(4) => "presentation",
            Ok(5) => "accepts-notifications",
            Ok(6) => "quiet-time",
            Ok(7) => "windows-store-app",
            _ => "unknown",
        }
        .into()
    }
    #[cfg(not(windows))]
    {
        "unsupported-platform".into()
    }
}
#[cfg(not(windows))]
fn native(_: &tauri::AppHandle, _: &Notice) -> Result<(), String> {
    Err("此平台未配置系统通知".into())
}
#[cfg(windows)]
fn native(app: &tauri::AppHandle, notice: &Notice) -> Result<(), String> {
    crate::toolkit_toast::send(app, notice)
}
pub fn cleanup(app: &tauri::AppHandle) {
    #[cfg(windows)]
    crate::toolkit_toast::shutdown(app);
    #[cfg(not(windows))]
    let _ = app;
}

#[derive(Clone,serde::Serialize,serde::Deserialize)]
#[serde(rename_all="camelCase",default)]
pub struct DeliverySettings{
 pub windows_enabled:bool,pub sound_enabled:bool,pub only_background_game:bool,pub webhook_enabled:bool,pub webhook_configured:bool,pub message_template:String,
 pub conversation_enabled:bool,pub conversation_template:String,pub wfm_message_template:String,
 #[serde(skip_serializing)]pub webhook_url:String,
 #[serde(skip_serializing)]pub clear_webhook:bool,
}
impl std::fmt::Debug for DeliverySettings{fn fmt(&self,f:&mut std::fmt::Formatter<'_>)->std::fmt::Result{f.debug_struct("DeliverySettings").field("windows_enabled",&self.windows_enabled).field("webhook_enabled",&self.webhook_enabled).field("webhook_configured",&self.webhook_configured).finish_non_exhaustive()}}
impl Default for DeliverySettings{fn default()->Self{Self{windows_enabled:true,sound_enabled:true,only_background_game:true,webhook_enabled:false,webhook_configured:false,message_template:"{body}".into(),conversation_enabled:true,conversation_template:"收到来自 <PLAYER_NAME> 的新游戏会话".into(),wfm_message_template:"新 Warframe.market 消息：<WFM_MESSAGE>".into(),webhook_url:String::new(),clear_webhook:false}}}
pub fn valid_webhook(value:&str)->bool{
 if value.len()>2048{return false;}
 let Ok(url)=reqwest::Url::parse(value)else{return false;};
 let parts:Vec<_>=url.path().split('/').filter(|p|!p.is_empty()).collect();
 url.scheme()=="https"&&url.host_str()==Some("discord.com")&&url.port().is_none()&&url.username().is_empty()&&url.password().is_none()&&url.query().is_none()&&url.fragment().is_none()&&parts.len()==4&&parts[0]=="api"&&parts[1]=="webhooks"&&!parts[2].is_empty()&&parts[2].bytes().all(|b|b.is_ascii_digit())&&!parts[3].is_empty()&&parts[3].len()<=256&&parts[3].bytes().all(|b|b.is_ascii_alphanumeric()||b"_-".contains(&b))
}
pub fn validate_delivery(settings:&DeliverySettings)->Result<(),String>{
 for template in [&settings.message_template,&settings.conversation_template,&settings.wfm_message_template]{if template.len()>6000||template.chars().count()>1500||template.chars().any(|c|c.is_control()&&c!='\n'&&c!='\t'){return Err("消息模板无效或超过1500字符".into());}}if settings.message_template.is_empty(){return Err("世界消息模板不能为空".into());}
 if !settings.webhook_url.is_empty()&&!valid_webhook(&settings.webhook_url){return Err("请输入有效的 Discord Webhook HTTPS 地址".into());}Ok(())
}
// Resolve before applying a custom message template, which may omit the tier.
pub fn notice_icon(notice: &Notice) -> &'static str {
    match notice.kind.as_str() {
        "arbitration" => "vitus",
        "fissure" => notice.body.split('·').find_map(|part| match part.trim().to_ascii_lowercase().as_str() {
            "lith" => Some("lith"), "meso" => Some("meso"), "neo" => Some("neo"),
            "axi" => Some("axi"), "requiem" => Some("requiem"), "omnia" => Some("omnia"),
            _ => None,
        }).unwrap_or("app"),
        _ => "app",
    }
}
pub fn render_message(settings:&DeliverySettings,notice:&Notice)->String{if notice.kind=="conversation"{notice.body.chars().take(1900).collect()}else{settings.message_template.replace("{title}",&notice.title).replace("{body}",&notice.body).replace("{kind}",&notice.kind).chars().take(1900).collect()}}
fn configured_mentions(settings:&DeliverySettings,notice:&Notice)->serde_json::Value{
 let template=if notice.kind=="conversation"{&settings.conversation_template}else{&settings.message_template};
 let mut users=std::collections::BTreeSet::new();let mut roles=std::collections::BTreeSet::new();
 let mentions=regex::Regex::new(r"<@([!&]?)([0-9]{1,24})>").unwrap();for capture in mentions.captures_iter(template){if &capture[1]=="&"{if roles.len()<100{roles.insert(capture[2].to_owned());}}else if users.len()<100{users.insert(capture[2].to_owned());}}
 // Only literal mentions in the user-saved template are authorized; event text
 // (including a future WFM message) can never opt itself into pinging anyone.
 serde_json::json!({"parse":if template.contains("@everyone")||template.contains("@here"){vec!["everyone"]}else{vec![]},"users":users,"roles":roles})
}
pub fn external_allowed(settings:&DeliverySettings,foreground:Option<bool>)->bool{!settings.only_background_game||foreground!=Some(true)}
pub fn game_foreground()->Option<bool>{
 #[cfg(windows)]{let pid=crate::helper_inventory::game_pid()?;#[link(name="user32")]extern "system"{fn GetForegroundWindow()->*mut std::ffi::c_void;fn GetWindowThreadProcessId(window:*mut std::ffi::c_void,pid:*mut u32)->u32;}let mut foreground=0;unsafe{GetWindowThreadProcessId(GetForegroundWindow(),&mut foreground);};if foreground==0{None}else{Some(foreground==pid)}}
 #[cfg(not(windows))]{None}
}
pub fn notification_game_foreground()->bool{game_foreground()==Some(true)}
pub fn policy_state(settings:&DeliverySettings)->String{
 if settings.only_background_game&&notification_game_foreground(){return "foreground-suppressed".into();}
 if !settings.windows_enabled&&!settings.webhook_enabled{return "in-app-only".into();}environment()
}
// An in-app/game-window channel remains independent of external notification policy.
fn configured_channels(notice:&Notice,settings:&DeliverySettings,foreground:Option<bool>,endpoint:Option<&str>,test:bool,mut system:impl FnMut(&Notice,bool)->Result<(),String>,mut webhook:impl FnMut(&str,&str)->Result<(),String>,mut in_app:impl FnMut(&Notice)->Result<(),String>)->Result<(),String>{
 let mut outgoing=notice.clone();outgoing.body=render_message(settings,notice);let mut failures=vec![];
 if external_allowed(settings,foreground){
  if settings.windows_enabled{if let Err(error)=system(&outgoing,settings.sound_enabled){failures.push(error);}}
  // Test notices are never sent through external Webhooks.
  if settings.webhook_enabled&&!test{if let Some(endpoint)=endpoint.filter(|value|valid_webhook(value)){if webhook(endpoint,&outgoing.body).is_err(){failures.push("Discord 通知投递失败".into());}}else{failures.push("Discord 渠道未配置或密钥不可用".into());}}
 }
 outgoing.delivery_error=if failures.is_empty(){None}else{Some(failures.join("；"))};
 if let Err(error)=in_app(&outgoing){failures.push(error);}
 if failures.is_empty(){Ok(())}else{Err(failures.join("；"))}
}
fn notice_scope<'a>(notice:&Notice,current:&'a str)->Option<&'a str>{
 if !notice_visible(&notice.id,current){return None;}
 Some(current)
}
pub fn notice_visible(id:&str,current:&str)->bool{for prefix in ["riven-monitor:","conversation:"]{if let Some(rest)=id.strip_prefix(prefix){return rest.split_once(':').is_some_and(|(scope,_)|scope==current);}}true}
pub fn deliver_configured(app:&tauri::AppHandle,notice:&Notice,settings:&DeliverySettings,endpoint:Option<&str>,test:bool)->Result<(),String>{
 // Capture scope before potentially slow channel delivery; never stamp an old
 // account's notice with a new account after the HTTP call returns.
 let scope=app.try_state::<crate::AppState>().and_then(|state|state.0.lock().ok().and_then(|db|db.active_scope().ok())).filter(|scope|notice_scope(notice,scope).is_some());
 if matches!(notice.kind.as_str(),"conversation"|"riven-monitor")&&scope.is_none(){return Err("账户已切换，已取消旧账户提醒".into());}
 configured_channels(notice,settings,game_foreground(),endpoint,test,
  |outgoing,sound|native_with_sound(app,outgoing,sound,notice_icon(notice)),
  |endpoint,body|reqwest::blocking::Client::builder().no_proxy().timeout(std::time::Duration::from_secs(8)).redirect(reqwest::redirect::Policy::none()).build().map_err(|_|String::new()).and_then(|client|client.post(endpoint).json(&serde_json::json!({"content":body,"allowed_mentions":configured_mentions(settings,notice)})).send().map_err(|_|String::new()).and_then(|response|if response.status().is_success(){Ok(())}else{Err(String::new())})),
  |outgoing|{let mut errors=vec![];if app.emit("world-notification",outgoing).is_err(){errors.push("应用内通知发送失败");}
   if !test{if let (Some(scope),Some(overlays))=(scope.as_deref(),app.try_state::<std::sync::Arc<crate::overlays::Service>>()){
    let payload=serde_json::json!({"accountScope":scope,"capturedAt":outgoing.created_at,"id":outgoing.id,"noticeKind":outgoing.kind,"title":outgoing.title,"body":outgoing.body});
    if overlays.show(app,"game-notification",payload,false).is_err(){errors.push("游戏内提醒发送失败");}
   }}
   if errors.is_empty(){Ok(())}else{Err(errors.join("；"))}
  })
}
#[cfg(windows)]fn native_with_sound(app:&tauri::AppHandle,notice:&Notice,sound:bool,icon:&str)->Result<(),String>{crate::toolkit_toast::send_with_sound(app,notice,sound,icon)}
#[cfg(not(windows))]fn native_with_sound(app:&tauri::AppHandle,notice:&Notice,_:bool,_:&str)->Result<(),String>{native(app,notice)}

// The URL contains a credential. Persist only user-bound DPAPI ciphertext, never
// the full URL in settings/cache/UI diagnostics or public snapshots.
#[cfg(windows)]fn credential(bytes:&[u8],decrypt:bool)->Result<Vec<u8>,String>{
 #[repr(C)]struct Blob{len:u32,bytes:*mut u8}
 #[link(name="crypt32")]extern "system"{fn CryptProtectData(input:*const Blob,description:*const u16,entropy:*const Blob,reserved:*mut std::ffi::c_void,prompt:*mut std::ffi::c_void,flags:u32,output:*mut Blob)->i32;fn CryptUnprotectData(input:*const Blob,description:*mut *mut u16,entropy:*const Blob,reserved:*mut std::ffi::c_void,prompt:*mut std::ffi::c_void,flags:u32,output:*mut Blob)->i32;}
 #[link(name="kernel32")]extern "system"{fn LocalFree(value:*mut std::ffi::c_void)->*mut std::ffi::c_void;}
 let input=Blob{len:bytes.len() as u32,bytes:bytes.as_ptr() as *mut u8};let mut output=Blob{len:0,bytes:std::ptr::null_mut()};
 let success=unsafe{if decrypt{CryptUnprotectData(&input,std::ptr::null_mut(),std::ptr::null(),std::ptr::null_mut(),std::ptr::null_mut(),1,&mut output)}else{CryptProtectData(&input,std::ptr::null(),std::ptr::null(),std::ptr::null_mut(),std::ptr::null_mut(),1,&mut output)}};
 if success==0{return Err("系统密钥保护不可用，未保存 Webhook".into());}
 let result=unsafe{std::slice::from_raw_parts(output.bytes,output.len as usize).to_vec()};unsafe{LocalFree(output.bytes.cast());}Ok(result)
}
#[cfg(not(windows))]fn credential(_: &[u8],_:bool)->Result<Vec<u8>,String>{Err("此平台尚未配置安全密钥存储".into())}
pub fn protect_webhook(url:&str)->Result<String,String>{if !valid_webhook(url){return Err("Webhook 地址无效".into());}Ok(credential(url.as_bytes(),false)?.iter().map(|b|format!("{b:02x}")).collect())}
pub fn reveal_webhook(cipher:&str)->Result<String,String>{if cipher.len()>16000||cipher.len()%2!=0||!cipher.bytes().all(|c|c.is_ascii_hexdigit()){return Err("密钥记录无效".into());}let bytes:Vec<u8>=(0..cipher.len()).step_by(2).map(|i|u8::from_str_radix(&cipher[i..i+2],16).map_err(|_|"密钥记录无效")).collect::<Result<_,_>>()?;String::from_utf8(credential(&bytes,true)?).map_err(|_|"密钥无法读取".into())}

#[cfg(test)]mod preferences_tests{
 use super::*;
 #[test]fn notification_art_uses_vitus_and_the_exact_relic_tier_before_template_rendering(){
  let mut notice=sample_notice();notice.kind="arbitration".into();assert_eq!(notice_icon(&notice),"vitus");
  notice.kind="fissure".into();
  for tier in ["lith","meso","neo","axi","requiem","omnia"]{
   notice.body=format!("节点 · Survival · {}",tier.to_uppercase());assert_eq!(notice_icon(&notice),tier);
   let mut settings=DeliverySettings::default();settings.message_template="{title}".into();
   configured_channels(&notice,&settings,None,None,false,|outgoing,_|{assert_eq!(outgoing.body,"Title");assert_eq!(notice_icon(&notice),tier);Ok(())},|_,_|panic!("no webhook"),|_|Ok(())).unwrap();
  }
  notice.body="Unknown · Survival · ?".into();assert_eq!(notice_icon(&notice),"app");notice.kind="conversation".into();assert_eq!(notice_icon(&notice),"app");
 }
 #[test]fn notification_defaults_templates_and_background_policy_preserve_channel_choices(){let mut s=DeliverySettings::default();assert!(s.windows_enabled);assert!(s.sound_enabled);assert!(s.only_background_game);assert!(s.conversation_enabled);assert!(!s.webhook_enabled);let notice=Notice{id:"n".into(),title:"Title".into(),body:"Body".into(),kind:"reward".into(),created_at:"2026-10-25T00:00:00Z".into(),delivery_error:None,system_state:None};assert_eq!(render_message(&s,&notice),"Body");s.message_template="{title}: {body} [{kind}]".into();assert_eq!(render_message(&s,&notice),"Title: Body [reward]");s.only_background_game=true;assert!(!external_allowed(&s,Some(true)));assert!(external_allowed(&s,None));assert!(external_allowed(&s,Some(false)));s.only_background_game=false;assert!(external_allowed(&s,None));}
 #[test]fn webhook_validation_rejects_redirect_hosts_and_never_serializes_or_debugs_credentials(){let endpoint="https://discord.com/api/webhooks/0000000000/synthetic_private_token";assert!(valid_webhook(endpoint));for url in ["http://discord.com/api/webhooks/1/token","https://discord.com.evil.example/api/webhooks/1/token","https://discord.com@evil.example/api/webhooks/1/token","https://discord.com/api/webhooks/1/token?forward=1","https://localhost/api/webhooks/1/token"]{assert!(!valid_webhook(url));}let mut s=DeliverySettings::default();s.webhook_url=endpoint.into();assert!(!serde_json::to_string(&s).unwrap().contains("synthetic_private_token"));assert!(!format!("{s:?}").contains("synthetic_private_token"));assert!(reveal_webhook("你好").is_err());}
 #[cfg(windows)]#[test]fn user_bound_credential_roundtrip_keeps_url_out_of_persisted_text(){let endpoint="https://discord.com/api/webhooks/0000000000/synthetic_private_token";let protected=protect_webhook(endpoint).unwrap();assert!(!protected.contains("synthetic_private_token"));assert_eq!(reveal_webhook(&protected).unwrap(),endpoint);assert!(reveal_webhook("0000").is_err());}
 fn sample_notice()->Notice{Notice{id:"sample".into(),title:"Title".into(),body:"Body".into(),kind:"reward".into(),created_at:"2026-10-25T00:00:00Z".into(),delivery_error:None,system_state:None}}
 #[test]fn background_policy_suppresses_external_channels_without_dropping_in_app(){let calls=std::cell::RefCell::new(vec![]);let mut settings=DeliverySettings::default();settings.only_background_game=true;settings.webhook_enabled=true;configured_channels(&sample_notice(),&settings,Some(true),Some("https://discord.com/api/webhooks/1/synthetic"),false,|_,_|{calls.borrow_mut().push("windows");Ok(())},|_,_|{calls.borrow_mut().push("webhook");Ok(())},|_|{calls.borrow_mut().push("in-app");Ok(())}).unwrap();assert_eq!(*calls.borrow(),vec!["in-app"]);}
 #[test]fn test_and_disabled_channels_keep_application_receipts_without_webhook_sends(){let calls=std::cell::RefCell::new(vec![]);let mut settings=DeliverySettings::default();settings.windows_enabled=false;settings.webhook_enabled=true;configured_channels(&sample_notice(),&settings,None,None,true,|_,_|panic!("must not send system notice"),|_,_|panic!("must not send webhook"),|_|{calls.borrow_mut().push("in-app");Ok(())}).unwrap();assert_eq!(*calls.borrow(),vec!["in-app"]);}
 #[test]fn channel_failures_do_not_block_other_channels_or_expose_webhook_credentials(){let calls=std::cell::RefCell::new(vec![]);let mut settings=DeliverySettings::default();settings.webhook_enabled=true;settings.sound_enabled=false;settings.only_background_game=false;let error=configured_channels(&sample_notice(),&settings,None,Some("https://discord.com/api/webhooks/1/synthetic_private_token"),false,|_,sound|{assert!(!sound);calls.borrow_mut().push("windows");Err("System failed".into())},|_,_|{calls.borrow_mut().push("webhook");Err("must-not-echo-endpoint".into())},|notice|{assert!(notice.delivery_error.as_deref().unwrap().contains("System failed"));calls.borrow_mut().push("in-app");Ok(())}).unwrap_err();assert_eq!(*calls.borrow(),vec!["windows","webhook","in-app"]);assert!(!error.contains("synthetic_private_token"));assert!(!error.contains("must-not-echo-endpoint"));}
 #[test]fn riven_game_notice_never_binds_a_previous_account_to_current_scope(){let mut notice=sample_notice();notice.id="riven-monitor:scope-A:receipt".into();assert_eq!(notice_scope(&notice,"scope-A"),Some("scope-A"));assert_eq!(notice_scope(&notice,"scope-B"),None);notice.id="cycle:earth:next".into();assert_eq!(notice_scope(&notice,"scope-B"),Some("scope-B"));}

 #[test]fn only_saved_template_mentions_can_ping_not_incoming_event_content(){let mut settings=DeliverySettings::default();let mut notice=sample_notice();notice.body="@everyone <@1234> <@&5678>".into();assert_eq!(configured_mentions(&settings,&notice),serde_json::json!({"parse":[],"users":[],"roles":[]}));settings.conversation_template="<@1234> <@&5678> @here <PLAYER_NAME>".into();notice.kind="conversation".into();assert_eq!(configured_mentions(&settings,&notice),serde_json::json!({"parse":["everyone"],"users":["1234"],"roles":["5678"]}));assert_eq!(render_message(&settings,&notice),notice.body);}

 #[test]fn original_defaults_apply_only_to_missing_preferences_and_keep_saved_opt_out(){let empty:DeliverySettings=serde_json::from_str("{}").unwrap();assert!(empty.windows_enabled);assert!(empty.only_background_game);assert!(empty.conversation_enabled);let saved:DeliverySettings=serde_json::from_str(r#"{"windowsEnabled":false,"onlyBackgroundGame":false,"conversationEnabled":false}"#).unwrap();assert!(!saved.windows_enabled);assert!(!saved.only_background_game);assert!(!saved.conversation_enabled);let reloaded:DeliverySettings=serde_json::from_str(&serde_json::to_string(&saved).unwrap()).unwrap();assert!(!reloaded.only_background_game);assert!(!reloaded.conversation_enabled);}

 #[test]fn missing_game_is_not_foreground_and_does_not_suppress_world_reminders(){let settings=DeliverySettings::default();assert!(external_allowed(&settings,None));assert!(external_allowed(&settings,Some(false)));assert!(!external_allowed(&settings,Some(true)));let calls=std::cell::RefCell::new(vec![]);configured_channels(&sample_notice(),&settings,None,None,false,|_,_|{calls.borrow_mut().push("windows");Ok(())},|_,_|panic!("unconfigured webhook"),|_|{calls.borrow_mut().push("in-app");Ok(())}).unwrap();assert_eq!(*calls.borrow(),vec!["windows","in-app"]);}

}

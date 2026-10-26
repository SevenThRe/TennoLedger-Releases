use crate::{collection, AppState};
use serde::{Deserialize, Serialize};
use std::{collections::{BTreeSet,BTreeMap}, io::{BufRead, BufReader}, path::PathBuf, process::{Child, Command, Stdio}, sync::{Arc, Mutex}};
use tauri::{Emitter, Manager};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub enabled: bool,
    pub running: bool,
    pub code: String,
    pub account_code: String,
    pub inventory_source: Option<String>,
    pub scan_code: String,
    pub last_read_at: Option<String>,
    pub scan: serde_json::Value,
    pub last_inventory_at: Option<String>,
    pub observed_items: usize,
    pub last_relic: Option<serde_json::Value>,
}
#[derive(Clone)]
struct CaptureBinding { scope:String, epoch:u64, started_at:String }
struct Runtime { refresh_requested:bool, child: Option<Child>, helper_active:bool, generation: u64, account_generation:u64, scope_epoch:u64, live_scope:Option<String>, captures:BTreeMap<String,CaptureBinding>, last_live_read: Option<std::time::Instant>, status: Status }
impl Runtime {
 fn token(&self)->(u64,u64){(self.generation,self.account_generation)}
 fn request_current(&self,token:(u64,u64))->bool{self.status.enabled&&self.token()==token}
 fn invalidate_account(&mut self){self.account_generation+=1;self.scope_epoch+=1;self.live_scope=None;self.captures.clear();self.last_live_read=None;self.status.last_read_at=None;self.status.last_inventory_at=None;self.status.inventory_source=None;self.status.last_relic=None;self.status.observed_items=0;self.status.account_code="waiting-data".into();self.status.scan_code="waiting-data".into();self.refresh_requested=true;}
 fn capture_start(&mut self,id:&str,started:&str,active:&str){
  if id.is_empty()||id.len()>80||!id.bytes().all(|c|c.is_ascii_alphanumeric()||b":-_".contains(&c)){return;}
  let Ok(time)=chrono::DateTime::parse_from_rfc3339(started) else{return;};
  let age=chrono::Utc::now().signed_duration_since(time).num_seconds();if !(-2..=120).contains(&age){return;}
  if self.live_scope.as_deref()!=Some(active)||!crate::account_scope::valid(active){return;}
  if self.captures.len()>=64{self.captures.clear();}
  self.captures.insert(id.into(),CaptureBinding{scope:active.into(),epoch:self.scope_epoch,started_at:started.into()});
 }
 fn capture_result(&self,id:&str,active:&str)->Option<CaptureBinding>{
  self.captures.get(id).filter(|b|b.epoch==self.scope_epoch&&b.scope==active&&self.live_scope.as_deref()==Some(b.scope.as_str())).cloned()
 }
}
#[derive(Clone)]
pub struct Collector(Arc<Mutex<Runtime>>);
impl Default for Collector {
    fn default() -> Self { Self(Arc::new(Mutex::new(Runtime { refresh_requested:false, child: None, helper_active:false, generation: 0, account_generation:0,scope_epoch:0,live_scope:None,captures:BTreeMap::new(),last_live_read:None, status: Status {enabled:false,running:false,code:"stopped".into(),account_code:"waiting-data".into(),inventory_source:None,scan_code:"waiting-data".into(),last_read_at:None,scan:serde_json::json!({}),last_inventory_at:None,observed_items:0,last_relic:None} }))) }
}
#[derive(Deserialize)]
#[serde(rename_all="camelCase")]
struct Observation { item_id: String, quantity: u64 }
#[derive(Deserialize)]
#[serde(rename_all="camelCase")]
struct InventoryEvent { schema_version: u32, captured_at: String, observations: Vec<Observation> }

// Preserve only the name, never stale balances, and never borrow across account scopes.
fn retain_known_player_name(old:Option<&collection::Snapshot>,snapshot:&mut collection::Snapshot){
    let Some(old)=old.filter(|old|snapshot.account_scope.is_some()&&old.account_scope==snapshot.account_scope) else{return;};
    let Some(name)=old.player_profile.as_ref().and_then(|profile|profile.name.as_ref()).filter(|name|!name.trim().is_empty()) else{return;};
    let profile=snapshot.player_profile.get_or_insert_with(Default::default);
    if profile.name.as_ref().is_none_or(|value|value.trim().is_empty()){profile.name=Some(name.clone());}
}

// Screen observations are absolute counts, never deltas or a complete inventory.
fn merge_inventory(old: Option<collection::Snapshot>, input: &str, catalog: &collection::Catalog) -> Result<collection::Snapshot,String> {
    if old.as_ref().is_some_and(|snapshot|snapshot.account_scope.is_some()){return Err("unknown-account-observation".into());}
    let e:InventoryEvent=serde_json::from_str(input).map_err(|_|"invalid-event")?;
    let date=chrono::DateTime::parse_from_rfc3339(&e.captured_at).map_err(|_|"invalid-time")?;
    let age=chrono::Utc::now().signed_duration_since(date);
    if e.schema_version!=1 || e.observations.is_empty() || e.observations.len()>1000 || age.num_seconds() < -120 || age.num_minutes()>10 { return Err("invalid-observation".into()); }
    let known:BTreeSet<_>=catalog.items.iter().map(|i|i.id.as_str()).collect();
    let mut seen=BTreeSet::new();
    for o in &e.observations { if !known.contains(o.item_id.as_str()) || o.quantity>1_000_000_000 || !seen.insert(o.item_id.as_str()) { return Err("invalid-item-count".into()); } }
    let mut s=old.unwrap_or_default();
    if !s.captured_at.is_empty() && chrono::DateTime::parse_from_rfc3339(&s.captured_at).is_ok_and(|t|t>date) { return Err("stale-observation".into()); }
    s.schema_version=1; s.captured_at=e.captured_at; s.source="screen-ocr".into(); s.complete=false;
    for o in e.observations { s.counts.insert(o.item_id,o.quantity); }
    collection::validate(&s,catalog)?; Ok(s)
}
impl Collector {
    pub fn arbitration_binding(&self)->Option<(String,u64)>{let r=self.0.lock().ok()?;if !r.status.enabled{return None;}r.live_scope.clone().map(|scope|(scope,r.scope_epoch))}
    pub fn select_account(&self,app:&tauri::AppHandle,scope:&str,expected:Option<&str>)->Result<Option<collection::Snapshot>,String>{
        // Same lock order as apply_account: selection and helper invalidation are atomic.
        let mut r=self.0.lock().map_err(|_|"采集状态锁错误")?;
        let state=app.state::<AppState>();let db=state.0.lock().map_err(|_|"数据库锁错误")?;
        db.require_expected_scope(expected)?;let snapshot=db.load_collection_for_scope(Some(scope))?;db.select_account(scope)?;
        r.invalidate_account();
        if let Some(s)=&snapshot{r.status.inventory_source=Some(s.source.clone());r.status.last_inventory_at=Some(s.captured_at.clone());r.status.observed_items=s.counts.len();r.status.account_code="saved".into();}
        let _=app.emit("ledger-updated",());let _=app.emit("collection-updated",());let _=app.emit("collector-updated",&r.status);Ok(snapshot)
    }
    pub fn mutate_account_storage<T>(&self,app:&tauri::AppHandle,expected:Option<&str>,action:impl FnOnce(&mut crate::store::Store)->Result<T,String>)->Result<T,String>{
        let mut r=self.0.lock().map_err(|_|"采集状态锁错误")?;let state=app.state::<AppState>();let mut db=state.0.lock().map_err(|_|"数据库锁错误")?;
        db.require_expected_scope(expected)?;let before=db.active_scope()?;let result=action(&mut db)?;
        if before!=db.active_scope()?{r.invalidate_account();if let Some(s)=db.load_collection()?{r.status.inventory_source=Some(s.source);r.status.last_inventory_at=Some(s.captured_at);r.status.observed_items=s.counts.len();r.status.account_code="saved".into();}let _=app.emit("collector-updated",&r.status);}
        Ok(result)
    }
    pub fn restore(&self,snapshot:&collection::Snapshot){let mut r=self.0.lock().unwrap_or_else(|e|e.into_inner());r.status.inventory_source=Some(snapshot.source.clone());r.status.last_inventory_at=Some(snapshot.captured_at.clone());r.status.observed_items=snapshot.counts.len();r.status.account_code=if snapshot.source=="alecaframe-cache"{"cached"}else{"saved"}.into();}
    pub fn watch_account(&self,app:&tauri::AppHandle) {
        let this=self.clone();let app=app.clone();
        std::thread::spawn(move||{
            let Ok(catalog)=collection::catalog() else{return;};
            let mut cache_stamp=None;
            let mut helper=crate::helper_inventory::Client::new();
            let mut signals=crate::account_signals::Tail::default();
            let log_path=std::env::var_os("LOCALAPPDATA").map(PathBuf::from).unwrap_or_default().join("Warframe/EE.log");
            let mut last_attempt:Option<std::time::Instant>=None;
            let mut due=std::time::Instant::now();
            let mut previous_pid=None;
            loop {
                std::thread::sleep(std::time::Duration::from_secs(1));
                if !this.status().enabled {helper.reset();signals=Default::default();previous_pid=None;due=std::time::Instant::now();continue;}
                if let Some(local)=std::env::var_os("LOCALAPPDATA") {
                    let path=PathBuf::from(local).join("AlecaFrame/lastData.dat");
                    if let Ok(meta)=std::fs::metadata(&path) {
                        if let Ok(stamp)=meta.modified() {
                            if cache_stamp!=Some(stamp) {
                                cache_stamp=Some(stamp);
                                let token=this.0.lock().unwrap_or_else(|e|e.into_inner()).token();
                                if let Ok(value)=crate::inventory_data::read_cache(&path) {
                                    let time:chrono::DateTime<chrono::Utc>=stamp.into();
                                    this.apply_account(&app,&catalog,&value,"alecaframe-cache",&time.to_rfc3339(),token);
                                }
                            }
                        }
                    }
                }
                let pid=crate::helper_inventory::game_pid();
                if pid!=previous_pid {helper.reset();signals=Default::default();due=std::time::Instant::now();previous_pid=pid;}
                let event=signals.poll(&log_path);
                if event.login {helper.reset();this.0.lock().unwrap_or_else(|e|e.into_inner()).invalidate_account();}
                let requested={let mut r=this.0.lock().unwrap_or_else(|e|e.into_inner());std::mem::take(&mut r.refresh_requested)};
                if event.refresh || requested {
                    let mut trigger=std::time::Instant::now()+std::time::Duration::from_secs(2);
                    if let Some(last)=last_attempt {trigger=trigger.max(last+std::time::Duration::from_secs(15));}
                    due=due.min(trigger);
                }
                if pid.is_none() {
                    helper.reset();
                    let mut r=this.0.lock().unwrap_or_else(|e|e.into_inner());
                    r.last_live_read=None;r.live_scope=None;r.captures.clear();r.scope_epoch+=1;r.status.scan_code="game-not-running".into();
                    r.status.account_code=if r.status.inventory_source.as_deref()==Some("alecaframe-cache"){"cached"}else if r.status.inventory_source.is_some(){"saved"}else{"game-not-running"}.into();
                    let _=app.emit("collector-updated",&r.status);continue;
                }
                if std::time::Instant::now()<due {continue;}
                last_attempt=Some(std::time::Instant::now());
                let generation={let mut r=this.0.lock().unwrap_or_else(|e|e.into_inner());r.helper_active=true;r.status.scan_code="helper-fetching".into();let _=app.emit("collector-updated",&r.status);r.token()};
                let cancelled=||{let r=this.0.lock().unwrap_or_else(|e|e.into_inner());!r.request_current(generation)};
                let login_before=crate::player_identity::read(&log_path);
                let result=crate::helper_inventory::resolve_executable().ok_or_else(||"helper-missing".to_string()).and_then(|exe|helper.refresh(&exe,pid.unwrap(),cancelled));
                if cancelled(){this.0.lock().unwrap_or_else(|e|e.into_inner()).helper_active=false;continue;}
                let accepted=match result {
                    Ok(mut value)=>{
                        let now=chrono::Utc::now().to_rfc3339();
                        let scope=crate::account_scope::from_value(&value).ok().flatten();
                        let previous=app.state::<AppState>().0.lock().ok().and_then(|db|db.load_collection_for_scope(scope.as_deref()).ok().flatten()).and_then(|s|s.vendors).unwrap_or_default();
                        let mut vendors=Vec::new();
                        for (id,manifest) in collection::vendor_data::MANIFESTS {
                            if cancelled(){break;}
                            let old=previous.iter().find(|v|v.id==id);
                            let fresh=old.is_some_and(|v|v.error.is_none()&&chrono::DateTime::parse_from_rfc3339(&v.captured_at).is_ok_and(|t|chrono::Utc::now().signed_duration_since(t).num_seconds()<900)&&v.expiry.as_ref().and_then(|s|chrono::DateTime::parse_from_rfc3339(s).ok()).is_some_and(|t|t>chrono::Utc::now()));
                            if fresh {vendors.push(old.unwrap().clone());continue;}
                            let next=helper.vendor_info(manifest,cancelled).and_then(|raw|collection::vendor_data::normalize(id,&raw,&now));
                            vendors.push(match next {Ok(v)=>v,Err(error)=>{let mut v=old.cloned().unwrap_or_else(||collection::VendorSnapshot{id:id.into(),captured_at:now.clone(),..Default::default()});v.error=Some(error);v}});
                        }
                        if cancelled()||crate::account_scope::from_value(&value).is_err(){false}else{
                            let verified_account=value.get("AccountId").cloned();
                            // The helper normally returns unwrapped inventory; support both legacy envelopes too.
                            for key in ["InventoryJSON","InventoryJson"] {if value[key].is_object(){value=value[key].take();break;}if let Some(text)=value[key].as_str(){if let Ok(inner)=serde_json::from_str::<serde_json::Value>(text){value=inner;}break;}}
                            if let Some(account)=verified_account{value["AccountId"]=account;}
                            let login_after=crate::player_identity::read(&log_path);
                            if login_before!=login_after {false}else{
                                if let Some(identity)=login_after {if value["DisplayName"].as_str().is_none_or(|name|name.trim().is_empty()){value["DisplayName"]=serde_json::Value::String(identity.name);}}
                                value["MyFrameVendors"]=serde_json::to_value(vendors).unwrap_or_default();
                                this.apply_account(&app,&catalog,&value,"warframe-api-helper",&now,generation)
                            }
                        }
                    },
                    Err(ref code)=>{let mut r=this.0.lock().unwrap_or_else(|e|e.into_inner());r.status.scan_code=code.clone();false}
                };
                let mut r=this.0.lock().unwrap_or_else(|e|e.into_inner());
                r.helper_active=false;
                if !r.request_current(generation){continue;}
                if accepted {r.status.scan_code="helper-current".into();} else if r.status.scan_code=="helper-fetching" {r.status.scan_code="helper-invalid-inventory:account-not-accepted".into();}
                r.status.account_code=if accepted{"synced"}else if r.status.inventory_source.as_deref()==Some("alecaframe-cache"){"cached"}else if r.status.inventory_source.is_some(){"saved"}else{&r.status.scan_code}.into();
                r.status.scan=serde_json::json!({"provider":"warframe-api-helper","pid":pid,"refreshSeconds":120});
                due=std::time::Instant::now()+std::time::Duration::from_secs(if accepted{120}else{60});
                let _=app.emit("collector-updated",&r.status);
            }
        });
    }
    fn apply_account(&self,app:&tauri::AppHandle,catalog:&collection::Catalog,value:&serde_json::Value,source:&str,fallback:&str,token:(u64,u64)) -> bool {
        let mut runtime=self.0.lock().unwrap_or_else(|e|e.into_inner());if !runtime.request_current(token){return false;}
        let state=app.state::<AppState>();let Ok(db)=state.0.lock() else{return false;};
        let Ok(scope)=crate::account_scope::from_value(value) else{return false;};
        let Ok(active)=db.active_scope() else{return false;};
        let target=scope.as_deref().unwrap_or(crate::account_scope::LEGACY);
        // A cache cannot establish a change away from an identified live/imported account.
        // Only an explicit live identity may switch; unknown input never claims that account.
        if !crate::account_scope::source_may_select(&active,scope.as_deref(),source){return false;}
        let switched=active!=target;
        let Ok(old)=db.load_collection_for_scope(scope.as_deref()) else{return false;};
        let mut snapshot=match crate::inventory_data::from_value(value,catalog,old.as_ref(),source,fallback) {
            Ok(snapshot)=>snapshot,
            Err(error)=>{
                // Only fixed validation categories leave the native layer; never export raw data.
                let reason=match error.as_str(){
                    "缺少完整账户库存结构"=>"normalize-core-structure",
                    "库存时间无效"=>"normalize-timestamp",
                    "库存缺少物品类型"|"装备缺少物品类型"|"模组缺少物品类型"|"精通记录缺少类型"=>"normalize-item-type",
                    "库存缺少数量"|"模组缺少数量"=>"normalize-quantity",
                    "库存数量超限"|"模组数量超限"=>"normalize-quantity-limit",
                    "库存列表类型无效"|"装备列表类型无效"=>"normalize-list-type",
                    "精通经验无效"=>"normalize-xp",
                    _=>"normalize-validation",
                };
                runtime.status.scan_code=format!("helper-invalid-inventory:{reason}");
                return false;
            }
        };
        retain_known_player_name(old.as_ref(),&mut snapshot);
        let recent=!switched&&runtime.last_live_read.is_some_and(|t|t.elapsed()<std::time::Duration::from_secs(60));
        let decision=crate::acquisition::choose(old.as_ref(),&snapshot,recent);
        if !matches!(decision,crate::acquisition::Decision::Accept|crate::acquisition::Decision::Unchanged){return false;}
        let live=source=="game-memory"||source=="warframe-api-helper";
        if live {
            match db.save_live_collection(&snapshot) {Ok(true)=>{let _=app.emit("ledger-updated",());},Ok(false)=>{},Err(_)=>{runtime.status.scan_code="history-save-failed".into();return false;}}
        } else if (decision!=crate::acquisition::Decision::Unchanged||switched) && db.save_collection(&snapshot).is_err(){return false;}
        if switched{runtime.scope_epoch+=1;runtime.captures.clear();runtime.live_scope=None;runtime.last_live_read=None;runtime.status.last_read_at=None;runtime.status.last_relic=None;let _=app.emit("ledger-updated",());}
        if live {runtime.live_scope=snapshot.account_scope.clone();runtime.last_live_read=Some(std::time::Instant::now());runtime.status.last_read_at=Some(chrono::Utc::now().to_rfc3339());}
        runtime.status.account_code=if live{"synced"}else{"cached"}.into();
        runtime.status.inventory_source=Some(source.into());runtime.status.last_inventory_at=Some(snapshot.captured_at);runtime.status.observed_items=snapshot.counts.len();
        if decision!=crate::acquisition::Decision::Unchanged {let _=app.emit("collection-updated",());}
        let _=app.emit("collector-updated",&runtime.status);true
    }
    pub fn status(&self)->Status { self.0.lock().unwrap_or_else(|e|e.into_inner()).status.clone() }
    pub fn stop(&self) {
        let mut r=self.0.lock().unwrap_or_else(|e|e.into_inner());
        r.generation+=1;r.last_live_read=None;r.live_scope=None;r.captures.clear();r.scope_epoch+=1;
        if let Some(mut child)=r.child.take() { let _=child.kill(); let _=child.wait(); }
        r.status.enabled=false;r.status.running=false;r.status.code="stopped".into();
        drop(r);
        // Give the cancelled helper thread time to kill/wait and remove raw output.
        let until=std::time::Instant::now()+std::time::Duration::from_secs(2);
        while std::time::Instant::now()<until {
            if !self.0.lock().unwrap_or_else(|e|e.into_inner()).helper_active {break;}
            std::thread::sleep(std::time::Duration::from_millis(25));
        }
    }
    pub fn start(&self, app:&tauri::AppHandle)->Result<(),String> {
        self.stop();
        let catalog_path=app.path().app_data_dir().map_err(|e|e.to_string())?.join("collector-catalog.json");
        std::fs::write(&catalog_path,include_bytes!("../../public/catalog.json")).map_err(|e|e.to_string())?;
        let riven_catalog_path=catalog_path.with_file_name("riven-capture-catalog.json");std::fs::write(&riven_catalog_path,include_bytes!("../../public/riven-capture-catalog.json")).map_err(|e|e.to_string())?;
        let exe=std::env::current_exe().map_err(|e|e.to_string())?;
        let sidecar=exe.parent().ok_or("missing-exe-directory")?.join("collector/myframe-collector.exe");
        let mut cmd=if sidecar.is_file() { Command::new(sidecar) } else {
            let manifest=PathBuf::from(env!("CARGO_MANIFEST_DIR"));
            if !cfg!(debug_assertions) || !exe.starts_with(manifest.join("target")) { self.fail("worker-missing");return Err("worker-missing".into()); }
            let mut c=Command::new(manifest.join("../../.venv/Scripts/python.exe"));
            c.arg(manifest.join("../../collector/auto.py"));c
        };
        cmd.arg("--menu-scale-config").arg(crate::menu_scale::path(app)?).arg("--catalog").arg(catalog_path).arg("--riven-catalog").arg(riven_catalog_path).arg("--parent-pid").arg(std::process::id().to_string()).stdout(Stdio::piped()).stderr(Stdio::null()).stdin(Stdio::null());
        #[cfg(windows)] { use std::os::windows::process::CommandExt; cmd.creation_flags(0x08000000); }
        let mut child=cmd.spawn().map_err(|_|{self.fail("worker-start-failed");"worker-start-failed".to_string()})?;
        let stdout=child.stdout.take().ok_or("missing-worker-output")?;
        let generation={let mut r=self.0.lock().unwrap_or_else(|e|e.into_inner());r.status.enabled=true;r.status.running=true;r.status.code="starting".into();r.child=Some(child);r.generation};
        let this=self.clone();let handle=app.clone();
        std::thread::spawn(move||{
            let catalog=match collection::catalog(){Ok(c)=>c,Err(_)=>{this.fail("catalog-error");return;}};
            let mut reader=BufReader::new(stdout);
            loop {
                let mut bytes=Vec::new();
                // Bound each worker record before allocating a full line.
                let read=std::io::Read::take(&mut reader,262145).read_until(b'\n',&mut bytes);
                match read {Ok(0)|Err(_)=>break,_=>{}}
                if bytes.len()>262144 || bytes.last()!=Some(&b'\n'){this.fail("worker-protocol-error");break;}
                let input=match std::str::from_utf8(&bytes){Ok(v)=>v,Err(_)=>continue};
                let v:serde_json::Value=match serde_json::from_str(input){Ok(v)=>v,Err(_)=>continue};
                let mut r=this.0.lock().unwrap_or_else(|e|e.into_inner());
                if r.generation!=generation {break;}
                if v["schemaVersion"]!=1 {continue;}
                let active=if matches!(v["type"].as_str(),Some("capture-start"|"inventory"|"trade-candidate"|"relic"|"riven-capture")){handle.state::<AppState>().0.lock().ok().and_then(|db|db.active_scope().ok())}else{None};
                match v["type"].as_str() {
                    Some("capture-start")=>{if let (Some(id),Some(started),Some(active))=(v["captureId"].as_str(),v["startedAt"].as_str(),active.as_deref()){r.capture_start(id,started,active);}}
                    Some("capture-end")=>{if let Some(id)=v["captureId"].as_str(){r.captures.remove(id);}}
                    Some("status")=> {let code=v["code"].as_str().unwrap_or("watching");r.status.code=if ["starting","watching","waiting-game","waiting-log","ocr-error","capturing","inventory-observed","relic-detected"].contains(&code){code}else{"watching"}.into();}
                    Some("inventory")=> {
                        if v["captureId"].as_str().and_then(|id|active.as_deref().and_then(|scope|r.capture_result(id,scope))).is_none(){continue;}
                        let state=handle.state::<AppState>();
                        if let Ok(db)=state.0.lock() {
                            if let Ok(old)=db.load_collection() {
                                if let Ok(s)=merge_inventory(old,input,&catalog) {
                                    if db.save_collection(&s).is_ok() {r.status.last_inventory_at=Some(s.captured_at.clone());r.status.observed_items=s.counts.len();r.status.code="inventory-observed".into();let _=handle.emit("collection-updated",());}
                                }
                            }
                        };
                    }
                    Some("trade-candidate")=> {
                        let Some(binding)=v["captureId"].as_str().and_then(|id|active.as_deref().and_then(|scope|r.capture_result(id,scope))) else{continue;};
                        if v["candidate"].is_object(){let mut event=v.clone();event["accountScope"]=binding.scope.into();event["captureStartedAt"]=binding.started_at.into();let _=handle.emit("trade-candidate",&event);}
                    }
                    Some("relic-selection")=>{
                        let Some(binding)=v["captureId"].as_str().and_then(|id|active.as_deref().and_then(|scope|r.capture_result(id,scope)))else{continue;};
                        if v["evidence"]!="ocr"||!matches!(v["era"].as_str(),Some("Lith"|"Meso"|"Neo"|"Axi"|"Requiem")){continue;}
                        let Some(session)=v["selectionSession"].as_str().filter(|s|!s.is_empty()&&s.len()<=100&&s.bytes().all(|c|c.is_ascii_alphanumeric()||c==b'-'))else{continue;};
                        let payload=serde_json::json!({"accountScope":binding.scope,"capturedAt":v["capturedAt"],"era":v["era"],"selectionSession":session,"eraEvidence":"selection-title-ocr"});
                        if let Some(overlays)=handle.try_state::<Arc<crate::overlays::Service>>(){let _=overlays.show(&handle,"relic-recommendations",payload,false);}
                    }
                    Some("relic-selection-ended")=>{
                        let Some(binding)=v["captureId"].as_str().and_then(|id|active.as_deref().and_then(|scope|r.capture_result(id,scope)))else{continue;};
                        if v["evidence"]!="ocr"{continue;}
                        if let (Some(overlays),Some(session))=(handle.try_state::<Arc<crate::overlays::Service>>(),v["selectionSession"].as_str()){
                            overlays.end_relic_selection(&handle,&binding.scope,session);
                        }
                    }
                    Some("riven-capture")=>{
                        let Some(binding)=v["captureId"].as_str().and_then(|id|active.as_deref().and_then(|scope|r.capture_result(id,scope)))else{continue;};
                        if v["evidence"]!="ocr"||!matches!(v["mode"].as_str(),Some("single"|"comparison"|"unknown"))||v["cards"].as_array().is_none_or(|cards|cards.is_empty()||cards.len()>2)||input.len()>65536{continue;}
                        let Some(cards)=v["cards"].as_array()else{continue;};
                        if cards.iter().any(|card|card["weaponId"].as_str().is_none_or(|id|!catalog.items.iter().any(|i|i.id==id))||card["attributes"].as_array().is_none_or(|a|!(2..=4).contains(&a.len()))){continue;}
                        let mut payload=v.clone();payload["accountScope"]=binding.scope.into();payload["captureStartedAt"]=binding.started_at.into();
                        if let Some(overlays)=handle.try_state::<Arc<crate::overlays::Service>>(){let kind=if payload["mode"]=="comparison"{"riven-reroll"}else{"riven-chat"};let _=overlays.show(&handle,kind,payload.clone(),false);}
                        let _=handle.emit("riven-capture",payload);
                    }
                    Some("relic")=> {
                        let Some(binding)=v["captureId"].as_str().and_then(|id|active.as_deref().and_then(|scope|r.capture_result(id,scope))) else{continue;};
                        // Persist only catalogue IDs, recognised labels and scalar confidence.
                        if let Some(cards)=v["cards"].as_array().filter(|a|a.len()<=4) {
                            let clean:Vec<_>=cards.iter().map(|c|{
                                let id=c["itemId"].as_str().filter(|id|catalog.items.iter().any(|i|i.id==*id));
                                let text:String=c["text"].as_str().unwrap_or("").chars().take(160).collect();
                                serde_json::json!({"itemId":id,"text":text,"matchStatus":if id.is_some(){"matched"}else{"unresolved"}})
                            }).collect();
                            r.status.last_relic=Some(serde_json::json!({"capturedAt":v["capturedAt"].as_str(),"captureId":v["captureId"].as_str(),"captureStartedAt":binding.started_at,"accountScope":binding.scope,"cards":clean}));r.status.code="relic-detected".into();
                            if let (Some(overlays),Some(payload))=(handle.try_state::<Arc<crate::overlays::Service>>(),r.status.last_relic.clone()){let _=overlays.show(&handle,"relic-rewards",payload,false);}
                        }
                    }
                    _=>{}
                }
                let _=handle.emit("collector-updated",&r.status);
            }
            let mut r=this.0.lock().unwrap_or_else(|e|e.into_inner());
            if r.generation==generation {if let Some(mut c)=r.child.take(){let _=c.kill();let _=c.wait();}r.status.running=false;r.status.code="worker-exited".into();let _=handle.emit("collector-updated",&r.status);}
        });
        Ok(())
    }
    fn fail(&self,code:&str){let mut r=self.0.lock().unwrap_or_else(|e|e.into_inner());r.status.enabled=true;r.status.running=false;r.status.code=code.into();}
}
#[tauri::command]
pub fn collector_status(state:tauri::State<Collector>)->Status {state.status()}
#[tauri::command]
pub fn collector_set_enabled(enabled:bool,state:tauri::State<Collector>,app:tauri::AppHandle)->Result<Status,String>{
    app.state::<AppState>().0.lock().map_err(|_|"database-lock")?.set_auto_collect(enabled)?;
    if enabled {let _=state.start(&app);} else {state.stop();}
    let status=state.status();let _=app.emit("collector-updated",&status);Ok(status)
}

#[tauri::command]
pub fn collector_request_refresh(state:tauri::State<Collector>)->bool {
 let mut r=state.0.lock().unwrap_or_else(|e|e.into_inner());
 if !r.status.enabled{return false;}
 r.refresh_requested=true;true
}

#[cfg(test)] mod tests {
    use super::*;
    fn input(count:u64)->String{serde_json::json!({"schemaVersion":1,"capturedAt":chrono::Utc::now().to_rfc3339(),"observations":[{"itemId":"a","quantity":count}]}).to_string()}
    fn catalog()->collection::Catalog{serde_json::from_value(serde_json::json!({"items":[{"id":"a","name":"A","zh":"甲","category":"resource","prime":false,"masteryReq":0,"maxRank":0,"xpPerRank":0,"vaulted":null}]})).unwrap()}
    #[test] fn absolute_partial_counts_preserve_other_data(){let mut old=collection::Snapshot{schema_version:1,captured_at:"2026-01-01T00:00:00Z".into(),source:"import".into(),complete:true,..Default::default()};old.counts.insert("other".into(),8);old.favorites.insert("a".into());let s=merge_inventory(Some(old),&input(4),&catalog()).unwrap();let s=merge_inventory(Some(s),&input(4),&catalog()).unwrap();assert_eq!(s.counts["a"],4);assert_eq!(s.counts["other"],8);assert!(s.favorites.contains("a"));assert!(!s.complete);assert_eq!(collection::count(&s,"unseen"),None);}
    #[test] fn rejects_unknown_duplicate_and_stale_observations(){let c=catalog();let mut v:serde_json::Value=serde_json::from_str(&input(1)).unwrap();v["observations"][0]["itemId"]="foreign".into();assert!(merge_inventory(None,&v.to_string(),&c).is_err());let mut v:serde_json::Value=serde_json::from_str(&input(1)).unwrap();let row=v["observations"][0].clone();v["observations"].as_array_mut().unwrap().push(row);assert!(merge_inventory(None,&v.to_string(),&c).is_err());v["capturedAt"]="2020-01-01T00:00:00Z".into();assert!(merge_inventory(None,&v.to_string(),&c).is_err());}
    #[test] fn unidentified_screen_observations_cannot_modify_identified_account(){let mut old=collection::Snapshot::default();old.account_scope=crate::account_scope::from_value(&serde_json::json!({"AccountId":"synthetic-A"})).unwrap();assert!(merge_inventory(Some(old),&input(4),&catalog()).is_err());}

    #[test]fn manual_account_change_cancels_only_old_helper_token_without_stopping_worker(){
        let collector=Collector::default();let mut r=collector.0.lock().unwrap();r.status.enabled=true;r.status.running=true;r.generation=17;
        let old=r.token();assert!(r.request_current(old));r.invalidate_account();
        assert!(!r.request_current(old));assert!(r.request_current(r.token()));assert_eq!(r.generation,17);assert!(r.status.running);assert!(r.status.enabled);assert!(r.refresh_requested);
    }
    #[test]fn capture_results_require_confirmed_identity_at_start_and_same_epoch_at_completion(){
        let collector=Collector::default();let mut r=collector.0.lock().unwrap();
        let a=crate::account_scope::from_value(&serde_json::json!({"AccountId":"A"})).unwrap().unwrap();let b=crate::account_scope::from_value(&serde_json::json!({"AccountId":"B"})).unwrap().unwrap();let now=chrono::Utc::now().to_rfc3339();
        r.capture_start("1:unknown",&now,&a);assert!(r.capture_result("1:unknown",&a).is_none());
        r.live_scope=Some(a.clone());r.capture_start("1:first",&now,&a);assert!(r.capture_result("1:first",&a).is_some());assert!(r.capture_result("1:first",&b).is_none());
        r.invalidate_account();assert!(r.capture_result("1:first",&a).is_none());
        r.capture_start("1:unconfirmed",&now,&b);assert!(r.capture_result("1:unconfirmed",&b).is_none());
        r.live_scope=Some(b.clone());r.capture_start("1:second",&now,&b);let binding=r.capture_result("1:second",&b).unwrap();assert_eq!(binding.scope,b);assert_eq!(binding.started_at,now);assert!(r.capture_result("1:first",&b).is_none());
        r.captures.remove("1:second");assert!(r.capture_result("1:second",&b).is_none());
    }

    #[test]fn confirmed_player_name_survives_missing_log_only_within_the_same_account(){
        let mut old=collection::Snapshot::default();old.account_scope=Some("account-A".into());old.player_profile=Some(collection::PlayerProfile{name:Some("Actual.Name".into()),platinum:Some(999),..Default::default()});
        let mut fresh=collection::Snapshot::default();fresh.account_scope=old.account_scope.clone();
        retain_known_player_name(Some(&old),&mut fresh);assert_eq!(fresh.player_profile.as_ref().unwrap().name.as_deref(),Some("Actual.Name"));assert_eq!(fresh.player_profile.as_ref().unwrap().platinum,None);
        fresh.player_profile.as_mut().unwrap().name=Some("Renamed.Name".into());retain_known_player_name(Some(&old),&mut fresh);assert_eq!(fresh.player_profile.as_ref().unwrap().name.as_deref(),Some("Renamed.Name"));
        for scope in [None,Some("account-B".into())]{let mut other=collection::Snapshot::default();other.account_scope=scope;retain_known_player_name(Some(&old),&mut other);assert!(other.player_profile.is_none());}
    }

}

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
#[cfg(all(not(debug_assertions), not(feature = "custom-protocol"), not(test)))]
compile_error!("Standalone release requires --features custom-protocol (or npm run package); otherwise the UI depends on the Vite dev server.");
mod world;
mod world_notify;
#[cfg(all(windows, test))] mod win_toast;
#[cfg(windows)] mod toolkit_toast;
mod collection;
mod favorites;
mod asset_history;
mod acceptance_profile;
mod single_instance;
mod app_preferences;
mod launcher_language;
mod menu_scale;
mod stats_share;
mod game_events;
mod overlays;
mod trade_receipts;
mod riven_services;
mod backup;
mod save_dialog;
mod stats_export;
mod domain;
mod store;
mod inventory_changes;
mod updates;
mod incremental_update;
#[cfg(feature="diagnostics")] mod update_fixture;
mod workshop;
mod market;
mod market_credentials;
mod diagnostics;
mod market_presence;
mod presence_transport;
mod market_aleca;
mod theme_presets;
mod market_analytics;
mod collector;
mod acquisition;
mod helper_inventory;
mod account_signals;
mod player_identity;
mod account_scope;
mod arbitration_run;
mod arbitration_history;
mod arbitration_capture;
mod arbitration_analyzer;
#[cfg(test)] mod memory_inventory;
mod inventory_data;
mod riven_inventory;
mod account_mastery;
use std::sync::{Arc,Mutex};
use tauri::Manager;
struct AppState(Mutex<store::Store>);
#[tauri::command]
fn world_status(state:tauri::State<Arc<world::WorldService>>,store:tauri::State<AppState>)->Result<world::Status,String>{let scope=store.0.lock().map_err(|_|"数据库锁错误")?.active_scope()?;Ok(state.status_for_scope(&scope))}
#[tauri::command]
fn world_set_subscriptions(settings:world::Settings,state:tauri::State<Arc<world::WorldService>>,store:tauri::State<AppState>)->Result<world::Status,String>{let scope=store.0.lock().map_err(|_|"数据库锁错误")?.active_scope()?;state.set_subscriptions(settings)?;Ok(state.status_for_scope(&scope))}
#[tauri::command]
async fn world_notify_riven(id:String,title:String,body:String,expected_scope:String,enabled:bool,app:tauri::AppHandle,state:tauri::State<'_,AppState>,world:tauri::State<'_,Arc<world::WorldService>>)->Result<world::Notice,String>{
 if !enabled||id.is_empty()||id.len()>100||id.chars().any(|c|c.is_control()){return Err("监控提醒未启用或标识无效".into());}
 {let db=state.0.lock().map_err(|_|"数据库锁错误")?;db.require_expected_scope(Some(&expected_scope))?;}
 let service=Arc::clone(&world);tauri::async_runtime::spawn_blocking(move||service.publish_notice(&app,world::Notice{id:format!("riven-monitor:{expected_scope}:{id}"),title,body,created_at:String::new(),kind:"riven-monitor".into(),delivery_error:None,system_state:None})).await.map_err(|_|"监控通知任务失败")?
}
#[tauri::command]
async fn world_test_notification(app:tauri::AppHandle,state:tauri::State<'_,Arc<world::WorldService>>)->Result<world::Notice,String>{
    let service=Arc::clone(state.inner());
    tauri::async_runtime::spawn_blocking(move||{
        std::thread::sleep(std::time::Duration::from_secs(5));
        service.test_notification(&app)
    }).await.map_err(|_|"测试提醒任务失败".to_string())?
}
#[tauri::command]
fn crafting_readiness(
    state: tauri::State<AppState>,
) -> Result<std::collections::BTreeMap<String, Option<bool>>, String> {
    let s = state
        .0
        .lock()
        .map_err(|_| "数据库锁错误")?
        .load_collection()?
        .unwrap_or_default();
    let c = collection::catalog()?;
    let mut result = std::collections::BTreeMap::new();
    for i in &c.items {
        if i.recipe.is_some() {
            result.insert(
                i.id.clone(),
                collection::plan(&c, &s, &i.id, 1)?.materials_ready,
            );
        }
    }
    Ok(result)
}
#[tauri::command]
fn load_collection(state: tauri::State<AppState>) -> Result<Option<collection::Snapshot>, String> {
    state.0.lock().map_err(|_| "数据库锁错误")?.load_collection()
}
#[tauri::command]
fn inventory_changes(expected_scope:String,state:tauri::State<AppState>)->Result<serde_json::Value,String>{let db=state.0.lock().map_err(|_|"数据库锁错误")?;db.require_expected_scope(Some(&expected_scope))?;let c=db.inventory_changes_for(&expected_scope)?;Ok(serde_json::json!({"revision":c.revision,"pending":c.pending}))}
#[tauri::command]
fn acknowledge_inventory_changes(revision:u64,expected_scope:String,state:tauri::State<AppState>,app:tauri::AppHandle)->Result<(),String>{use tauri::Emitter;state.0.lock().map_err(|_|"数据库锁错误")?.acknowledge_inventory_changes(revision,&expected_scope)?;let _=app.emit("collection-updated",());Ok(())}
#[tauri::command]
fn account_profiles(state:tauri::State<AppState>)->Result<Vec<account_scope::Profile>,String>{state.0.lock().map_err(|_|"数据库锁错误")?.account_profiles()}
#[tauri::command]
fn select_account(scope:String,expected_scope:Option<String>,collector:tauri::State<collector::Collector>,app:tauri::AppHandle)->Result<Option<collection::Snapshot>,String>{
 collector.select_account(&app,&scope,expected_scope.as_deref())
}
#[tauri::command]
fn set_collection_favorite(id:String,enabled:bool,expected_scope:Option<String>,state:tauri::State<AppState>)->Result<collection::Snapshot,String>{
    if !collection::catalog()?.items.iter().any(|item| item.id==id) {return Err("物品不在目录中".into());}
    let db=state.0.lock().map_err(|_| "数据库锁错误")?;
    db.with_expected_scope(expected_scope.as_deref(),|db|favorites::set(db,&id,enabled))
}
#[tauri::command]
fn import_collection(input:String,expected_scope:Option<String>,collector:tauri::State<collector::Collector>,app:tauri::AppHandle)->Result<collection::Snapshot,String>{
    let s=collection::parse(&input)?;collector.mutate_account_storage(&app,expected_scope.as_deref(),|db|db.save_collection(&s))?;
    use tauri::Emitter;let _=app.emit("collection-updated",());let _=app.emit("ledger-updated",());Ok(s)
}
#[tauri::command]
fn crafting_plan(
    id: String,
    quantity: u64,
    state: tauri::State<AppState>,
) -> Result<collection::Plan, String> {
    let s = state
        .0
        .lock()
        .map_err(|_| "数据库锁错误")?
        .load_collection()?
        .unwrap_or_default();
    collection::plan(&collection::catalog()?, &s, &id, quantity)
}
#[tauri::command]
fn crafting_tree(
    id: String,
    quantity: u64,
    state: tauri::State<AppState>,
) -> Result<workshop::TreePlan, String> {
    let s = state
        .0
        .lock()
        .map_err(|_| "数据库锁错误")?
        .load_collection()?
        .unwrap_or_default();
    workshop::build(&collection::catalog()?, &s, &id, quantity)
}
#[tauri::command]
fn load_data(state: tauri::State<AppState>) -> Result<domain::Dataset, String> {
    state.0.lock().map_err(|_| "数据库锁错误")?.load()
}
#[tauri::command]
fn import_data(input: String, expected_scope:Option<String>,collector:tauri::State<collector::Collector>,app:tauri::AppHandle) -> Result<domain::Dataset, String> {
    if serde_json::from_str::<serde_json::Value>(&input).ok().is_some_and(|v|v["kind"]=="myframe-backup") {
        let b=backup::decode(&input)?;collector.mutate_account_storage(&app,expected_scope.as_deref(),|db|db.restore_backup(&b))?;
        use tauri::Emitter;let _=app.emit("collection-updated",());let _=app.emit("ledger-updated",());return Ok(b.data);
    }
    let d = domain::parse(&input)?;
    collector.mutate_account_storage(&app,expected_scope.as_deref(),|db|db.save(&d))?;
    Ok(d)
}
#[tauri::command]
fn confirm_trade(input:String,expected_scope:Option<String>,state:tauri::State<AppState>)->Result<(),String>{
 let incoming=domain::parse(&input)?;
 if incoming.trades.len()!=1||!incoming.exchanges.is_empty()||!incoming.general_data_points.is_empty(){return Err("只允许确认一笔交易".into());}
 let db=state.0.lock().map_err(|_|"数据库锁错误")?;
 db.require_expected_scope(expected_scope.as_deref())?;
 let mut data=db.load()?;
 let trade=incoming.trades.into_iter().next().unwrap();
 if data.trades.iter().any(|t|t.id==trade.id){return Ok(());}
 if data.exchanges.iter().any(|e|game_events::matches_manual(e,&trade)){return Err("此笔交易已由游戏日志确认并记账，请刷新成交记录".into());}
 data.trades.push(trade);db.save(&data)
}
#[tauri::command]
fn load_ledger(state: tauri::State<AppState>) -> Result<serde_json::Value, String> {
    let data=state.0.lock().map_err(|_| "数据库锁错误")?.load()?;
    let stats=domain::analyze(&data);
    Ok(serde_json::json!({"data":data,"stats":stats}))
}
#[tauri::command]
fn analytics(state: tauri::State<AppState>) -> Result<domain::Analytics, String> {
    Ok(domain::analyze(
        &state.0.lock().map_err(|_| "数据库锁错误")?.load()?,
    ))
}
#[tauri::command]
async fn export_data(kind:String,expected_scope:Option<String>,window:tauri::WebviewWindow,state:tauri::State<'_,AppState>)->Result<Option<String>,String>{
    let (json,name)={let db=state.0.lock().map_err(|_|"数据库锁错误")?;db.require_expected_scope(expected_scope.as_deref())?;match kind.as_str(){
        "backup"=>(db.export_backup()?,"myframe-backup.json"),
        "inventory"=>(serde_json::to_string_pretty(&db.load_collection()?.ok_or("尚无库存数据")?).map_err(|e|e.to_string())?,"myframe-inventory.json"),
        "arbitration-json"=>(serde_json::to_string_pretty(&arbitration_history::all(&db,&db.active_scope()?)?).map_err(|e|e.to_string())?,"myframe-arbitrations.json"),
        "stats-csv"=>(stats_export::stats(&db.load()?),"myframe-stats.csv"),
        "trades-csv"=>(stats_export::trades(&db.load()?)?,"myframe-trades.csv"),
        _=>return Err("导出类型无效".into())
    }};
    #[cfg(windows)]let owner=window.hwnd().map_err(|_|"无法获取窗口")?.0 as usize;
    #[cfg(not(windows))]let owner=0usize;
    tauri::async_runtime::spawn_blocking(move||{let Some(path)=save_dialog::choose(owner,name)? else{return Ok(None)};backup::write(&path,&json)?;Ok(Some(path.to_string_lossy().into_owned()))}).await.map_err(|_|"导出任务失败".to_string())?
}
#[tauri::command]
fn open_wiki(url: String) -> Result<(), String> {
    let parsed = reqwest::Url::parse(&url).map_err(|e| e.to_string())?;
    if parsed.scheme() != "https" || !matches!(parsed.host_str(), Some("warframe.huijiwiki.com" | "wiki.warframe.com")) || !parsed.username().is_empty() || parsed.password().is_some() || parsed.port().is_some() {
        return Err("Unsupported Wiki URL".into());
    }
    open_browser_url(&parsed)
}
#[tauri::command]
fn open_riven_source(url:String)->Result<(),String>{open_browser_url(&riven_source_url(&url)?)}
fn riven_source_url(url:&str)->Result<reqwest::Url,String>{
 let parsed=reqwest::Url::parse(url).map_err(|_|"来源链接无效")?;
 let path_ok=match parsed.host_str(){Some("warframe.market")=>parsed.path().starts_with("/auction/"),Some("riven.market")=>parsed.path().starts_with("/profile/")||parsed.path().starts_with("/list/"),_=>false};
 let queries_ok=parsed.query_pairs().all(|(key,value)|matches!(key.as_ref(),"riven"|"platform")&&!value.is_empty()&&value.len()<=100&&value.bytes().all(|c|c.is_ascii_alphanumeric()||b"_-.".contains(&c)));
 let fragment_ok=parsed.fragment().is_none_or(|value|value.strip_prefix("riven_").is_some_and(|id|!id.is_empty()&&id.len()<=100&&id.bytes().all(|c|c.is_ascii_digit())));
 if url.len()>2048||parsed.scheme()!="https"||!path_ok||!parsed.username().is_empty()||parsed.password().is_some()||parsed.port().is_some()||!queries_ok||!fragment_ok{return Err("只支持已核实的紫卡来源链接".into());}Ok(parsed)
}
#[tauri::command]
fn open_riven_market(url:String)->Result<(),String>{
    open_browser_url(&riven_market_url(&url)?)
}
fn riven_market_url(url:&str)->Result<reqwest::Url,String>{
    let parsed=reqwest::Url::parse(&url).map_err(|e|e.to_string())?;
    if parsed.scheme()!="https" || parsed.host_str()!=Some("riven.market") || parsed.path()!="/sell" || !parsed.username().is_empty() || parsed.password().is_some() || parsed.port().is_some() || parsed.fragment().is_some() || parsed.query_pairs().count()!=1 || !parsed.query_pairs().all(|(k,v)|k=="import"&&!v.is_empty()&&v.len()<16000&&v.chars().all(|c|c.is_ascii_alphanumeric()||"+/=".contains(c))){return Err("Unsupported Riven.market import URL".into());}
    Ok(parsed)
}
#[cfg(test)]
mod riven_export_url_tests {
    use super::{riven_market_url,riven_source_url};
    #[test]fn actual_public_merged_links_are_openable_in_native_bridge(){let value:serde_json::Value=serde_json::from_str(include_str!("../../tests/fixtures/riven-merged-public.json")).unwrap();let rows=value["similarRivens"].as_array().unwrap();assert_eq!(rows.len(),100);for row in rows{assert!(riven_source_url(row["link"].as_str().unwrap()).is_ok(),"public source link rejected");}}
    #[test]fn public_riven_links_use_verified_routes(){for url in ["https://warframe.market/auction/public-id","https://riven.market/profile/Fixture","https://riven.market/list/PC/Torid#riven_123"]{assert!(riven_source_url(url).is_ok());}for url in ["https://warframe.market.evil.test/auction/id","https://user@riven.market/profile/Test","https://riven.market/sell?import=private","https://riven.market/profile/Test?next=https://example.com","file:///C:/test"]{assert!(riven_source_url(url).is_err());}}
    #[test]
    fn only_accepts_riven_market_import_destination(){
        assert!(riven_market_url("https://riven.market/sell?import=e30%3D").is_ok());
        for url in ["http://riven.market/sell?import=e30=","https://riven.market.evil.test/sell?import=e30=","https://riven.market/sell?import=e30=&next=other","https://riven.market/sell?import=","https://user@riven.market/sell?import=e30=","https://riven.market/login?import=e30=","https://riven.market/sell?import=e30=#other"] {assert!(riven_market_url(url).is_err(),"{url}");}
    }
}
#[tauri::command]
fn open_help_link(url:String)->Result<(),String>{
    if !["https://docs.alecaframe.com/","https://docs.alecaframe.com/faq","https://discord.gg/Bc7PNNnnEZ"].contains(&url.as_str()){return Err("Unsupported help URL".into());}
    open_browser_url(&reqwest::Url::parse(&url).map_err(|e|e.to_string())?)
}

#[tauri::command]
fn open_market_account_link(url:String)->Result<(),String>{
    if !["https://warframe.market/auth/signin","https://warframe.market/auth/registration","https://warframe.market/settings/account"].contains(&url.as_str()){return Err("Unsupported market account URL".into());}
    open_browser_url(&reqwest::Url::parse(&url).map_err(|e|e.to_string())?)
}

fn open_browser_url(parsed:&reqwest::Url)->Result<(),String>{
    #[cfg(windows)]
    {
        use windows::core::HSTRING;
        use windows::Win32::UI::Shell::ShellExecuteW;
        use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;
        let target = HSTRING::from(parsed.as_str());
        let result = unsafe { ShellExecuteW(None, windows::core::w!("open"), &target, None, None, SW_SHOWNORMAL) };
        if result.0 as isize <= 32 { return Err("Failed to open default browser".into()); }
    }
    Ok(())
}
fn main() {
    diagnostics::install_panic_hook();
    match incremental_update::recover_if_needed(){Ok(true)=>return,Ok(false)=>{},Err(error)=>{eprintln!("更新恢复失败：{error}");return;}}
    let _instance=match single_instance::acquire(){Ok(Some(guard))=>guard,Ok(None)=>return,Err(error)=>{eprintln!("{error}");std::process::exit(1);}};
    let args:Vec<String>=std::env::args().collect();
    let acceptance=match acceptance_profile::parse(&args){Ok(value)=>value,Err(error)=>{eprintln!("{error}");std::process::exit(2);}};
    let isolated=acceptance.is_some();
    let mut context=tauri::generate_context!();
    if let Some(identifier)=acceptance {
        context.config_mut().identifier=identifier;
        context.config_mut().plugins.0.insert("updater".into(),serde_json::json!({"pubkey":"","endpoints":[]}));
        for window in &mut context.config_mut().app.windows {window.title.push_str(" [验收]");}
    }
    #[cfg(feature="diagnostics")] update_fixture::apply(&mut context).expect("invalid updater acceptance fixture");
    tauri::Builder::default()
        .manage(incremental_update::Service::default())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .on_window_event(|window, event| {
            // A confirmed main-window close ends synchronization and auxiliary
            // windows too. Closing an arbitration/overlay window stays local.
            if window.label() == "main" && matches!(event, tauri::WindowEvent::Destroyed) {
                window.app_handle().exit(0);
            }
        })
        .setup(move |app| {
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            diagnostics::initialize(&dir);
            let db =
                store::Store::open(&dir.join("myframe.sqlite3")).map_err(std::io::Error::other)?;
            if isolated {db.set_auto_collect(false).map_err(std::io::Error::other)?;}
            app_preferences::place_window(app.handle(),&app_preferences::read(&db.db).unwrap_or_default());
            let enabled=db.auto_collect().map_err(std::io::Error::other)?;
            let collector=collector::Collector::default();
            if let Ok(Some(snapshot))=db.load_collection(){collector.restore(&snapshot);}
            app.manage(world_notify::ClientDiagnostics::new(&dir));
            world_notify::initialize(app.handle());
            let overlays=Arc::new(overlays::Service::new(&db.db).map_err(std::io::Error::other)?);
            app.manage(AppState(Mutex::new(db)));
            app.manage(Arc::clone(&overlays));overlays.start(app.handle().clone());
            app.manage(collector.clone());
            {let state=app.state::<AppState>();let db=state.0.lock().map_err(|_|std::io::Error::other("数据库锁错误"))?;arbitration_history::recover(&db).map_err(std::io::Error::other)?;}
            let arbitration_capture=Arc::new(arbitration_capture::Capture::new());
            app.manage(Arc::clone(&arbitration_capture));
            arbitration_capture.start(app.handle().clone());
            // Isolated profiles start disabled, but the user can still enable live capture.
            if std::env::var_os("TENNOLEDGER_UPDATE_ACK").is_none(){collector.watch_account(app.handle());}
            let game_events=game_events::Watcher::new();game_events.start(app.handle().clone());app.manage(game_events);
            let world=Arc::new(world::WorldService::new(dir.join("myframe.sqlite3")).map_err(std::io::Error::other)?);
            app.manage(Arc::clone(&world));
            world.start(app.handle().clone());
            let args:Vec<String>=std::env::args().collect();
            if let Some(output)=args.iter().position(|a|a=="--notification-smoke-report").and_then(|i|args.get(i+1)).cloned(){
                let app_handle=app.handle().clone();let service=Arc::clone(&world);
                std::thread::spawn(move||{
                    for _ in 0..300 {
                        if app_handle.state::<world_notify::ClientDiagnostics>().ready.load(std::sync::atomic::Ordering::SeqCst) { break; }
                        std::thread::sleep(std::time::Duration::from_millis(100));
                    }
                    if !app_handle.state::<world_notify::ClientDiagnostics>().ready.load(std::sync::atomic::Ordering::SeqCst) {
                        let _=std::fs::write(&output,b"{\"error\":\"frontend-listener-not-ready\"}");return;
                    }
                    std::thread::sleep(std::time::Duration::from_secs(5));
                    let result=service.test_notification(&app_handle);
                    let report=match result{
                        Ok(notice)=>serde_json::json!({"test":"desktop-notification-smoke","nativeAccepted":notice.delivery_error.is_none(),"visualConfirmation":"PENDING_USER","systemState":world_notify::environment(),"notice":notice}),
                        Err(error)=>serde_json::json!({"test":"desktop-notification-smoke","error":error})
                    };
                    let _=std::fs::write(output,serde_json::to_vec_pretty(&report).unwrap_or_default());
                });
            }

            if enabled&&std::env::var_os("TENNOLEDGER_UPDATE_ACK").is_none(){let _=collector.start(app.handle());}
            diagnostics::ready();
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            launcher_language::warframe_launcher_language,
            menu_scale::warframe_menu_scale,
            menu_scale::warframe_set_menu_scale,
            menu_scale::warframe_detect_menu_scale,
            arbitration_capture::arbitration_open_live,
            arbitration_capture::arbitration_open_report,
            arbitration_capture::arbitration_capture_status,
            arbitration_capture::arbitration_set_auto_live,
            arbitration_capture::arbitration_history,
            arbitration_capture::arbitration_run,
            arbitration_capture::arbitration_export_run,
            arbitration_capture::arbitration_metadata,
            arbitration_capture::arbitration_delete,
            arbitration_capture::arbitration_node_notes,
            arbitration_capture::arbitration_save_node_note,
            arbitration_capture::arbitration_import_begin,
            arbitration_capture::arbitration_import_chunk,
            arbitration_capture::arbitration_import_finish,
            arbitration_capture::arbitration_import_cancel,
            incremental_update::incremental_check,
            incremental_update::incremental_download,
            incremental_update::incremental_install,
            incremental_update::incremental_ready,
            updates::update_configuration,
            updates::update_prepare,
            updates::update_resume,
            world_status,
            world_set_subscriptions,
            world_test_notification,
            world_notify_riven,
            world_notify::world_notification_trace,
            open_wiki,
            open_help_link,
            open_market_account_link,
            open_riven_market,
            open_riven_source,
            load_data,
            load_ledger,
            import_data,
            confirm_trade,
            export_data,
            analytics,
            load_collection,
            inventory_changes,
            acknowledge_inventory_changes,
            account_profiles,
            select_account,
            import_collection,
            set_collection_favorite,
            crafting_plan,
            crafting_readiness,
            crafting_tree,
            market::market_request,
            market_presence::market_presence,
            market::market_request_scoped,
            market_aleca::market_aleca_prices,
            theme_presets::theme_presets_list,
            theme_presets::theme_presets_save,
            theme_presets::theme_presets_delete,
            theme_presets::theme_presets_open,
            riven_services::riven_similar,
            app_preferences::app_preferences,
            app_preferences::app_set_preferences,
            app_preferences::app_diagnostics,
            diagnostics::diagnostics_log_status,
            diagnostics::diagnostics_client_event,
            diagnostics::diagnostics_export_report,
            diagnostics::diagnostics_open_logs,
            stats_share::stats_share,
            game_events::game_recent_trade_finishes,
            overlays::overlay_preferences,
            overlays::overlay_set_preferences,
            overlays::overlay_content,
            overlays::overlay_touch,
            overlays::overlay_close,overlays::overlay_dismiss_notifications,
            overlays::overlay_open_market,
            overlays::overlay_status,
            overlays::overlay_preview,
            trade_receipts::trade_completion_status,
            trade_receipts::trade_completion_intent,
            trade_receipts::trade_completion_result,
            riven_services::riven_history,
            riven_services::riven_market_list,
            market_analytics::market_analytics,
            market::market_login,
            market::market_connect,
            market::market_session,
            market::market_refresh_session,
            market::market_logout,
            collector::collector_status,
            collector::collector_request_refresh,
            collector::collector_set_enabled
        ])
        .build(context)
        .expect("MyFrame desktop startup failed")
        .run(|app,event|{if matches!(event,tauri::RunEvent::ExitRequested{..}|tauri::RunEvent::Exit){market_presence::shutdown();app.state::<Arc<overlays::Service>>().stop();app.state::<game_events::Watcher>().stop();app.state::<collector::Collector>().stop();app.state::<Arc<world::WorldService>>().stop();world_notify::cleanup(app);}});
}

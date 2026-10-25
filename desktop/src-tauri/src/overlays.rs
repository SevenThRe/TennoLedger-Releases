use crate::AppState;
use rusqlite::OptionalExtension;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::BTreeMap,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::{Duration, Instant},
};
use tauri::{Emitter, Manager};
fn content_lifetime(kind:&str)->Duration{Duration::from_millis(match kind{"game-notification"=>6500,"trade-finished"=>90000,_=>35000})}
const KINDS: &[&str] = &[
    "relic-rewards",
    "relic-recommendations",
    "trade-finished",
    "riven-chat",
    "riven-reroll",
    "game-notification",
];
#[derive(Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase", deny_unknown_fields)]
pub struct Preferences {
    pub enabled: bool,
    pub relic_rewards: bool,
    pub relic_recommendations: bool,
    pub trade_finished: bool,
    pub riven_chat: bool,
    pub riven_reroll: bool,
    pub game_notifications: bool,
    pub show_balances: bool,
    pub copy_rewards: bool,
    pub click_through: bool,
    pub scale: u32,
}
impl Default for Preferences {
    fn default() -> Self {
        Self {
            enabled: true,
            relic_rewards: true,
            relic_recommendations: true,
            trade_finished: true,
            riven_chat: true,
            riven_reroll: true,
            game_notifications: true,
            show_balances: true,
            copy_rewards: false,
            click_through: false,
            scale: 100,
        }
    }
}
impl Preferences {
    fn allows(&self, kind: &str) -> bool {
        self.enabled
            && match kind {
                "relic-rewards" => self.relic_rewards,
                "relic-recommendations" => self.relic_recommendations,
                "trade-finished" => self.trade_finished,
                "riven-chat" => self.riven_chat,
                "riven-reroll" => self.riven_reroll,
                "game-notification" => self.game_notifications,
                _ => false,
            }
    }
    fn validate(&self) -> Result<(), String> {
        if !(70..=150).contains(&self.scale) {
            Err("覆盖层缩放应为70至150".into())
        } else {
            Ok(())
        }
    }
}
#[derive(Clone)]
struct Content {
    payload: Value,
    scope: String,
    created: Instant,
    preview: bool,
}
#[derive(Default)]
struct RelicSelection { scope:String, session:String, era:String, dismissed:bool }
impl RelicSelection {
    fn accept(&mut self,scope:&str,session:&str,era:&str)->bool{
        if self.scope!=scope||self.session!=session||self.era!=era{
            *self=Self{scope:scope.into(),session:session.into(),era:era.into(),dismissed:false};
        }
        !self.dismissed
    }
}
pub struct Service {
    preferences: Mutex<Preferences>,
    content: Mutex<BTreeMap<String, Content>>,
    stopped: AtomicBool,
    errors: Mutex<BTreeMap<String, String>>,
    relic_selection: Mutex<RelicSelection>,
}
fn read(db: &rusqlite::Connection) -> Result<Preferences, String> {
    let s: Option<String> = db
        .query_row(
            "SELECT value FROM settings WHERE key='overlay_preferences'",
            [],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let p: Preferences = s
        .map(|s| serde_json::from_str(&s).map_err(|e| e.to_string()))
        .unwrap_or_else(|| Ok(Default::default()))?;
    p.validate()?;
    Ok(p)
}
impl Service {
    pub fn new(db: &rusqlite::Connection) -> Result<Self, String> {
        Ok(Self {
            preferences: Mutex::new(read(db)?),
            content: Mutex::new(BTreeMap::new()),
            stopped: AtomicBool::new(false),
            errors: Mutex::new(BTreeMap::new()),
            relic_selection: Mutex::new(Default::default()),
        })
    }
    pub fn stop(&self) {
        self.stopped.store(true, Ordering::SeqCst);
    }
    pub fn show(
        &self,
        app: &tauri::AppHandle,
        kind: &str,
        payload: Value,
        preview: bool,
    ) -> Result<(), String> {
        if !KINDS.contains(&kind) {
            return Err("未知覆盖层".into());
        }
        let scope = payload["accountScope"]
            .as_str()
            .ok_or("覆盖层缺少账户")?
            .to_owned();
        if payload.to_string().len() > 65536 {
            return Err("覆盖层数据过大".into());
        }
        let preferences = self
            .preferences
            .lock()
            .map_err(|_| "覆盖层设置锁错误")?
            .clone();
        if !preview && !preferences.allows(kind) {
            return Ok(());
        }
        if kind=="relic-recommendations"&&!preview{
            let session=payload["selectionSession"].as_str().ok_or("遗物推荐缺少会话")?;
            let era=payload["era"].as_str().ok_or("遗物推荐缺少纪元")?;
            if !self.relic_selection.lock().map_err(|_|"覆盖层会话锁错误")?.accept(&scope,session,era){return Ok(());}
        }
        let mut contents = self.content.lock().map_err(|_| "覆盖层数据锁错误")?;
        if kind == "relic-recommendations" {
            contents.remove("relic-rewards");
        }
        if kind=="game-notification" && !preview && contents.get(kind).is_some_and(|c|c.scope==scope && c.payload["id"]==payload["id"]){return Ok(());}
        contents.insert(
            kind.into(),
            Content {
                payload,
                scope,
                created: Instant::now(),
                preview,
            },
        );
        drop(contents);
        let _ = app.emit_to(format!("overlay-{kind}"), "overlay-content-updated", ());
        Ok(())
    }
    pub fn dismiss(&self, app: &tauri::AppHandle, kind: &str) {
        if kind=="relic-recommendations"{if let Ok(mut selection)=self.relic_selection.lock(){selection.dismissed=true;}}
        if let Ok(mut contents) = self.content.lock() {
            contents.remove(kind);
        }
        if let Some(window) = app.get_webview_window(&format!("overlay-{kind}")) {
            if window.label() == "overlay-trade-finished" && window.is_visible().unwrap_or(false) {
                let _ = window.emit("trade-auto-cancel", ());
            }
            let _ = window.hide();
        }
    }
    pub fn end_relic_selection(&self,app:&tauri::AppHandle,scope:&str,session:&str){
        let Ok(mut selection)=self.relic_selection.lock()else{return;};
        if selection.scope!=scope||selection.session!=session{return;}
        *selection=RelicSelection::default();
        if let Ok(mut contents)=self.content.lock(){contents.remove("relic-recommendations");}
        drop(selection);
        if let Some(window)=app.get_webview_window("overlay-relic-recommendations"){let _=window.hide();}
    }
    pub fn start(self: &Arc<Self>, app: tauri::AppHandle) {
        let service = Arc::clone(self);
        std::thread::spawn(move || {
            while !service.stopped.load(Ordering::SeqCst) {
                std::thread::sleep(Duration::from_millis(400));
                if service.stopped.load(Ordering::SeqCst) {
                    break;
                }
                let active = app
                    .state::<AppState>()
                    .0
                    .lock()
                    .ok()
                    .and_then(|db| db.active_scope().ok());
                let preferences = service
                    .preferences
                    .lock()
                    .unwrap_or_else(|e| e.into_inner())
                    .clone();
                let notice_settings=app.try_state::<Arc<crate::world::WorldService>>().and_then(|world|world.try_notice_status());
                let game = crate::world_notify::game_foreground();
                let foreground = game == Some(true)
                    || game.is_some()
                        && KINDS
                            .iter()
                            .filter_map(|kind| app.get_webview_window(&format!("overlay-{kind}")))
                            .any(|w| w.is_focused().unwrap_or(false));
                {
                    let mut contents = service.content.lock().unwrap_or_else(|e| e.into_inner());
                    contents.retain(|kind, c| {
                        active.as_deref() == Some(c.scope.as_str())
                            && c.created.elapsed()
                                < content_lifetime(kind)
                            && (c.preview || preferences.allows(kind))
                            && (kind!="game-notification" || c.preview || notice_settings.as_ref().is_none_or(|status|crate::world::overlay_notice_allowed(c.payload["noticeKind"].as_str().unwrap_or(""),c.payload["id"].as_str().unwrap_or(""),status)))
                    });
                }
                let app_handle = app.clone();
                let service_main = Arc::clone(&service);
                let _ = app.run_on_main_thread(move || {
                    for kind in KINDS {
                        let label = format!("overlay-{kind}");
                        let content = service_main
                            .content
                            .lock()
                            .unwrap_or_else(|e| e.into_inner())
                            .get(*kind)
                            .cloned();
                        let show = content
                            .as_ref()
                            .is_some_and(|c| c.created.elapsed()<content_lifetime(kind) && (c.preview || foreground && preferences.allows(kind)));
                        if !show {
                            if let Some(w) = app_handle.get_webview_window(&label) {
                                if w.label() == "overlay-trade-finished"
                                    && w.is_visible().unwrap_or(false)
                                {
                                    let _ = w.emit("trade-auto-cancel", ());
                                }
                                let _ = w.hide();
                            }
                            continue;
                        }
                        let scale = preferences.scale as f64 / 100.;
                        let (width, height) = match *kind {
                            "relic-rewards" => (1000., 260.),
                            "relic-recommendations" => (760., 390.),
                            "riven-reroll" => (850., 510.),
                            "riven-chat" => (450., 480.),
                            "game-notification" => (352., 128.),
                            _ => (760., 640.),
                        };
                        if app_handle.get_webview_window(&label).is_none() {
                            match tauri::WebviewWindowBuilder::new(
                                &app_handle,
                                &label,
                                tauri::WebviewUrl::App(format!("index.html?overlay={kind}").into()),
                            )
                            .title("TennoLedger · 游戏覆盖层")
                            .inner_size(width * scale, height * scale)
                            .decorations(false)
                            .transparent(*kind == "game-notification")
                            .always_on_top(true)
                            .skip_taskbar(true)
                            .resizable(false)
                            .focused(false)
                            .build()
                            {
                                Ok(window) => {
                                    let weak = Arc::downgrade(&service_main);
                                    let dismissed_kind = kind.to_string();
                                    window.on_window_event(move |event| {
                                        if matches!(
                                            event,
                                            tauri::WindowEvent::CloseRequested { .. }
                                        ) {
                                            if let Some(service) = weak.upgrade() {
                                                if dismissed_kind=="relic-recommendations"{if let Ok(mut selection)=service.relic_selection.lock(){selection.dismissed=true;}}
                                                service
                                                    .content
                                                    .lock()
                                                    .unwrap_or_else(|e| e.into_inner())
                                                    .remove(&dismissed_kind);
                                            }
                                        }
                                    });
                                    service_main
                                        .errors
                                        .lock()
                                        .unwrap_or_else(|e| e.into_inner())
                                        .remove(*kind);
                                }
                                Err(error) => {
                                    service_main
                                        .errors
                                        .lock()
                                        .unwrap_or_else(|e| e.into_inner())
                                        .insert(kind.to_string(), error.to_string());
                                    service_main
                                        .content
                                        .lock()
                                        .unwrap_or_else(|e| e.into_inner())
                                        .remove(*kind);
                                    continue;
                                }
                            }
                        }
                        if let Some(w) = app_handle.get_webview_window(&label) {
                            let mut target = tauri::LogicalSize {
                                width: width * scale,
                                height: height * scale,
                            };
                            let bounds = game_bounds();
                            if let Some((_, _, gw, gh)) = bounds {
                                let dpi = w.scale_factor().unwrap_or(1.);
                                target.width = target.width.min((gw as f64 / dpi - 16.).max(160.));
                                target.height =
                                    target.height.min((gh as f64 / dpi - 16.).max(100.));
                            }
                            let _ = w.set_size(target);
                            let _ = w.set_ignore_cursor_events(
                                (preferences.click_through || *kind=="game-notification")
                                    && !content.as_ref().is_some_and(|c| c.preview),
                            );
                            if let Some((x, y, gw, gh)) = bounds {
                                let physical_width = w
                                    .outer_size()
                                    .map_or((width * scale) as i32, |s| s.width as i32);
                                let physical_height = w
                                    .outer_size()
                                    .map_or((height * scale) as i32, |s| s.height as i32);
                                let (px, py) = if *kind == "relic-rewards" {
                                    (
                                        x + (gw - physical_width).max(0) / 2,
                                        y + ((gh as f64 * 0.58) as i32)
                                            .min((gh - physical_height).max(0)),
                                    )
                                } else {
                                    (
                                        x + (gw - physical_width - 24).max(0),
                                        y + 50.min((gh - physical_height).max(0)),
                                    )
                                };
                                let _ = w.set_position(tauri::PhysicalPosition { x: px, y: py });
                            } else if content.as_ref().is_some_and(|c| c.preview) {
                                let _ = w.center();
                            }
                            if let Err(error) = w.show() {
                                service_main
                                    .errors
                                    .lock()
                                    .unwrap_or_else(|e| e.into_inner())
                                    .insert(kind.to_string(), error.to_string());
                            }
                        }
                    }
                });
            }
        });
    }
}
#[cfg(windows)]
fn game_bounds() -> Option<(i32, i32, i32, i32)> {
    #[repr(C)]
    struct Rect {
        left: i32,
        top: i32,
        right: i32,
        bottom: i32,
    }
    #[link(name = "user32")]
    extern "system" {
        fn GetForegroundWindow() -> *mut std::ffi::c_void;
        fn GetWindowRect(w: *mut std::ffi::c_void, r: *mut Rect) -> i32;
    }
    if crate::world_notify::game_foreground() != Some(true) {
        return None;
    }
    let mut r = Rect {
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
    };
    unsafe {
        if GetWindowRect(GetForegroundWindow(), &mut r) == 0 {
            return None;
        }
    }
    Some((r.left, r.top, r.right - r.left, r.bottom - r.top))
}
#[cfg(not(windows))]
fn game_bounds() -> Option<(i32, i32, i32, i32)> {
    None
}
#[tauri::command]
pub fn overlay_preferences(service: tauri::State<Arc<Service>>) -> Preferences {
    service
        .preferences
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone()
}
#[tauri::command]
pub fn overlay_set_preferences(
    preferences: Preferences,
    state: tauri::State<AppState>,
    service: tauri::State<Arc<Service>>,
) -> Result<Preferences, String> {
    preferences.validate()?;
    let db = state.0.lock().map_err(|_| "数据库锁错误")?;
    db.db.execute("INSERT INTO settings(key,value)VALUES('overlay_preferences',?1)ON CONFLICT(key)DO UPDATE SET value=excluded.value",[serde_json::to_string(&preferences).map_err(|e|e.to_string())?]).map_err(|e|e.to_string())?;
    *service.preferences.lock().map_err(|_| "覆盖层设置锁错误")? = preferences.clone();
    Ok(preferences)
}
#[tauri::command]
pub fn overlay_content(
    window: tauri::WebviewWindow,
    state: tauri::State<AppState>,
    service: tauri::State<Arc<Service>>,
) -> Result<Value, String> {
    let kind = window
        .label()
        .strip_prefix("overlay-")
        .filter(|kind| KINDS.contains(kind))
        .ok_or("此窗口不是覆盖层")?;
    let scope = state.0.lock().map_err(|_| "数据库锁错误")?.active_scope()?;
    let c = service
        .content
        .lock()
        .map_err(|_| "覆盖层锁错误")?
        .get(kind)
        .filter(|c| c.scope == scope)
        .cloned();
    let preferences = service
        .preferences
        .lock()
        .map_err(|_| "设置锁错误")?
        .clone();
    let game = crate::world_notify::game_foreground();
    let active = preferences.allows(kind)
        && (game == Some(true) || game.is_some() && window.is_focused().unwrap_or(false))
        && c.as_ref().is_some_and(|c| {
            !c.preview
                && c.created.elapsed()
                    < content_lifetime(kind)
        });
    Ok(
        json!({"expiresInMs":c.as_ref().map(|c|content_lifetime(kind).saturating_sub(c.created.elapsed()).as_millis() as u64),"kind":kind,"active":active,"visible":window.is_visible().unwrap_or(false),"preferences":preferences,"payload":c.as_ref().map(|c|&c.payload),"preview":c.as_ref().is_some_and(|c|c.preview)}),
    )
}
#[tauri::command]
pub fn overlay_touch(
    window: tauri::WebviewWindow,
    state: tauri::State<AppState>,
    service: tauri::State<Arc<Service>>,
) -> Result<(), String> {
    let kind = window
        .label()
        .strip_prefix("overlay-")
        .filter(|kind| KINDS.contains(kind))
        .ok_or("此窗口不是覆盖层")?;
    let scope = state.0.lock().map_err(|_| "数据库锁错误")?.active_scope()?;
    if let Some(content) = service
        .content
        .lock()
        .map_err(|_| "覆盖层锁错误")?
        .get_mut(kind)
        .filter(|c| c.scope == scope)
    {
        if kind!="game-notification"{content.created = Instant::now();}
    }
    Ok(())
}
#[tauri::command]
pub fn overlay_close(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    service: tauri::State<Arc<Service>>,
) -> Result<(), String> {
    let kind = window
        .label()
        .strip_prefix("overlay-")
        .filter(|kind| KINDS.contains(kind))
        .ok_or("此窗口不是覆盖层")?;
    service.dismiss(&app, kind);
    Ok(())
}
#[tauri::command]
pub fn overlay_open_market(
    event_id: String,
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
) -> Result<(), String> {
    if window.label() != "overlay-trade-finished" || event_id.len() > 100 {
        return Err("成交窗口标识无效".into());
    }
    if let Some(main) = app.get_webview_window("main") {
        main.show().map_err(|e| e.to_string())?;
        main.set_focus().map_err(|e| e.to_string())?;
    }
    app.emit_to("main", "open-trade-finish", json!({"eventId":event_id}))
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub fn overlay_dismiss_notifications(app:tauri::AppHandle,service:tauri::State<Arc<Service>>)->Result<(),String>{service.dismiss(&app,"game-notification");Ok(())}
#[tauri::command]
pub fn overlay_status(service: tauri::State<Arc<Service>>) -> BTreeMap<String, String> {
    service
        .errors
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone()
}
#[tauri::command]
pub fn overlay_preview(
    kind: String,
    app: tauri::AppHandle,
    state: tauri::State<AppState>,
    service: tauri::State<Arc<Service>>,
) -> Result<(), String> {
    let scope = state.0.lock().map_err(|_| "数据库锁错误")?.active_scope()?;
    let samples: Value = serde_json::from_str(include_str!("../../public/qa/overlay-preview.json"))
        .map_err(|e| e.to_string())?;
    let mut payload = samples.get(&kind).cloned().ok_or("未知覆盖层")?;
    payload["accountScope"] = json!(scope);
    payload["capturedAt"] = json!(chrono::Utc::now().to_rfc3339());
    service.show(&app, &kind, payload, true)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn recommendation_heartbeat_respects_close_but_new_visit_or_era_reopens(){
        let mut s=RelicSelection::default();
        assert!(s.accept("a","visit1","Meso"));s.dismissed=true;
        assert!(!s.accept("a","visit1","Meso"));
        assert!(s.accept("a","visit1","Axi"));s.dismissed=true;
        assert!(s.accept("a","visit2","Meso"));s.dismissed=true;
        assert!(s.accept("b","visit2","Meso"));
    }
    #[test]
    fn notices_have_a_fixed_short_deadline() {
        assert_eq!(content_lifetime("game-notification"),Duration::from_millis(6500));
        assert!(Duration::from_millis(6499)<content_lifetime("game-notification"));
        assert!(!(Duration::from_millis(6500)<content_lifetime("game-notification")));
    }
    #[test]
    fn reference_defaults_enable_known_overlays_and_invalid_geometry_is_rejected() {
        let p = Preferences::default();
        assert!(p.allows("relic-rewards"));
        assert!(!p.allows("other"));
        let mut p = p;
        p.enabled = true;
        assert!(p.allows("trade-finished"));
        p.scale = 20;
        assert!(p.validate().is_err());
    }
    #[test]
    fn preferences_survive_storage_without_private_capture_content() {
        let db = rusqlite::Connection::open_in_memory().unwrap();
        db.execute_batch("CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT);")
            .unwrap();
        assert!(read(&db).unwrap().enabled);
        let mut p = Preferences::default();
        p.enabled = true;
        db.execute(
            "INSERT INTO settings VALUES('overlay_preferences',?1)",
            [serde_json::to_string(&p).unwrap()],
        )
        .unwrap();
        assert!(read(&db).unwrap().enabled);
    }
}

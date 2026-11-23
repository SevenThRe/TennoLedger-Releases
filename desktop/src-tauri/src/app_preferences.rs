use rusqlite::OptionalExtension;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicU8, Ordering};
use tauri::Manager;

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum CloseAction {
    #[default]
    Ask,
    Minimize,
    Close,
}

impl CloseAction {
    fn to_u8(self) -> u8 {
        match self {
            Self::Ask => 0,
            Self::Minimize => 1,
            Self::Close => 2,
        }
    }

    fn from_u8(value: u8) -> Self {
        match value {
            1 => Self::Minimize,
            2 => Self::Close,
            _ => Self::Ask,
        }
    }
}

static LAST_CLOSE_ACTION: AtomicU8 = AtomicU8::new(0);

pub fn sync_cached(preferences: &Preferences) {
    LAST_CLOSE_ACTION.store(preferences.close_action.to_u8(), Ordering::Relaxed);
}

pub fn cached_close_action() -> CloseAction {
    CloseAction::from_u8(LAST_CLOSE_ACTION.load(Ordering::Relaxed))
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(from = "RawPreferences", rename_all = "camelCase")]
pub struct Preferences {
    pub warn_on_close: bool,
    pub close_action: CloseAction,
    pub launch_on_secondary: bool,
    pub record_stats: bool,
    pub stats_tab_enabled: bool,
    pub remember_market_status: bool,
    pub full_inventory_experience_enabled: bool,
    pub take_rank_into_account: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", default, deny_unknown_fields)]
struct RawPreferences {
    warn_on_close: Option<bool>,
    close_action: Option<CloseAction>,
    launch_on_secondary: bool,
    record_stats: bool,
    stats_tab_enabled: bool,
    remember_market_status: bool,
    full_inventory_experience_enabled: bool,
    take_rank_into_account: bool,
}

impl Default for RawPreferences {
    fn default() -> Self {
        let d = Preferences::default();
        Self {
            warn_on_close: None,
            close_action: None,
            launch_on_secondary: d.launch_on_secondary,
            record_stats: d.record_stats,
            stats_tab_enabled: d.stats_tab_enabled,
            remember_market_status: d.remember_market_status,
            full_inventory_experience_enabled: d.full_inventory_experience_enabled,
            take_rank_into_account: d.take_rank_into_account,
        }
    }
}

impl From<RawPreferences> for Preferences {
    fn from(raw: RawPreferences) -> Self {
        let close_action = match (raw.close_action, raw.warn_on_close) {
            (Some(action), _) => action,
            (None, Some(false)) => CloseAction::Close,
            (None, _) => CloseAction::Ask,
        };
        Self {
            warn_on_close: matches!(close_action, CloseAction::Ask),
            close_action,
            launch_on_secondary: raw.launch_on_secondary,
            record_stats: raw.record_stats,
            stats_tab_enabled: raw.stats_tab_enabled,
            remember_market_status: raw.remember_market_status,
            full_inventory_experience_enabled: raw.full_inventory_experience_enabled,
            take_rank_into_account: raw.take_rank_into_account,
        }
    }
}

impl Default for Preferences {
    fn default() -> Self {
        Self {
            warn_on_close: true,
            close_action: CloseAction::Ask,
            launch_on_secondary: false,
            record_stats: true,
            stats_tab_enabled: true,
            remember_market_status: false,
            full_inventory_experience_enabled: false,
            take_rank_into_account: true,
        }
    }
}

pub fn read(db: &rusqlite::Connection) -> Result<Preferences, String> {
    let json: Option<String> = db
        .query_row(
            "SELECT value FROM settings WHERE key='app_preferences'",
            [],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let prefs: Preferences = json
        .map(|s| serde_json::from_str(&s).map_err(|e| e.to_string()))
        .transpose()?
        .unwrap_or_default();
    sync_cached(&prefs);
    Ok(prefs)
}

#[tauri::command]
pub fn app_preferences(state: tauri::State<crate::AppState>) -> Result<Preferences, String> {
    read(&state.0.lock().map_err(|_| "数据库锁错误")?.db)
}

#[tauri::command]
pub fn app_set_preferences(
    mut preferences: Preferences,
    state: tauri::State<crate::AppState>,
) -> Result<Preferences, String> {
    preferences.warn_on_close = matches!(preferences.close_action, CloseAction::Ask);
    let db = state.0.lock().map_err(|_| "数据库锁错误")?;
    db.db
        .execute(
            "INSERT INTO settings(key,value) VALUES('app_preferences',?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            [serde_json::to_string(&preferences).map_err(|e| e.to_string())?],
        )
        .map_err(|e| e.to_string())?;
    sync_cached(&preferences);
    Ok(preferences)
}

pub fn reveal_main_window(window: &tauri::WebviewWindow) {
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_always_on_top(true);
    let _ = window.set_always_on_top(false);
    #[cfg(windows)]
    if let Ok(raw) = window.hwnd() {
        use windows::Win32::{
            Foundation::HWND,
            System::Threading::{AttachThreadInput, GetCurrentThreadId},
            UI::WindowsAndMessaging::{
                BringWindowToTop, GetForegroundWindow, GetWindowThreadProcessId, IsIconic,
                SetForegroundWindow, ShowWindow, SW_RESTORE,
            },
        };
        let hwnd = HWND(raw.0 as _);
        unsafe {
            if IsIconic(hwnd).as_bool() {
                let _ = ShowWindow(hwnd, SW_RESTORE);
            }
            let fg = GetForegroundWindow();
            let cur_thread = GetCurrentThreadId();
            let fg_thread = if !fg.0.is_null() {
                GetWindowThreadProcessId(fg, None)
            } else {
                0
            };
            let attached = fg_thread != 0
                && fg_thread != cur_thread
                && AttachThreadInput(fg_thread, cur_thread, true).as_bool();
            let _ = BringWindowToTop(hwnd);
            let _ = SetForegroundWindow(hwnd);
            if attached {
                let _ = AttachThreadInput(fg_thread, cur_thread, false);
            }
        }
    }
    let _ = window.set_focus();
}

#[tauri::command]
pub fn app_focus_main_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        reveal_main_window(&window);
    }
    Ok(())
}
pub fn place_window(app: &tauri::AppHandle, preferences: &Preferences) {
    if !preferences.launch_on_secondary {
        return;
    }
    if let Some(w) = app.get_webview_window("main") {
        if let (Ok(monitors), Ok(primary)) = (w.available_monitors(), w.primary_monitor()) {
            if let Some(m) = monitors.iter().find(|m| {
                primary
                    .as_ref()
                    .is_none_or(|p| p.position() != m.position())
            }) {
                let size = w.outer_size().unwrap_or(tauri::PhysicalSize {
                    width: 1400,
                    height: 900,
                });
                let x = m.position().x + (m.size().width.saturating_sub(size.width) / 2) as i32;
                let y = m.position().y + (m.size().height.saturating_sub(size.height) / 2) as i32;
                let _ = w.set_position(tauri::PhysicalPosition { x, y });
            }
        }
    }
}
#[tauri::command]
pub fn app_diagnostics(
    app: tauri::AppHandle,
    state: tauri::State<crate::AppState>,
    collector: tauri::State<crate::collector::Collector>,
) -> Result<serde_json::Value, String> {
    let status = collector.status();
    let db = state.0.lock().map_err(|_| "数据库锁错误")?;
    let snapshot = db.load_collection()?;
    let dataset = db.load()?;
    let resource = app.path().resource_dir().ok();
    let exe = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()));
    let available = |name: &str| {
        resource
            .iter()
            .chain(exe.iter())
            .any(|p| p.join(name).is_file())
            || std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                .join(
                    name.replace("helper/", "helper-bin/")
                        .replace("collector/", "collector-bin/myframe-collector/"),
                )
                .is_file()
    };
    Ok(
        serde_json::json!({"appVersion":app.package_info().version.to_string(),"collectorEnabled":status.enabled,"collectorRunning":status.running,"collectorCode":status.code,"accountCode":status.account_code,"gameDetected":crate::helper_inventory::game_pid().is_some(),"inventoryFailureStage":status.scan_code.strip_prefix("helper-invalid-inventory:"),"attemptInventoryComplete":status.scan.get("attemptInventoryComplete"),"missingInventoryGroups":status.scan.get("missingInventoryGroups"),"scanCode":status.scan_code,"lastReadAt":status.last_read_at,"inventoryPresent":snapshot.is_some(),"inventoryComplete":snapshot.as_ref().map(|s|s.complete),"inventoryAvailable":snapshot.as_ref().map(|s|s.inventory_available()),"inventoryCapturedAt":snapshot.as_ref().map(|s|&s.captured_at),"recordedPoints":dataset.general_data_points.len(),"recordedTrades":dataset.trades.len(),"helperAvailable":available("helper/warframe-api-helper.exe"),"ocrAvailable":available("collector/myframe-collector.exe")}),
    )
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn reference_inventory_and_rank_settings_roundtrip() {
        let defaults = Preferences::default();
        assert!(!defaults.full_inventory_experience_enabled);
        assert!(defaults.take_rank_into_account);
        let value = Preferences { full_inventory_experience_enabled: true, take_rank_into_account: false, ..defaults };
        let json = serde_json::to_string(&value).unwrap();
        assert_eq!(serde_json::from_str::<Preferences>(&json).unwrap(), value);
        let db = rusqlite::Connection::open_in_memory().unwrap();
        db.execute("CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT NOT NULL)", []).unwrap();
        db.execute("INSERT INTO settings(key,value) VALUES('app_preferences',?1)", [&json]).unwrap();
        assert_eq!(read(&db).unwrap(), value);
    }
    #[test]
    fn defaults_and_strict_fields() {
        assert_eq!(
            serde_json::from_str::<Preferences>("{}").unwrap(),
            Preferences::default()
        );
        assert!(serde_json::from_str::<Preferences>(r#"{"recordStats":"yes"}"#).is_err());
        assert!(serde_json::from_str::<Preferences>(r#"{"token":"secret"}"#).is_err());
        assert!(serde_json::from_str::<Preferences>(r#"{"closeAction":"invalid"}"#).is_err());
    }

    #[test]
    fn close_action_migrates_legacy_and_syncs_cache() {
        let legacy: Preferences = serde_json::from_str(r#"{"warnOnClose":false}"#).unwrap();
        assert_eq!(legacy.close_action, CloseAction::Close);
        assert!(!legacy.warn_on_close);

        let minimized: Preferences =
            serde_json::from_str(r#"{"closeAction":"minimize","warnOnClose":true}"#).unwrap();
        assert_eq!(minimized.close_action, CloseAction::Minimize);
        assert!(!minimized.warn_on_close);

        let ask: Preferences = serde_json::from_str(r#"{"closeAction":"ask"}"#).unwrap();
        assert_eq!(ask.close_action, CloseAction::Ask);
        assert!(ask.warn_on_close);

        sync_cached(&minimized);
        assert_eq!(cached_close_action(), CloseAction::Minimize);
        sync_cached(&legacy);
        assert_eq!(cached_close_action(), CloseAction::Close);
        sync_cached(&Preferences::default());
        assert_eq!(cached_close_action(), CloseAction::Ask);
    }
}

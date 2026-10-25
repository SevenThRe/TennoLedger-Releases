use rusqlite::OptionalExtension;
use serde::{Deserialize, Serialize};
use tauri::Manager;
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default, deny_unknown_fields)]
pub struct Preferences {
    pub warn_on_close: bool,
    pub launch_on_secondary: bool,
    pub record_stats: bool,
    pub stats_tab_enabled: bool,
    pub remember_market_status: bool,
    pub full_inventory_experience_enabled: bool,
    pub take_rank_into_account: bool,
}
impl Default for Preferences {
    fn default() -> Self {
        Self {
            warn_on_close: true,
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
    json.map(|s| serde_json::from_str(&s).map_err(|e| e.to_string()))
        .unwrap_or_else(|| Ok(Default::default()))
}
#[tauri::command]
pub fn app_preferences(state: tauri::State<crate::AppState>) -> Result<Preferences, String> {
    read(&state.0.lock().map_err(|_| "数据库锁错误")?.db)
}
#[tauri::command]
pub fn app_set_preferences(
    preferences: Preferences,
    state: tauri::State<crate::AppState>,
) -> Result<Preferences, String> {
    let db = state.0.lock().map_err(|_| "数据库锁错误")?;
    db.db.execute("INSERT INTO settings(key,value) VALUES('app_preferences',?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value",[serde_json::to_string(&preferences).map_err(|e|e.to_string())?]).map_err(|e|e.to_string())?;
    Ok(preferences)
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
        serde_json::json!({"appVersion":app.package_info().version.to_string(),"collectorEnabled":status.enabled,"collectorRunning":status.running,"collectorCode":status.code,"accountCode":status.account_code,"scanCode":status.scan_code,"lastReadAt":status.last_read_at,"inventoryPresent":snapshot.is_some(),"inventoryComplete":snapshot.as_ref().map(|s|s.complete),"inventoryCapturedAt":snapshot.as_ref().map(|s|&s.captured_at),"recordedPoints":dataset.general_data_points.len(),"recordedTrades":dataset.trades.len(),"helperAvailable":available("helper/warframe-api-helper.exe"),"ocrAvailable":available("collector/myframe-collector.exe")}),
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
    }
}

use tauri::Manager;

#[tauri::command]
pub fn update_configuration(app: tauri::AppHandle) -> serde_json::Value {
    #[cfg(feature="diagnostics")] let fixture=crate::update_fixture::enabled(app.config());
    #[cfg(not(feature="diagnostics"))] let fixture=false;
    let configured = (!app.config().identifier.starts_with("org.myframe.acceptance.")||fixture) && app.config().plugins.0.get("updater").is_some_and(|v| {
        v["pubkey"].as_str().is_some_and(|s| !s.trim().is_empty())
            && v["endpoints"].as_array().is_some_and(|a| !a.is_empty())
    });
    serde_json::json!({"configured": configured, "version": app.package_info().version.to_string()})
}

// Called only after download and signature verification. Keep settings unchanged.
#[tauri::command]
pub async fn update_prepare(app: tauri::AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<crate::collector::Collector>().stop();
        let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("update-backups");
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let name = format!("before-{}-{}.sqlite3", app.package_info().version,
            chrono::Utc::now().format("%Y%m%dT%H%M%S%fZ"));
        app.state::<crate::AppState>().0.lock().map_err(|_| "数据库繁忙".to_string())?
            .backup_to(&dir.join(name))
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn update_resume(app: tauri::AppHandle) -> Result<(), String> {
    let enabled = app.state::<crate::AppState>().0.lock()
        .map_err(|_| "数据库繁忙".to_string())?.auto_collect()?;
    if enabled { app.state::<crate::collector::Collector>().start(&app)?; }
    Ok(())
}

#[cfg(test)]
mod tests {
    use base64::Engine;
    #[test]
    #[ignore = "requires MYFRAME_UPDATE_MANIFEST pointing to a signed local build"]
    fn actual_signed_installer_accepts_original_and_rejects_tampering() {
        let manifest = std::path::PathBuf::from(std::env::var("MYFRAME_UPDATE_MANIFEST").unwrap());
        let value: serde_json::Value=serde_json::from_slice(&std::fs::read(&manifest).unwrap()).unwrap();
        let config:serde_json::Value=serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        let decode=|s:&str|String::from_utf8(base64::engine::general_purpose::STANDARD.decode(s.trim()).unwrap()).unwrap();
        let key=minisign_verify::PublicKey::decode(&decode(config["plugins"]["updater"]["pubkey"].as_str().unwrap())).unwrap();
        let entry=&value["platforms"]["windows-x86_64"];
        let sig=minisign_verify::Signature::decode(&decode(entry["signature"].as_str().unwrap())).unwrap();
        let url=reqwest::Url::parse(entry["url"].as_str().unwrap()).unwrap();
        let filename=url.path_segments().unwrap().next_back().unwrap();
        let mut bytes=std::fs::read(manifest.parent().unwrap().join(filename)).unwrap();
        key.verify(&bytes,&sig,false).unwrap();
        bytes[0]^=1;
        assert!(key.verify(&bytes,&sig,false).is_err());
        assert!(!value["version"].as_str().unwrap().is_empty());
    }
}

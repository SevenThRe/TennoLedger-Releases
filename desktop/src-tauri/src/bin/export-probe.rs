//! Actual SQLite -> JSON file -> fresh SQLite round trip; never prints account payloads.
#![allow(dead_code)]
#[cfg(test)]
#[path="../inventory_data.rs"] mod inventory_data;

#[path="../account_mastery.rs"] mod account_mastery;
#[path="../riven_inventory.rs"] mod riven_inventory;
#[path="../collection.rs"] mod collection;
#[path="../domain.rs"] mod domain;
#[path="../backup.rs"] mod backup;
#[path="../store.rs"] mod store;
#[path="../account_scope.rs"] mod account_scope;
#[path="../asset_history.rs"] mod asset_history;
#[path="../inventory_changes.rs"] mod inventory_changes;
#[path="../arbitration_run.rs"] mod arbitration_run;
#[path="../arbitration_history.rs"] mod arbitration_history;
fn main()->Result<(),Box<dyn std::error::Error>>{
    let path=std::path::PathBuf::from(std::env::var_os("APPDATA").ok_or("APPDATA missing")?).join("org.myframe.desktop/myframe.sqlite3");
    let db=rusqlite::Connection::open_with_flags(path,rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)?;
    db.execute_batch("BEGIN")?;
    use rusqlite::OptionalExtension;
    let data:Option<String>=db.query_row("SELECT payload FROM documents WHERE id=1",[],|r|r.get(0)).optional()?;
    let inventory:Option<String>=db.query_row("SELECT payload FROM collection WHERE id=1",[],|r|r.get(0)).optional()?;
    let data=match data{Some(s)=>domain::parse(&s)?,None=>Default::default()};
    let inventory=inventory.map(|s|collection::parse(&s)).transpose()?;
    db.execute_batch("COMMIT")?;
    let expected=serde_json::to_value((&data,&inventory))?;
    let json=backup::encode(data,inventory)?;
    struct Output(std::path::PathBuf);impl Drop for Output{fn drop(&mut self){let _=std::fs::remove_file(&self.0);}}
    let output=Output(std::env::temp_dir().join(format!("myframe-export-roundtrip-{}-{}.json",std::process::id(),chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default())));
    backup::write(&output.0,&json)?;
    let restored=backup::decode(&std::fs::read_to_string(&output.0)?)?;
    let mut target=store::Store::open(std::path::Path::new(":memory:"))?;
    target.restore_backup(&restored)?;
    let actual=serde_json::to_value((target.load()?,target.load_collection()?))?;
    if actual!=expected{return Err("Backup round trip changed data".into());}
    println!("{}",serde_json::json!({"status":"PASS_FILE_AND_SQLITE_ROUNDTRIP","bytes":json.len(),"countEntries":restored.collection.as_ref().map(|s|s.counts.len()),"rankEntries":restored.collection.as_ref().map(|s|s.ranks.len()),"trades":restored.data.trades.len(),"points":restored.data.general_data_points.len()}));
    Ok(())
}

#[cfg(windows)] #[path="../toolkit_toast.rs"] mod toolkit_toast;
#[path="../world.rs"] mod world;
#[path="../world_notify.rs"] mod world_notify;
#[cfg(windows)] #[path="../win_toast.rs"] mod win_toast;
fn main()->Result<(),String>{
    let output=std::env::args().nth(1).ok_or("Pass a public-world-status JSON output path")?;
    let path=std::env::temp_dir().join(format!("myframe-world-probe-{}-{}.sqlite3",std::process::id(),chrono::Utc::now().timestamp_millis()));
    let result=(||{
        let service=world::WorldService::new(path.clone())?;
        let status=service.refresh_once()?;
        let result=serde_json::json!({"stale":status.stale,"updatedAt":status.updated_at,"fissures":status.fissures.len(),"alerts":status.alerts.len(),"arbitrations":status.arbitrations.len(),"highValue":status.arbitrations.iter().filter(|e|matches!(e.rating.as_deref(),Some("S"|"A"))).count(),"cycles":status.cycles.len(),"sources":status.sources});
        let output=std::path::PathBuf::from(output);
        if let Some(parent)=output.parent(){std::fs::create_dir_all(parent).map_err(|e|e.to_string())?;}
        std::fs::write(output,serde_json::to_vec_pretty(&status).map_err(|e|e.to_string())?).map_err(|e|e.to_string())?;
        println!("{}",result);
        if status.stale{return Err("Official public feed was not validated as fresh".into());}
        Ok(())
    })();
    for suffix in ["","-wal","-shm"]{let _=std::fs::remove_file(format!("{}{suffix}",path.display()));}
    result
}

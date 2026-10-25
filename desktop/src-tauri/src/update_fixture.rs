//! Compiled only with `diagnostics`; exercise the real updater in an isolated profile.
const IDENTIFIER:&str="org.myframe.acceptance.updater-e2e";
pub fn enabled(config:&tauri::Config)->bool{
 config.identifier==IDENTIFIER && config.plugins.0.get("updater").and_then(|v|v["endpoints"].as_array()).is_some_and(|urls|urls.len()==1&&urls[0].as_str().is_some_and(loopback))
}
fn loopback(value:&str)->bool{reqwest::Url::parse(value).is_ok_and(|url|url.scheme()=="http"&&url.host_str()==Some("127.0.0.1")&&url.username().is_empty()&&url.password().is_none())}
pub fn apply(context:&mut tauri::Context<tauri::Wry>)->Result<(),String>{
 let Ok(endpoint)=std::env::var("TENNOLEDGER_UPDATE_E2E_ENDPOINT") else{return Ok(());};
 if context.config().identifier!=IDENTIFIER||!loopback(&endpoint){return Err("Updater fixture requires its isolated profile and literal loopback endpoint".into());}
 let base:serde_json::Value=serde_json::from_str(include_str!("../tauri.conf.json")).map_err(|e|e.to_string())?;
 let dir=std::env::var("TENNOLEDGER_UPDATE_E2E_INSTALL_DIR").map_err(|_|"Updater fixture install directory missing")?;
 if dir.chars().any(|c|c=='\"'||c.is_control())||!std::path::Path::new(&dir).is_absolute(){return Err("Invalid fixture install directory".into());}
 context.config_mut().plugins.0.insert("updater".into(),serde_json::json!({"pubkey":base["plugins"]["updater"]["pubkey"],"endpoints":[endpoint],"dangerousInsecureTransportProtocol":true,"windows":{"installMode":"quiet","installerArgs":[format!("/D={dir}")]}}));
 context.package_info_mut().version="0.0.9".parse().map_err(|_|"Invalid fixture version")?;
 for window in &mut context.config_mut().app.windows{window.visible=false;window.skip_taskbar=true;}
 Ok(())
}
#[cfg(test)]mod tests{
 use super::*;
 #[test]fn fixture_never_accepts_remote_or_credentialed_http(){
  assert!(loopback("http://127.0.0.1:43199/latest.json"));
  for url in ["https://127.0.0.1/latest.json","http://localhost/latest.json","http://example.com/latest.json","http://127.0.0.1.evil.test/latest.json","http://user@127.0.0.1/latest.json"]{assert!(!loopback(url));}
 }
}

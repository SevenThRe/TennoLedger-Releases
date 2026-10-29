//! Signed, per-file updates. Unchanged local files never enter the download plan.
use base64::Engine;
use serde::{Deserialize,Serialize};
use sha2::{Digest,Sha256};
use std::{collections::BTreeSet,fs,io::Read,path::{Path,PathBuf},sync::Mutex};
use tauri::{Emitter,Manager};
const BASE:&str="https://github.com/SevenThRe/TennoLedger-Releases/releases/";
const MAX_FILE:u64=512*1024*1024;
#[derive(Clone,Serialize,Deserialize)]
#[serde(deny_unknown_fields)]
pub struct FileEntry {pub path:String,pub sha256:String,pub size:u64,pub compressed_size:u64,pub offset:u64}
#[derive(Clone,Serialize,Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Manifest {pub schema:u32,pub version:String,pub archive_size:u64,pub files:Vec<FileEntry>}
#[derive(Clone,Serialize)]pub struct Offer {pub version:String,pub files:usize,pub bytes:u64}
#[derive(Clone,Serialize)]struct Change {path:String,sha256:String,size:u64,before:Option<String>}
struct Pending {manifest:Manifest,changed:Vec<FileEntry>,removed:Vec<String>,root:PathBuf,stage:PathBuf,token:String,downloaded:bool}
#[derive(Default)]pub struct Service(Mutex<Option<Pending>>);
fn version(value:&str)->Result<(u32,u32,u32),String>{let p=value.split('.').map(str::parse::<u32>).collect::<Result<Vec<_>,_>>().map_err(|_|"更新版本无效")?;if p.len()!=3{return Err("更新版本无效".into());}Ok((p[0],p[1],p[2]))}
fn valid_path(value:&str)->bool{
 (value=="myframe-desktop.exe"||value.starts_with("collector/")||value.starts_with("helper/"))&&value.len()<400&&value.split('/').all(|part|{
  let stem=part.split('.').next().unwrap_or("").to_ascii_uppercase();
  !part.is_empty()&&!matches!(part,"."|"..")&&!part.ends_with(['.',' '])&&!part.chars().any(|c|c.is_control()||"\\:<>\"|?*".contains(c))&&!matches!(stem.as_str(),"CON"|"PRN"|"AUX"|"NUL")&&!(stem.len()==4&&(stem.starts_with("COM")||stem.starts_with("LPT"))&&stem.ends_with(|c:char|c.is_ascii_digit()))
 })
}
fn no_links(path:&Path)->Result<(),String>{
 for p in path.ancestors(){if let Ok(m)=fs::symlink_metadata(p){
  #[cfg(windows)] {use std::os::windows::fs::MetadataExt;if m.file_attributes()&0x400!=0{return Err("更新路径包含链接".into());}}
  if m.file_type().is_symlink(){return Err("更新路径包含链接".into());}
 }}Ok(())
}
fn target(root:&Path,relative:&str)->Result<PathBuf,String>{if !valid_path(relative){return Err("更新文件路径无效".into());}let path=root.join(relative);no_links(&path)?;Ok(path)}
fn hash(path:&Path)->Result<Option<String>,String>{if !path.exists(){return Ok(None);}no_links(path)?;let mut f=fs::File::open(path).map_err(|e|e.to_string())?;let mut h=Sha256::new();let mut buf=[0;65536];loop{let n=f.read(&mut buf).map_err(|e|e.to_string())?;if n==0{break;}h.update(&buf[..n]);}Ok(Some(format!("{:x}",h.finalize())))}
fn validate(m:&Manifest)->Result<(),String>{
 version(&m.version)?;if m.schema!=1||m.archive_size>2*1024*1024*1024||m.files.is_empty()||m.files.len()>10000{return Err("更新清单结构无效".into());}
 let mut seen=BTreeSet::new();let mut total=0u64;
 for f in &m.files{if !valid_path(&f.path)||!seen.insert(f.path.to_ascii_lowercase())||f.sha256.len()!=64||!f.sha256.bytes().all(|b|b.is_ascii_hexdigit()&&!b.is_ascii_uppercase())||f.offset.checked_add(f.compressed_size).is_none_or(|end|end>m.archive_size)||f.size>MAX_FILE||f.compressed_size>MAX_FILE||f.compressed_size==0{return Err("更新文件条目无效".into());}total=total.checked_add(f.size).ok_or("更新体积无效")?;}
 if total>2*1024*1024*1024||!seen.contains("myframe-desktop.exe"){return Err("更新清单不完整或过大".into());}Ok(())
}
fn changed_files(manifest:&Manifest,root:&Path)->Result<Vec<FileEntry>,String>{
 let mut changed=vec![];for file in &manifest.files{if hash(&target(root,&file.path)?)?.as_deref()!=Some(file.sha256.as_str()){changed.push(file.clone());}}Ok(changed)
}
fn client()->Result<reqwest::blocking::Client,String>{reqwest::blocking::Client::builder().timeout(std::time::Duration::from_secs(300)).build().map_err(|e|e.to_string())}
fn bounded(mut response:reqwest::blocking::Response,max:u64)->Result<Vec<u8>,String>{response.error_for_status_ref().map_err(|e|e.to_string())?;if response.content_length().is_some_and(|n|n>max){return Err("更新响应过大".into());}let mut data=vec![];response.by_ref().take(max+1).read_to_end(&mut data).map_err(|e|e.to_string())?;if data.len() as u64>max{return Err("更新响应过大".into());}Ok(data)}
fn decode(value:&str)->Result<String,String>{String::from_utf8(base64::engine::general_purpose::STANDARD.decode(value.trim()).map_err(|e|e.to_string())?).map_err(|e|e.to_string())}
fn verify(raw:&[u8],sig:&str,key:&str)->Result<Manifest,String>{
 let key=minisign_verify::PublicKey::decode(&decode(key)?).map_err(|e|e.to_string())?;
 let signature=minisign_verify::Signature::decode(&decode(sig)?).map_err(|e|e.to_string())?;
 key.verify(raw,&signature,false).map_err(|_|"增量更新清单签名无效")?;
 let manifest:Manifest=serde_json::from_slice(raw).map_err(|e|e.to_string())?;validate(&manifest)?;Ok(manifest)
}
#[tauri::command]pub async fn incremental_check(app:tauri::AppHandle)->Result<Option<Offer>,String>{tauri::async_runtime::spawn_blocking(move||{
 if app.config().identifier.starts_with("org.myframe.acceptance."){return Ok(None);}
 let http=client()?;let response=http.get(format!("{BASE}latest/download/incremental.json")).timeout(std::time::Duration::from_secs(15)).send().map_err(|e|e.to_string())?;
 if response.status()==reqwest::StatusCode::NOT_FOUND{return Ok(None);}
 let raw=bounded(response,2*1024*1024)?;
 let sig=bounded(http.get(format!("{BASE}latest/download/incremental.json.sig")).send().map_err(|e|e.to_string())?,4096)?;
 let key=app.config().plugins.0.get("updater").and_then(|v|v["pubkey"].as_str()).ok_or("更新公钥缺失")?.to_owned();
 let manifest=verify(&raw,std::str::from_utf8(&sig).map_err(|e|e.to_string())?,&key)?;
 let service=app.state::<Service>();let mut guard=service.0.try_lock().map_err(|_|"更新操作正在进行")?;
 *guard=None;
 if version(&manifest.version)?<=version(&app.package_info().version.to_string())?{return Ok(None);}
 let exe=std::env::current_exe().map_err(|e|e.to_string())?;let root=exe.parent().ok_or("安装路径无效")?.to_path_buf();no_links(&root)?;
 let changed=changed_files(&manifest,&root)?;
 let baseline:Vec<String>=serde_json::from_str(include_str!(concat!(env!("OUT_DIR"),"/installed-file-list.json"))).map_err(|e|e.to_string())?;
 let latest:BTreeSet<_>=manifest.files.iter().map(|f|f.path.to_ascii_lowercase()).collect();
 let removed:Vec<_>=baseline.into_iter().filter(|p|!latest.contains(&p.to_ascii_lowercase())).collect();
 let token=format!("{}-{}",std::process::id(),chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default());let stage=root.join(".tennoledger-update").join(&token);no_links(&stage)?;
 let offer=Offer{version:manifest.version.clone(),files:changed.len()+removed.len(),bytes:changed.iter().map(|f|f.compressed_size).sum()};
 *guard=Some(Pending{manifest,changed,removed,root,stage,token,downloaded:false});Ok(Some(offer))
}).await.map_err(|e|e.to_string())?}
#[tauri::command]pub async fn incremental_download(app:tauri::AppHandle)->Result<(),String>{tauri::async_runtime::spawn_blocking(move||{
 let service=app.state::<Service>();let mut guard=service.0.try_lock().map_err(|_|"更新操作正在进行")?;let p=guard.as_mut().ok_or("请先检查更新")?;
 p.downloaded=false;no_links(&p.stage)?;fs::create_dir_all(&p.stage).map_err(|e|e.to_string())?;
 let http=client()?;let total:u64=p.changed.iter().map(|f|f.compressed_size).sum();let mut downloaded=0;let mut changes=vec![];
 for f in &p.changed{
  let before=hash(&target(&p.root,&f.path)?)?;
  let end=f.offset+f.compressed_size-1;
  let response=http.get(format!("{BASE}download/v{}/incremental.bin",p.manifest.version)).header(reqwest::header::RANGE,format!("bytes={}-{}",f.offset,end)).send().map_err(|e|e.to_string())?;
  let range=format!("bytes {}-{}/{}",f.offset,end,p.manifest.archive_size);
  if response.status()!=reqwest::StatusCode::PARTIAL_CONTENT||response.headers().get(reqwest::header::CONTENT_RANGE).and_then(|v|v.to_str().ok())!=Some(range.as_str()){return Err("更新源未返回正确的增量文件范围".into());}
  let mut response=response;let mut compressed=Vec::new();let mut buffer=[0;65536];
  loop{let n=response.read(&mut buffer).map_err(|e|e.to_string())?;if n==0{break;}compressed.extend_from_slice(&buffer[..n]);if compressed.len()as u64>f.compressed_size{return Err("更新响应过大".into());}
   let _=app.emit("incremental-progress",serde_json::json!({"downloaded":downloaded+compressed.len()as u64,"total":total}));
  }
  if compressed.len() as u64!=f.compressed_size{return Err("更新文件下载不完整".into());}
  let dest=target(&p.stage.join("files"),&f.path)?;fs::create_dir_all(dest.parent().unwrap()).map_err(|e|e.to_string())?;
  let mut output=fs::File::create(&dest).map_err(|e|e.to_string())?;let mut decoder=flate2::read::GzDecoder::new(compressed.as_slice());
  let written=std::io::copy(&mut decoder.by_ref().take(f.size+1),&mut output).map_err(|e|e.to_string())?;output.sync_all().map_err(|e|e.to_string())?;
  if written!=f.size||hash(&dest)?.as_deref()!=Some(f.sha256.as_str()){return Err("更新文件校验失败".into());}
  changes.push(Change{path:f.path.clone(),sha256:f.sha256.clone(),size:f.size,before});downloaded+=f.compressed_size;
  let _=app.emit("incremental-progress",serde_json::json!({"downloaded":downloaded,"total":total}));
 }
 let mut remove=vec![];for path in &p.removed{if let Some(before)=hash(&target(&p.root,path)?)?{remove.push(serde_json::json!({"path":path,"before":before}));}}
 let plan=serde_json::json!({"parent":std::process::id(),"root":p.root,"token":p.token,"version":p.manifest.version,"files":changes,"remove":remove});
 fs::write(p.stage.join("plan.json"),serde_json::to_vec(&plan).map_err(|e|e.to_string())?).map_err(|e|e.to_string())?;
 p.downloaded=true;Ok(())
}).await.map_err(|e|e.to_string())?}
#[tauri::command]pub fn incremental_install(app:tauri::AppHandle)->Result<(),String>{
 #[cfg(windows)] {
  use std::os::windows::process::CommandExt;
  let service=app.state::<Service>();let guard=service.0.try_lock().map_err(|_|"更新操作正在进行")?;let p=guard.as_ref().filter(|p|p.downloaded).ok_or("更新文件尚未校验完成")?;no_links(&p.stage)?;
  let runner=p.stage.join("TennoLedger.Update.exe");fs::write(&runner,include_bytes!(concat!(env!("OUT_DIR"),"/TennoLedger.Update.exe"))).map_err(|e|e.to_string())?;
  fs::write(p.stage.join("state"),b"prepared").map_err(|e|e.to_string())?;
  fs::write(p.root.join(".tennoledger-update/pending"),p.token.as_bytes()).map_err(|e|e.to_string())?;
  std::process::Command::new(runner).arg(&p.stage).creation_flags(0x08000000).spawn().map_err(|e|e.to_string())?;app.exit(0);Ok(())
 }
 #[cfg(not(windows))] {let _=app;Err("当前平台不支持增量安装".into())}
}
// Recover an interrupted file transaction before opening the database or single-instance lock.
pub fn recover_if_needed()->Result<bool,String>{
 #[cfg(windows)] {
  use std::os::windows::process::CommandExt;
  if std::env::var_os("TENNOLEDGER_UPDATE_ACK").is_some(){return Ok(false);}
  let exe=std::env::current_exe().map_err(|e|e.to_string())?;let base=exe.parent().ok_or("安装路径无效")?.join(".tennoledger-update");no_links(&base)?;
  let pending=base.join("pending");let Ok(token)=fs::read_to_string(&pending)else{return Ok(false);};
  if token.len()<8||token.len()>80||!token.bytes().all(|b|b.is_ascii_alphanumeric()||b==b'-'){return Err("更新恢复标记无效".into());}
  let stage=base.join(token);no_links(&stage)?;let state=fs::read_to_string(stage.join("state")).map_err(|e|e.to_string())?;
  if state=="committed"||state=="rolled-back"{let _=fs::remove_file(pending);return Ok(false);}
  let runner=stage.join("TennoLedger.Recovery.exe");fs::write(&runner,include_bytes!(concat!(env!("OUT_DIR"),"/TennoLedger.Update.exe"))).map_err(|e|e.to_string())?;
  std::process::Command::new(runner).arg(stage).arg("--recover").creation_flags(0x08000000).spawn().map_err(|e|e.to_string())?;
  Ok(true)
 }
 #[cfg(not(windows))] {Ok(false)}
}
#[tauri::command]pub fn incremental_ready(app:tauri::AppHandle)->Result<(),String>{
 if std::env::var_os("TENNOLEDGER_UPDATE_ROLLBACK").is_some(){return Err("上次更新失败，已恢复旧版。可以继续使用并导出诊断信息。".into());}
 let Ok(token)=std::env::var("TENNOLEDGER_UPDATE_ACK")else{return Ok(());};
 if token.len()<8||token.len()>80||!token.bytes().all(|b|b.is_ascii_alphanumeric()||b==b'-'){return Err("更新启动标记无效".into());}
 let exe=std::env::current_exe().map_err(|e|e.to_string())?;let dir=exe.parent().ok_or("安装路径无效")?.join(".tennoledger-update").join(token);no_links(&dir)?;
 if fs::read_to_string(dir.join("state")).ok().as_deref()==Some("starting"){
  fs::write(dir.join("ready"),b"ready").map_err(|e|e.to_string())?;
  app.state::<crate::collector::Collector>().watch_account(&app);
  let _=crate::updates::update_resume(app);
 }Ok(())
}
#[cfg(test)]mod tests{
 use super::*;
 #[test]fn paths_reject_escape_duplicates_and_unknown_roots(){for p in ["../x","collector/../x","helper/C:/x","collector/con.dll","collector/COM1.txt","collector/a.","collector/a ","collector//x","settings.json","collector/a\\b"]{assert!(!valid_path(p),"{p}");}for p in ["myframe-desktop.exe","collector/_internal/x.dll","helper/warframe-api-helper.exe"]{assert!(valid_path(p));}}
 #[test]fn versions_are_numeric_and_reject_invalid(){assert!(version("0.1.10").unwrap()>version("0.1.9").unwrap());for v in ["v1.2.3","1.2","1.2.3/../","1.2.3.4"]{assert!(version(v).is_err());}}
 #[test]fn only_changed_or_missing_files_are_selected(){
  let root=std::env::temp_dir().join(format!("tennoledger-diff-{}-{}",std::process::id(),chrono::Utc::now().timestamp_nanos_opt().unwrap()));fs::create_dir_all(root.join("helper")).unwrap();fs::write(root.join("myframe-desktop.exe"),b"same").unwrap();
  let entry=|path:&str,data:&[u8]|FileEntry{path:path.into(),sha256:format!("{:x}",Sha256::digest(data)),size:data.len()as u64,compressed_size:1,offset:0};
  let m=Manifest{schema:1,version:"0.1.6".into(),archive_size:1,files:vec![entry("myframe-desktop.exe",b"same"),entry("helper/new.dll",b"new")]};
  assert_eq!(changed_files(&m,&root).unwrap().iter().map(|f|f.path.as_str()).collect::<Vec<_>>(),vec!["helper/new.dll"]);
  fs::write(root.join("myframe-desktop.exe"),b"changed").unwrap();assert_eq!(changed_files(&m,&root).unwrap().len(),2);
  fs::remove_dir_all(root).unwrap();
 }
 #[test]#[ignore="requires signed incremental release artifacts"]fn actual_signed_incremental_manifest_and_archive(){
  use std::io::{Seek,SeekFrom};
  let folder=PathBuf::from(std::env::var("MYFRAME_UPDATE_MANIFEST").unwrap()).parent().unwrap().to_path_buf();
  let raw=fs::read(folder.join("incremental.json")).unwrap();let sig=fs::read_to_string(folder.join("incremental.json.sig")).unwrap();let config:serde_json::Value=serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
  let key=config["plugins"]["updater"]["pubkey"].as_str().unwrap();let m=verify(&raw,&sig,key).unwrap();
  let mut corrupted=raw.clone();corrupted[0]^=1;assert!(verify(&corrupted,&sig,key).is_err());
  let mut archive=fs::File::open(folder.join("incremental.bin")).unwrap();assert_eq!(archive.metadata().unwrap().len(),m.archive_size);
  for file in m.files{archive.seek(SeekFrom::Start(file.offset)).unwrap();let mut packed=vec![];archive.by_ref().take(file.compressed_size).read_to_end(&mut packed).unwrap();let decoder=flate2::read::GzDecoder::new(packed.as_slice());let mut out=vec![];decoder.take(file.size+1).read_to_end(&mut out).unwrap();assert_eq!(out.len()as u64,file.size);assert_eq!(format!("{:x}",Sha256::digest(&out)),file.sha256);}
 }
 #[test]fn tampered_or_unsigned_manifest_is_rejected(){assert!(verify(b"{}","bad","bad").is_err());}
}

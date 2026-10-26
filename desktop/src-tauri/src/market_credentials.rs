//! Only current-user DPAPI ciphertext is persisted; passwords never enter this store.
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SavedSession { pub token: String, pub platform: String }

pub fn path(directory: &Path) -> PathBuf { directory.join("wm-session.dpapi") }
fn valid(value: &SavedSession) -> bool {
    !value.token.is_empty() && value.token.len() <= 8192
        && value.token.bytes().all(|b| b.is_ascii_graphic())
        && ["pc", "ps4", "xbox", "switch"].contains(&value.platform.as_str())
}
pub fn save(path: &Path, value: &SavedSession) -> Result<(), String> {
    if !valid(value) { return Err("市场登录记录无效".into()); }
    let plain = serde_json::to_vec(value).map_err(|_| "无法保存市场登录")?;
    let cipher = protect(&plain, false)?;
    let mut bytes = b"TLWM1".to_vec(); bytes.extend(cipher);
    let parent = path.parent().ok_or("登录存储位置无效")?;
    std::fs::create_dir_all(parent).map_err(|_| "无法创建安全登录存储")?;
    let temporary = path.with_extension("dpapi.new");
    std::fs::write(&temporary, bytes).map_err(|_| "无法写入加密登录记录")?;
    if std::fs::rename(&temporary, path).is_err() {
        let _ = std::fs::remove_file(&temporary);
        return Err("无法更新加密登录记录".into());
    }
    Ok(())
}
pub fn load(path: &Path) -> Result<Option<SavedSession>, String> {
    let bytes = match std::fs::read(path) {
        Ok(bytes) => bytes,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err("无法读取保存的市场登录，请重新登录".into()),
    };
    if bytes.len() > 65536 || !bytes.starts_with(b"TLWM1") {
        return Err("保存的市场登录已损坏，请重新登录".into());
    }
    let plain = protect(&bytes[5..], true)?;
    let value: SavedSession = serde_json::from_slice(&plain).map_err(|_| "保存的市场登录无效，请重新登录")?;
    if !valid(&value) { return Err("保存的市场登录无效，请重新登录".into()); }
    Ok(Some(value))
}
pub fn clear(path: &Path) -> Result<(), String> {
    match std::fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(_) => Err("当前会话已断开，但保存的登录未能清除，请检查文件权限".into()),
    }
}

#[cfg(windows)]
fn protect(bytes: &[u8], decrypt: bool) -> Result<Vec<u8>, String> {
    #[repr(C)] struct Blob { len: u32, bytes: *mut u8 }
    #[link(name="crypt32")] extern "system" {
        fn CryptProtectData(input:*const Blob,description:*const u16,entropy:*const Blob,reserved:*mut std::ffi::c_void,prompt:*mut std::ffi::c_void,flags:u32,output:*mut Blob)->i32;
        fn CryptUnprotectData(input:*const Blob,description:*mut *mut u16,entropy:*const Blob,reserved:*mut std::ffi::c_void,prompt:*mut std::ffi::c_void,flags:u32,output:*mut Blob)->i32;
    }
    #[link(name="kernel32")] extern "system" { fn LocalFree(value:*mut std::ffi::c_void)->*mut std::ffi::c_void; }
    let input=Blob{len:bytes.len() as u32,bytes:bytes.as_ptr() as *mut u8};
    let mut output=Blob{len:0,bytes:std::ptr::null_mut()};
    let success=unsafe{if decrypt {CryptUnprotectData(&input,std::ptr::null_mut(),std::ptr::null(),std::ptr::null_mut(),std::ptr::null_mut(),1,&mut output)} else {CryptProtectData(&input,std::ptr::null(),std::ptr::null(),std::ptr::null_mut(),std::ptr::null_mut(),1,&mut output)}};
    if success==0 { return Err("Windows 无法保护或恢复此登录，请在当前用户下重新登录".into()); }
    let result=unsafe{std::slice::from_raw_parts(output.bytes,output.len as usize).to_vec()};
    unsafe{LocalFree(output.bytes.cast());} Ok(result)
}
#[cfg(not(windows))]
fn protect(_: &[u8], _: bool) -> Result<Vec<u8>, String> { Err("此平台尚未配置安全登录存储".into()) }

#[cfg(test)] mod tests {
    use super::*;
    #[cfg(windows)] #[test]
    fn encrypted_login_survives_a_fresh_process_and_logout_removes_it() {
        const TOKEN:&str="synthetic-session-token-for-dpapi-test";
        if let Some(path)=std::env::var_os("TENNOLEDGER_CREDENTIAL_TEST_CHILD") {
            let record=load(Path::new(&path)).unwrap().unwrap();
            assert_eq!(record.token,TOKEN);assert_eq!(record.platform,"pc");return;
        }
        let directory=std::env::temp_dir().join(format!("tennoledger-credentials-{}-{}",std::process::id(),chrono::Utc::now().timestamp_nanos_opt().unwrap()));
        let file=path(&directory);
        save(&file,&SavedSession{token:TOKEN.into(),platform:"pc".into()}).unwrap();
        save(&file,&SavedSession{token:TOKEN.into(),platform:"pc".into()}).unwrap();
        assert!(!std::fs::read(&file).unwrap().windows(TOKEN.len()).any(|v|v==TOKEN.as_bytes()));
        let child=std::process::Command::new(std::env::current_exe().unwrap())
            .args(["--exact","market_credentials::tests::encrypted_login_survives_a_fresh_process_and_logout_removes_it"])
            .env("TENNOLEDGER_CREDENTIAL_TEST_CHILD",&file).status().unwrap();
        assert!(child.success());clear(&file).unwrap();assert!(load(&file).unwrap().is_none());
        std::fs::remove_dir(directory).unwrap();
    }
}

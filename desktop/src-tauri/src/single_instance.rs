//! Product-wide ownership precedes all database/collector/WebView setup.
//! Acceptance profiles and copied EXEs must not create a second desktop app.
#[cfg(windows)]
mod platform {
 use windows::{core::{w,PCWSTR},Win32::{Foundation::{CloseHandle,GetLastError,HANDLE,HWND,ERROR_ALREADY_EXISTS,WAIT_ABANDONED,WAIT_OBJECT_0},System::Threading::{CreateMutexW,ReleaseMutex,WaitForSingleObject},UI::WindowsAndMessaging::{FindWindowW,SetForegroundWindow,ShowWindowAsync,SW_RESTORE}}};
 pub struct Guard(HANDLE);
 impl Drop for Guard{fn drop(&mut self){unsafe{let _=ReleaseMutex(self.0);let _=CloseHandle(self.0);}}}
 fn lock(name:PCWSTR)->Result<Option<Guard>,String>{unsafe{
  let handle=CreateMutexW(None,true,name).map_err(|_|"Cannot acquire TennoLedger instance lock")?;
  if GetLastError()!=ERROR_ALREADY_EXISTS{return Ok(Some(Guard(handle)));}
  // Reopening during shutdown/crash must be able to take released/abandoned ownership.
  let result=WaitForSingleObject(handle,0);
  if result==WAIT_OBJECT_0||result==WAIT_ABANDONED{return Ok(Some(Guard(handle)));}
  let _=CloseHandle(handle);Ok(None)
 }}
 // Explorer keeps same-title Windows.Internal.Shell.TabProxyWindow entries after
 // an app closes. They are not a desktop owner and must never block startup.
 fn main_window(title:PCWSTR)->Option<HWND>{unsafe{FindWindowW(w!("Tauri Window"),title).ok()}}
 pub fn acquire()->Result<Option<Guard>,String>{
  let owner=lock(w!("Local\\TennoLedger.Desktop.Singleton.v1"))?;
  if owner.is_some(){
   // Previous candidates predate the mutex. Respect their already-running main
   // window during migration instead of silently starting alongside them.
   for title in [w!("TennoLedger · 天诺手账"),w!("TennoLedger · 天诺手账 [验收]")]{
    if let Some(window)=main_window(title){unsafe{let _=ShowWindowAsync(window,SW_RESTORE);let _=SetForegroundWindow(window);}return Ok(None);}
   }
   return Ok(owner);
  }
  // The first process may still be constructing its window. Never initialize a
  // second database/collector while waiting for that same owner.
  for _ in 0..100{
   for title in [w!("TennoLedger · 天诺手账"),w!("TennoLedger · 天诺手账 [验收]")]{
    if let Some(window)=main_window(title){unsafe{let _=ShowWindowAsync(window,SW_RESTORE);let _=SetForegroundWindow(window);}return Ok(None);}
   }
   std::thread::sleep(std::time::Duration::from_millis(50));
  }
  Ok(None)
 }
 #[cfg(test)]mod tests{
  use super::*;
  #[test]fn same_title_non_tauri_window_cannot_block_desktop_startup(){
   use windows::Win32::UI::WindowsAndMessaging::{CreateWindowExW,DestroyWindow,WINDOW_EX_STYLE,WINDOW_STYLE};
   let text:Vec<u16>=format!("TennoLedger.Test.Proxy.{}\0",std::process::id()).encode_utf16().collect();let title=PCWSTR(text.as_ptr());
   unsafe{let window=CreateWindowExW(WINDOW_EX_STYLE::default(),w!("STATIC"),title,WINDOW_STYLE::default(),0,0,1,1,None,None,None,None).unwrap();
    assert!(FindWindowW(None,title).is_ok());assert!(main_window(title).is_none());DestroyWindow(window).unwrap();}
  }
  #[test]fn ownership_excludes_other_threads_and_is_reusable_after_close(){
   let text:Vec<u16>=format!("Local\\TennoLedger.Test.Singleton.{}\0",std::process::id()).encode_utf16().collect();
   let guard=lock(PCWSTR(text.as_ptr())).unwrap().unwrap();
   let other=text.clone();assert!(std::thread::spawn(move||lock(PCWSTR(other.as_ptr())).unwrap().is_none()).join().unwrap());
   drop(guard);assert!(lock(PCWSTR(text.as_ptr())).unwrap().is_some());
  }
 }
}
#[cfg(windows)]pub use platform::acquire;
#[cfg(not(windows))]pub fn acquire()->Result<Option<()>,String>{Ok(Some(()))}

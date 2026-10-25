//! Windows-only transport to the Microsoft Toolkit host, embedded in the app.
use crate::{world::Notice, world_notify::ClientDiagnostics};
use std::{collections::HashMap, io::{BufRead, BufReader, Write}, os::windows::process::CommandExt,
    process::{Child, ChildStdin, Command, Stdio}, sync::{Arc, Mutex, mpsc}, time::Duration};
use tauri::{Emitter, Manager};
type Pending = Arc<Mutex<HashMap<String, mpsc::SyncSender<Result<(), String>>>>>;
struct Host { child: Mutex<Child>, input: Mutex<ChildStdin>, pending: Pending }

fn install() -> Result<std::path::PathBuf, String> {
    // A packaged launcher can virtualize LocalAppData. Toolkit then resolves a
    // different executable identity from the LocalServer32 path used for clicks.
    let dir = std::path::PathBuf::from(std::env::var_os("USERPROFILE").ok_or("USERPROFILE 不可用")?)
        .join(".myframe/notifications");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let files: &[(&str, &[u8])] = &[
        ("MyFrame.Notifications.exe", include_bytes!(concat!(env!("OUT_DIR"), "/MyFrame.Notifications.exe"))),
        ("Microsoft.Toolkit.Uwp.Notifications.dll", include_bytes!("../notification-host/Microsoft.Toolkit.Uwp.Notifications.dll")),
        ("notification.png", include_bytes!("../icons/notification.png")),
        ("TOOLKIT-LICENSE.md", include_bytes!("../notification-host/TOOLKIT-LICENSE.md")),
    ];
    for (name, bytes) in files {
        let path = dir.join(name);
        if std::fs::read(&path).ok().as_deref() != Some(*bytes) {
            std::fs::write(&path, bytes).map_err(|e| format!("无法更新通知组件 {}：{e}", path.display()))?;
        }
    }
    Ok(dir.join("MyFrame.Notifications.exe"))
}
pub fn register(app: &tauri::AppHandle) -> Result<(), String> {
    if app.try_state::<Host>().is_some() { return Ok(()); }
    let exe = install()?;
    let mut child = Command::new(exe).args(["--parent-pid", &std::process::id().to_string()]).creation_flags(0x08000000)
        .stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null())
        .spawn().map_err(|e| format!("无法启动通知组件：{e}"))?;
    let input = child.stdin.take().ok_or("通知组件输入不可用")?;
    let output = child.stdout.take().ok_or("通知组件输出不可用")?;
    let pending: Pending = Arc::new(Mutex::new(HashMap::new()));
    let waiting = pending.clone();
    let handle = app.clone();
    let (ready_tx, ready_rx) = mpsc::sync_channel(1);
    std::thread::spawn(move || {
        for line in BufReader::new(output).lines() {
            let Ok(line) = line else { break };
            let Ok(event) = serde_json::from_str::<serde_json::Value>(&line) else { continue };
            if let Some(d) = handle.try_state::<ClientDiagnostics>() { d.record(event.clone()); }
            let kind = event["kind"].as_str().unwrap_or("");
            let id = event["id"].as_str().unwrap_or("");
            match kind {
                "ready" => { let _ = ready_tx.try_send(Ok(())); }
                "fatal" => { let _ = ready_tx.try_send(Err(event["error"].as_str().unwrap_or("通知组件失败").to_owned())); }
                "accepted" | "failed" => {
                    let error = event["error"].as_str().unwrap_or("Windows 通知发送失败").to_owned();
                    if let Some(tx) = waiting.lock().unwrap().remove(id) {
                        let _ = tx.send(if kind == "accepted" { Ok(()) } else { Err(error) });
                    } else if kind == "failed" {
                        if let Some(service) = handle.try_state::<Arc<crate::world::WorldService>>() {
                            if let Ok(notice) = service.notification_failure(id, error) {
                                let _ = handle.emit("world-notification-update", notice);
                            }
                        }
                    }
                }
                "activated" => if let Some(window) = handle.get_webview_window("main") {
                    let restored = window.unminimize().map_err(|e| e.to_string());
                    let shown = window.show().map_err(|e| e.to_string());
                    let focused = window.set_focus().map_err(|e| e.to_string());
                    if let Some(d) = handle.try_state::<ClientDiagnostics>() {
                        d.record(serde_json::json!({"stage":"notification-window-activate","restored":restored,"shown":shown,"focused":focused}));
                    }
                },
                _ => {}
            }
        }
        for (_, tx) in waiting.lock().unwrap().drain() { let _ = tx.send(Err("通知组件已退出".into())); }
    });
    let result = ready_rx.recv_timeout(Duration::from_secs(10)).map_err(|e| format!("通知组件初始化超时或退出：{e}"))
        .and_then(|r| r);
    if let Err(error) = result { let _ = child.kill(); let _ = child.wait(); return Err(error); }
    app.manage(Host { child: Mutex::new(child), input: Mutex::new(input), pending });
    Ok(())
}
pub fn send(app: &tauri::AppHandle, notice: &Notice) -> Result<(), String> {send_with_sound(app,notice,true)}
pub fn send_with_sound(app: &tauri::AppHandle, notice: &Notice,sound:bool) -> Result<(), String> {
    let host = app.try_state::<Host>().ok_or("Windows 通知组件未就绪")?;
    let (tx, rx) = mpsc::sync_channel(1);
    host.pending.lock().unwrap().insert(notice.id.clone(), tx);
    let payload = serde_json::json!({"id":notice.id,"title":notice.title,"body":notice.body,"silent":!sound});
    let write = writeln!(host.input.lock().unwrap(), "{payload}").map_err(|e| format!("通知组件通信失败：{e}"));
    let result = write.and_then(|_| rx.recv_timeout(Duration::from_secs(5))
        .map_err(|e| format!("通知组件未确认接收：{e}"))).and_then(|r| r);
    host.pending.lock().unwrap().remove(&notice.id);
    result
}
pub fn shutdown(app: &tauri::AppHandle) {
    if let Some(host) = app.try_state::<Host>() {
        let mut child = host.child.lock().unwrap(); let _ = child.kill(); let _ = child.wait();
    }
}

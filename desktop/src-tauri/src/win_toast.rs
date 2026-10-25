//! Windows notification-center delivery for the portable desktop build.
use crate::{world::Notice, world_notify::ClientDiagnostics};
use std::{
    collections::VecDeque,
    sync::{Mutex, OnceLock},
};
use tauri::{Emitter, Manager};
use windows::{
    core::{Interface, GUID, HSTRING, PCWSTR},
    Data::Xml::Dom::XmlDocument,
    Foundation::TypedEventHandler,
    Win32::{
        Foundation::PROPERTYKEY,
        System::{
            Com::{
                CoCreateInstance, IPersistFile,
                CLSCTX_INPROC_SERVER,
            },
            WinRT::{RoInitialize, RoUninitialize, RO_INIT_MULTITHREADED},
        },
        UI::Shell::{
            IShellLinkW, PropertiesSystem::IPropertyStore, SetCurrentProcessExplicitAppUserModelID,
            ShellLink,
        },
    },
    UI::Notifications::{
        NotificationSetting, ToastDismissedEventArgs, ToastFailedEventArgs, ToastNotification,
        ToastNotificationManager,
    },
};
const APP_ID: &str = "org.myframe.desktop";
#[path = "notification_identity.rs"]
mod notification_identity;
const ACTIVATOR: GUID = GUID::from_u128(0x7c60cb9b_6e86_4f7d_a387_d1407f1d8d2c);
const ACTIVATOR_TEXT: &str = "{7C60CB9B-6E86-4F7D-A387-D1407F1D8D2C}";
struct RegistryKey(windows::Win32::System::Registry::HKEY);
impl Drop for RegistryKey {
    fn drop(&mut self) {
        unsafe {
            let _ = windows::Win32::System::Registry::RegCloseKey(self.0);
        }
    }
}
fn registry_string(key: &str, name: &str, value: &str) -> windows::core::Result<()> {
    use windows::Win32::System::Registry::*;
    unsafe {
        let mut handle = HKEY::default();
        RegCreateKeyExW(
            HKEY_CURRENT_USER,
            PCWSTR(HSTRING::from(key).as_ptr()),
            None,
            PCWSTR::null(),
            REG_OPTION_NON_VOLATILE,
            KEY_SET_VALUE,
            None,
            &mut handle,
            None,
        )
        .ok()?;
        let guard = RegistryKey(handle);
        let data: Vec<u8> = value
            .encode_utf16()
            .chain(std::iter::once(0))
            .flat_map(u16::to_le_bytes)
            .collect();
        RegSetValueExW(
            guard.0,
            PCWSTR(HSTRING::from(name).as_ptr()),
            None,
            REG_SZ,
            Some(&data),
        )
        .ok()
    }
}
fn register_registry(exe: &std::path::Path) -> Result<(), String> {
    let dir =
        std::path::PathBuf::from(std::env::var_os("APPDATA").ok_or("APPDATA 不可用")?).join(APP_ID);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let icon = dir.join("notification.png");
    if !icon.exists() {
        std::fs::write(&icon, include_bytes!("../icons/notification.png")).map_err(|e| e.to_string())?;
    }
    let identity = format!("Software\\Classes\\AppUserModelId\\{APP_ID}");
    let result = (|| -> windows::core::Result<()> {
        registry_string(&identity, "DisplayName", "MyFrame")?;
        registry_string(&identity, "IconUri", &icon.to_string_lossy())?;
        registry_string(&identity, "IconBackgroundColor", "FFDDDDDD")?;
        registry_string(&identity, "CustomActivator", ACTIVATOR_TEXT)?;
        registry_string(
            &format!("Software\\Classes\\CLSID\\{ACTIVATOR_TEXT}\\LocalServer32"),
            "",
            &format!("\"{}\" --toast-activated", exe.display()),
        )
    })();
    result.map_err(|e| format!("Windows 通知应用身份注册失败：{e}"))
}
#[windows::core::implement(windows::Win32::UI::Notifications::INotificationActivationCallback)]
struct Activator {
    app: tauri::AppHandle,
}
impl windows::Win32::UI::Notifications::INotificationActivationCallback_Impl for Activator_Impl {
    fn Activate(
        &self,
        app_id: &PCWSTR,
        _args: &PCWSTR,
        _data: *const windows::Win32::UI::Notifications::NOTIFICATION_USER_INPUT_DATA,
        _count: u32,
    ) -> windows::core::Result<()> {
        if unsafe { app_id.to_string() }? != APP_ID {
            return Err(windows::core::Error::from_hresult(windows::core::HRESULT(
                0x80070005u32 as i32,
            )));
        }
        trace(
            &self.app,
            serde_json::json!({"stage":"toast-com-activated"}),
        );
        let app = self.app.clone();
        let handle = app.clone();
        app.run_on_main_thread(move || {
            if let Some(window) = handle.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        })
        .map_err(|_| {
            windows::core::Error::from_hresult(windows::core::HRESULT(0x80004005u32 as i32))
        })
    }
}
#[windows::core::implement(windows::Win32::System::Com::IClassFactory)]
struct Factory {
    app: tauri::AppHandle,
}
impl windows::Win32::System::Com::IClassFactory_Impl for Factory_Impl {
    fn CreateInstance(
        &self,
        outer: windows::core::Ref<windows::core::IUnknown>,
        iid: *const GUID,
        out: *mut *mut std::ffi::c_void,
    ) -> windows::core::Result<()> {
        if !outer.is_null() {
            return Err(windows::core::Error::from_hresult(windows::core::HRESULT(
                0x80040110u32 as i32,
            )));
        }
        if iid.is_null() || out.is_null() {
            return Err(windows::core::Error::from_hresult(windows::core::HRESULT(
                0x80004003u32 as i32,
            )));
        }
        let callback: windows::Win32::UI::Notifications::INotificationActivationCallback =
            Activator {
                app: self.app.clone(),
            }
            .into();
        unsafe { callback.query(iid, out).ok() }
    }
    fn LockServer(&self, _lock: windows::core::BOOL) -> windows::core::Result<()> {
        Ok(())
    }
}
struct ActivationServer(std::sync::mpsc::Sender<()>);
impl Drop for ActivationServer {
    fn drop(&mut self) {
        let _ = self.0.send(());
    }
}
fn start_activator(app: &tauri::AppHandle) -> Result<(), String> {
    if app.try_state::<ActivationServer>().is_some() {
        return Ok(());
    }
    let (stop, wait) = std::sync::mpsc::channel();
    let (send, result) = std::sync::mpsc::sync_channel(1);
    let handle = app.clone();
    std::thread::spawn(move || {
        use windows::Win32::System::Com::*;
        apartment();
        let factory: IClassFactory = Factory { app: handle }.into();
        match unsafe {
            CoRegisterClassObject(
                &ACTIVATOR,
                &factory,
                CLSCTX_LOCAL_SERVER,
                REGCLS_MULTIPLEUSE,
            )
        } {
            Ok(cookie) => {
                let _ = send.send(Ok(()));
                let _ = wait.recv();
                unsafe {
                    let _ = CoRevokeClassObject(cookie);
                }
            }
            Err(error) => {
                let _ = send.send(Err(format!("Windows 通知激活器注册失败：{error}")));
            }
        }
    });
    result
        .recv_timeout(std::time::Duration::from_secs(5))
        .map_err(|_| "Windows 通知激活器注册超时".to_string())??;
    app.manage(ActivationServer(stop));
    Ok(())
}
pub fn shutdown(app: &tauri::AppHandle) {
    if let Some(server) = app.try_state::<ActivationServer>() {
        let _ = server.0.send(());
    }
}
static LIVE: OnceLock<Mutex<VecDeque<ToastNotification>>> = OnceLock::new();
thread_local! {static APARTMENT: Apartment = Apartment(unsafe {RoInitialize(RO_INIT_MULTITHREADED)}.is_ok());}
struct Apartment(bool);
impl Drop for Apartment {
    fn drop(&mut self) {
        if self.0 {
            unsafe {
                RoUninitialize();
            }
        }
    }
}
fn apartment() {
    APARTMENT.with(|_| ());
}
fn trace(app: &tauri::AppHandle, event: serde_json::Value) {
    if let Some(d) = app.try_state::<ClientDiagnostics>() {
        d.record(event);
    }
}

/// Start-menu identity is required for non-MSIX/portable Win32 toast senders.
/// It registers this application only; no notification preferences are changed.
pub fn register(app: &tauri::AppHandle) -> Result<(), String> {
    apartment();
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let folder = std::path::PathBuf::from(std::env::var_os("APPDATA").ok_or("APPDATA 不可用")?)
        .join("Microsoft/Windows/Start Menu/Programs/MyFrame");
    std::fs::create_dir_all(&folder).map_err(|e| e.to_string())?;
    let shortcut = folder.join("MyFrame.lnk");
    let path = HSTRING::from(exe.as_os_str());
    let shortcut_path = HSTRING::from(shortcut.as_os_str());
    let appid = HSTRING::from(APP_ID);
    let result = unsafe {
        (move || -> windows::core::Result<()> {
            SetCurrentProcessExplicitAppUserModelID(PCWSTR(appid.as_ptr()))?;
            let link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER)?;
            link.SetPath(PCWSTR(path.as_ptr()))?;
            link.SetDescription(windows::core::w!("MyFrame 星际战甲助手"))?;
            link.SetIconLocation(PCWSTR(path.as_ptr()), 0)?;
            let store: IPropertyStore = link.cast()?;
            let key = PROPERTYKEY {
                fmtid: GUID::from_u128(0x9f4c2855_9f79_4b39_a8d0_e1d42de1d5f3),
                pid: 5,
            };
            store.SetValue(&key, &notification_identity::shell_string(APP_ID)?)?;
            let activation_key = PROPERTYKEY {
                fmtid: key.fmtid,
                pid: 26,
            };
            let activation_value =
                windows::Win32::System::Com::StructuredStorage::InitPropVariantFromCLSID(
                    &ACTIVATOR,
                )?;
            store.SetValue(&activation_key, &activation_value)?;
            store.Commit()?;
            let persisted: IPersistFile = link.cast()?;
            persisted.Save(PCWSTR(shortcut_path.as_ptr()), true)?;
            windows::Win32::UI::Shell::SHChangeNotify(
                windows::Win32::UI::Shell::SHCNE_UPDATEITEM,
                windows::Win32::UI::Shell::SHCNF_PATHW | windows::Win32::UI::Shell::SHCNF_FLUSH,
                Some(shortcut_path.as_ptr() as *const std::ffi::c_void),
                None,
            );
            Ok(())
        })()
    };
    result.map_err(|e| format!("Windows 通知快捷方式注册失败：{e}"))?;
    register_registry(&exe)?;
    start_activator(app)?;
    Ok(())
}
fn escape_xml(text: &str) -> String {
    text.chars()
        .filter(|c| {
            matches!(*c, '\t' | '\n' | '\r') || (*c >= ' ' && *c != '\u{fffe}' && *c != '\u{ffff}')
        })
        .map(|c| match c {
            '&' => "&amp;".into(),
            '<' => "&lt;".into(),
            '>' => "&gt;".into(),
            '"' => "&quot;".into(),
            '\'' => "&apos;".into(),
            _ => c.to_string(),
        })
        .collect()
}
// Windows creates a new sender's notification-settings entry on its first Show.
// ERROR_NOT_FOUND before that first send means uninitialized, not disabled.
fn check_setting(
    result: windows::core::Result<NotificationSetting>,
) -> windows::core::Result<Option<NotificationSetting>> {
    match result {
        Ok(setting) if setting == NotificationSetting::Enabled => Ok(Some(setting)),
        Ok(setting) => Err(windows::core::Error::new(
            windows::core::HRESULT(0x80070005u32 as i32),
            format!(
                "Windows 通知被禁用（状态 {}），请检查系统通知设置",
                setting.0
            ),
        )),
        Err(error) if error.code() == windows::core::HRESULT(0x80070490u32 as i32) => Ok(None),
        Err(error) => Err(error),
    }
}
pub fn send(app: &tauri::AppHandle, notice: &Notice) -> Result<(), String> {
    apartment();
    let run = || -> windows::core::Result<()> {
        let notifier = ToastNotificationManager::CreateToastNotifierWithId(&HSTRING::from(APP_ID))?;
        let setting = check_setting(notifier.Setting())?;
        trace(
            app,
            serde_json::json!({"stage":"toast-setting","value":setting.map(|s|s.0),"initialized":setting.is_some(),"id":notice.id}),
        );
        let xml = XmlDocument::new()?;
        xml.LoadXml(&HSTRING::from(format!("<toast duration=\"long\"><visual><binding template=\"ToastGeneric\"><text>{}</text><text>{}</text></binding></visual></toast>",escape_xml(&notice.title),escape_xml(&notice.body))))?;
        let toast = ToastNotification::CreateToastNotification(&xml)?;
        toast.SetSuppressPopup(false)?;
        let tag = format!("{:016x}", chrono::Utc::now().timestamp_micros() as u64);
        toast.SetTag(&HSTRING::from(&tag))?;
        toast.SetGroup(&HSTRING::from("world"))?;
        let handle = app.clone();
        let id = notice.id.clone();
        toast.Failed(
            &TypedEventHandler::<ToastNotification, ToastFailedEventArgs>::new(move |_, args| {
                let error = format!(
                    "Windows Toast 异步发送失败：{:?}",
                    args.as_ref().and_then(|a| a.ErrorCode().ok())
                );
                trace(
                    &handle,
                    serde_json::json!({"stage":"toast-failed","id":id,"error":error}),
                );
                let app = handle.clone();
                let notice_id = id.clone();
                std::thread::spawn(move || {
                    if let Some(service) =
                        app.try_state::<std::sync::Arc<crate::world::WorldService>>()
                    {
                        if let Ok(notice) = service.notification_failure(&notice_id, error) {
                            let _ = app.emit("world-notification-update", notice);
                        }
                    }
                });
                Ok(())
            }),
        )?;
        let handle = app.clone();
        let id = notice.id.clone();
        toast.Dismissed(&TypedEventHandler::<ToastNotification,ToastDismissedEventArgs>::new(move|_,args|{
            trace(&handle,serde_json::json!({"stage":"toast-dismissed","id":id,"reason":args.as_ref().and_then(|a|a.Reason().ok()).map(|r|r.0)}));Ok(())
        }))?;
        let handle = app.clone();
        let id = notice.id.clone();
        toast.Activated(&TypedEventHandler::<
            ToastNotification,
            windows::core::IInspectable,
        >::new(move |_, _| {
            trace(
                &handle,
                serde_json::json!({"stage":"toast-activated","id":id}),
            );
            if let Some(window) = handle.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
            Ok(())
        }))?;
        notifier.Show(&toast)?;
        let mut live = LIVE
            .get_or_init(|| Mutex::new(VecDeque::new()))
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        live.push_back(toast);
        while live.len() > 64 {
            live.pop_front();
        }
        drop(live);
        let handle = app.clone();
        let id = notice.id.clone();
        std::thread::spawn(move || {
            apartment();
            std::thread::sleep(std::time::Duration::from_millis(750));
            let found = (|| -> windows::core::Result<bool> {
                let history = ToastNotificationManager::History()?
                    .GetHistoryWithId(&HSTRING::from(APP_ID))?;
                for i in 0..history.Size()? {
                    let toast = history.GetAt(i)?;
                    if toast.Tag()?.to_string_lossy() == tag {
                        return Ok(true);
                    }
                }
                Ok(false)
            })();
            trace(
                &handle,
                serde_json::json!({"stage":"toast-history-check","id":id,"present":found.as_ref().ok(),"error":found.err().map(|e|e.to_string())}),
            );
        });
        Ok(())
    };
    run().map_err(|e| format!("Windows Toast 发送失败：{e}"))
}
#[test]
fn toast_xml_never_interprets_title_or_body_as_markup() {
    assert_eq!(
        escape_xml("<a x='1'>&\"😀中\u{0001}"),
        "&lt;a x=&apos;1&apos;&gt;&amp;&quot;😀中"
    );
}
#[test]
fn first_send_missing_settings_does_not_bypass_disabled_notifications() {
    assert_eq!(
        check_setting(Err(windows::core::Error::from_hresult(
            windows::core::HRESULT(0x80070490u32 as i32)
        )))
        .unwrap(),
        None
    );
    assert_eq!(
        check_setting(Ok(NotificationSetting::Enabled)).unwrap(),
        Some(NotificationSetting::Enabled)
    );
    assert!(check_setting(Ok(NotificationSetting::DisabledForApplication)).is_err());
    assert!(check_setting(Ok(NotificationSetting::DisabledByGroupPolicy)).is_err());
    assert!(check_setting(Err(windows::core::Error::from_hresult(
        windows::core::HRESULT(0x80070005u32 as i32)
    )))
    .is_err());
}

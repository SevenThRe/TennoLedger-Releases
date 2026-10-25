//! Same payload and identity as tools/notifications/toast-probe.c.
#[cfg(windows)]
#[path = "../notification_identity.rs"]
mod notification_identity;
#[cfg(windows)]
fn main() -> windows::core::Result<()> {
    use windows::{core::HSTRING, Data::Xml::Dom::XmlDocument,
        UI::Notifications::{ToastNotification, ToastNotificationManager},
        Win32::System::WinRT::{RoInitialize, RoUninitialize, RO_INIT_MULTITHREADED}};
    unsafe { RoInitialize(RO_INIT_MULTITHREADED)?; }
    let app_id = std::env::args().nth(1).unwrap_or_else(|| "org.myframe.desktop".into());
    unsafe {
        windows::Win32::UI::Shell::SetCurrentProcessExplicitAppUserModelID(&HSTRING::from(&app_id))?;
    }
    if std::env::args().any(|a| a == "--register-probe") {
        assert_eq!(app_id, "MyFrame.NotificationProbe.20261023");
        register_probe(&app_id)?;
        return Ok(());
    }
    let notifier = ToastNotificationManager::CreateToastNotifierWithId(&HSTRING::from(&app_id))?;
    let xml = XmlDocument::new()?;
    let control = std::env::args().any(|a| a == "--control");
    let content = if control {
        "<toast duration=\"long\"><visual><binding template=\"ToastGeneric\"><text>MyFrame 通知通道对照测试</text><text>这条消息由 MyFrame 诊断程序发送，临时使用已登记的通知通道。</text></binding></visual></toast>"
    } else {
        "<toast duration=\"long\"><visual><binding template=\"ToastGeneric\"><text>MyFrame Rust ABI test</text><text>Same identity and Windows notification API.</text></binding></visual></toast>"
    };
    xml.LoadXml(&HSTRING::from(content))?;
    let toast = ToastNotification::CreateToastNotification(&xml)?;
    if control {
        toast.SetTag(&HSTRING::from("myframe-control"))?;
        toast.SetGroup(&HSTRING::from("myframe-diag"))?;
    }
    let result = notifier.Show(&toast);
    println!("Show={result:?}");
    std::thread::sleep(std::time::Duration::from_secs(10));
    drop(toast); drop(xml); drop(notifier);
    unsafe { RoUninitialize(); }
    result
}
#[cfg(windows)]
fn register_probe(app_id: &str) -> windows::core::Result<()> {
    use windows::{core::{Interface, HSTRING, PCWSTR, GUID}, Win32::{
        Foundation::PROPERTYKEY,
        System::Com::{CoCreateInstance, IPersistFile, CLSCTX_INPROC_SERVER},
        UI::Shell::{IShellLinkW, ShellLink, PropertiesSystem::IPropertyStore, SHChangeNotify, SHCNE_CREATE, SHCNF_PATHW, SHCNF_FLUSH},
    }};
    let exe = HSTRING::from(std::env::current_exe().unwrap().as_os_str());
    let path = std::path::PathBuf::from(std::env::var_os("APPDATA").unwrap())
        .join("Microsoft/Windows/Start Menu/Programs/MyFrame Notification Probe.lnk");
    let path = HSTRING::from(path.as_os_str());
    unsafe {
        let link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER)?;
        link.SetPath(PCWSTR(exe.as_ptr()))?;
        link.SetArguments(&HSTRING::from(app_id))?;
        link.SetDescription(windows::core::w!("MyFrame notification identity isolation test"))?;
        let store: IPropertyStore = link.cast()?;
        let key = PROPERTYKEY { fmtid: GUID::from_u128(0x9f4c2855_9f79_4b39_a8d0_e1d42de1d5f3), pid: 5 };
        store.SetValue(&key, &notification_identity::shell_string(app_id)?)?;
        store.Commit()?;
        let file: IPersistFile = link.cast()?;
        file.Save(PCWSTR(path.as_ptr()), true)?;
        SHChangeNotify(SHCNE_CREATE, SHCNF_PATHW | SHCNF_FLUSH, Some(path.as_ptr().cast()), None);
    }
    println!("probe shortcut created");
    Ok(())
}
#[cfg(not(windows))]
fn main() { eprintln!("Windows only"); }

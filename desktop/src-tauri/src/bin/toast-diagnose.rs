#[cfg(windows)]
use windows::{
    core::HSTRING,
    Data::Xml::Dom::XmlDocument,
    Win32::System::WinRT::{RoInitialize, RO_INIT_MULTITHREADED},
    UI::Notifications::{ToastNotification, ToastNotificationManager},
};
#[cfg(windows)]
#[path = "../notification_identity.rs"]
mod notification_identity;
#[cfg(windows)]
fn main() {
    println!("initialize={:?}", unsafe {
        RoInitialize(RO_INIT_MULTITHREADED)
    });
    if std::env::args().nth(1).as_deref() == Some("--inspect-link") {
        use windows::{core::{Interface, GUID, PCWSTR}, Win32::{Foundation::PROPERTYKEY,
            System::Com::{CoCreateInstance, IPersistFile, CLSCTX_INPROC_SERVER, STGM_READ},
            UI::Shell::{IShellLinkW, ShellLink, PropertiesSystem::IPropertyStore}}};
        let path = HSTRING::from(std::env::args().nth(2).expect("link path"));
        unsafe {
            let link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER).unwrap();
            let file: IPersistFile = link.cast().unwrap();
            file.Load(PCWSTR(path.as_ptr()), STGM_READ).unwrap();
            let store: IPropertyStore = link.cast().unwrap();
            let key = PROPERTYKEY { fmtid: GUID::from_u128(0x9f4c2855_9f79_4b39_a8d0_e1d42de1d5f3), pid: 5 };
            let value = store.GetValue(&key).unwrap();
            println!("AppID type={:?} value={value}", value.Anonymous.Anonymous.vt);
        }
        return;
    }
    if std::env::args().any(|a| a == "--repair-link") {
        use windows::{
            core::{Interface, GUID, PCWSTR},
            Win32::{
                Foundation::PROPERTYKEY,
                System::Com::{
                    CoCreateInstance, IPersistFile, StructuredStorage::InitPropVariantFromCLSID,
                    CLSCTX_INPROC_SERVER, STGM_READWRITE,
                },
                UI::Shell::{
                    IShellLinkW, PropertiesSystem::IPropertyStore, SHChangeNotify, ShellLink,
                    SHCNE_UPDATEITEM, SHCNF_FLUSH, SHCNF_PATHW,
                },
            },
        };
        let path = std::path::PathBuf::from(std::env::var_os("APPDATA").unwrap())
            .join("Microsoft/Windows/Start Menu/Programs/MyFrame/MyFrame.lnk");
        let hpath = HSTRING::from(path.as_os_str());
        unsafe {
            let link: IShellLinkW =
                CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER).unwrap();
            let file: IPersistFile = link.cast().unwrap();
            file.Load(PCWSTR(hpath.as_ptr()), STGM_READWRITE).unwrap();
            let store: IPropertyStore = link.cast().unwrap();
            let app_key = PROPERTYKEY {
                fmtid: GUID::from_u128(0x9f4c2855_9f79_4b39_a8d0_e1d42de1d5f3),
                pid: 5,
            };
            let before = store.GetValue(&app_key).unwrap();
            println!("shortcut-appid-type-before={:?}", before.Anonymous.Anonymous.vt);
            // A same-text SetValue can retain the old property's type. Remove it first.
            store.SetValue(&app_key, &windows::Win32::System::Com::StructuredStorage::PROPVARIANT::default()).unwrap();
            store.Commit().unwrap();
            store.SetValue(&app_key, &notification_identity::shell_string("org.myframe.desktop").unwrap()).unwrap();
            let key = PROPERTYKEY {
                fmtid: GUID::from_u128(0x9f4c2855_9f79_4b39_a8d0_e1d42de1d5f3),
                pid: 26,
            };
            let guid = GUID::from_u128(0x7c60cb9b_6e86_4f7d_a387_d1407f1d8d2c);
            store
                .SetValue(&key, &InitPropVariantFromCLSID(&guid).unwrap())
                .unwrap();
            store.Commit().unwrap();
            file.Save(PCWSTR(hpath.as_ptr()), true).unwrap();
            SHChangeNotify(
                SHCNE_UPDATEITEM,
                SHCNF_PATHW | SHCNF_FLUSH,
                Some(hpath.as_ptr() as *const std::ffi::c_void),
                None,
            );
        }
        println!("shortcut-activator=REPAIRED");
    }
    for id in ["org.myframe.desktop", "Microsoft.Windows.PowerShell"] {
        match ToastNotificationManager::CreateToastNotifierWithId(&HSTRING::from(id)) {
            Ok(n) => {
                println!("id={id} create=OK setting={:?}", n.Setting());
                if id == "org.myframe.desktop" && std::env::args().any(|a| a == "--send") {
                    let xml = XmlDocument::new().unwrap();
                    xml.LoadXml(&HSTRING::from("<toast duration=\"long\"><visual><binding template=\"ToastGeneric\"><text>MyFrame 系统通知测试</text><text>正在验证首次发送后的 Windows 通知注册。</text></binding></visual></toast>")).unwrap();
                    let toast = ToastNotification::CreateToastNotification(&xml).unwrap();
                    toast.SetTag(&HSTRING::from("native-probe")).unwrap();
                    toast.SetGroup(&HSTRING::from("world")).unwrap();
                    println!("show={:?}", n.Show(&toast));
                    std::thread::sleep(std::time::Duration::from_secs(2));
                    println!("setting-after-show={:?}", n.Setting());
                    println!(
                        "history={:?}",
                        ToastNotificationManager::History()
                            .and_then(|h| h.GetHistoryWithId(&HSTRING::from(id)))
                            .and_then(|v| v.Size())
                    );
                }
            }
            Err(e) => println!("id={id} create=ERROR {e:?}"),
        }
    }
}

#[cfg(not(windows))]
fn main() {
    eprintln!("Windows notification diagnostics are only available on Windows.");
}

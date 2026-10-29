fn main() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        println!("cargo:rerun-if-changed=notification-host/Program.cs");
        println!("cargo:rerun-if-changed=tauri.conf.json");
        println!("cargo:rerun-if-changed=icons/tenno-ledger.ico");
        println!("cargo:rerun-if-changed=notification-host/Microsoft.Toolkit.Uwp.Notifications.dll");
        println!("cargo:rerun-if-changed=../../tools/notifications/build-host.ps1");
        let status = std::process::Command::new("powershell.exe")
            .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "../../tools/notifications/build-host.ps1", "-OutputDirectory"])
            .arg(std::env::var_os("OUT_DIR").unwrap()).status().expect("start notification host compiler");
        assert!(status.success(), "notification host build failed");
    }
    tauri_build::build()
}

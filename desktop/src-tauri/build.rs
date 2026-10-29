fn installed_files(dir: &std::path::Path, prefix: &str, out: &mut Vec<String>) {
    if !dir.exists() { return; }
    for entry in std::fs::read_dir(dir).expect("inventory resources") {
        let entry=entry.unwrap();let name=format!("{prefix}/{}",entry.file_name().to_string_lossy());
        let kind=entry.file_type().unwrap();assert!(!kind.is_symlink(),"resource links are not allowed");
        if kind.is_dir(){installed_files(&entry.path(),&name,out);}else if kind.is_file(){out.push(name);}
    }
}
fn main() {
    let mut baseline=vec!["myframe-desktop.exe".to_owned()];
    installed_files(std::path::Path::new("collector-bin/myframe-collector"),"collector",&mut baseline);
    installed_files(std::path::Path::new("helper-bin"),"helper",&mut baseline);
    baseline.sort();
    std::fs::write(std::path::PathBuf::from(std::env::var_os("OUT_DIR").unwrap()).join("installed-file-list.json"),serde_json::to_vec(&baseline).unwrap()).unwrap();
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        println!("cargo:rerun-if-changed=update-host/Program.cs");
        let compiler = std::path::PathBuf::from(std::env::var_os("WINDIR").unwrap()).join("Microsoft.NET/Framework64/v4.0.30319/csc.exe");
        let runner = std::path::PathBuf::from(std::env::var_os("OUT_DIR").unwrap()).join("TennoLedger.Update.exe");
        let compiled = std::process::Command::new(compiler).args(["/nologo", "/target:winexe", "/reference:System.Web.Extensions.dll"])
            .arg(format!("/out:{}", runner.display())).arg(std::env::current_dir().unwrap().join("update-host").join("Program.cs")).status().expect("start incremental update compiler");
        assert!(compiled.success(), "incremental update helper build failed");
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

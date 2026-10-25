//! Isolated execution of the explicitly selected upstream helper. Child output
//! is discarded because upstream diagnostics can contain authentication values.
use serde_json::Value;
use std::{
    fs,
    io::Read,
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::atomic::{AtomicU64, Ordering},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
const LIMIT: u64 = 16 * 1024 * 1024;
static NEXT: AtomicU64 = AtomicU64::new(0);
struct WorkDir(PathBuf, PathBuf);
impl WorkDir {
    fn new() -> Result<Self, String> {
        let root = fs::canonicalize(std::env::temp_dir()).map_err(|_| "helper-start-failed")?;
        for _ in 0..32 {
            let stamp = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos();
            let p = root.join(format!(
                "myframe-helper-{}-{stamp}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed)
            ));
            match fs::create_dir(&p) {
                Ok(()) => return Ok(Self(p, root)),
                Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
                Err(_) => return Err("helper-start-failed".into()),
            }
        }
        Err("helper-start-failed".into())
    }
    fn cleanup(&self) -> Result<(), String> {
        if !self.0.try_exists().map_err(|_| "helper-cleanup-failed")? {
            return Ok(());
        }
        let target = fs::canonicalize(&self.0).map_err(|_| "helper-cleanup-failed")?;
        if target != self.0
            || target.parent() != Some(self.1.as_path())
            || !target
                .file_name()
                .is_some_and(|n| n.to_string_lossy().starts_with("myframe-helper-"))
        {
            return Err("helper-cleanup-failed".into());
        }
        fs::remove_dir_all(&target).map_err(|_| "helper-cleanup-failed".into())
    }
}
impl Drop for WorkDir {
    fn drop(&mut self) {
        let _ = self.cleanup();
    }
}
struct Running(Child);
impl Drop for Running {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}
#[cfg(windows)]
mod job {
    use std::{
        ffi::c_void,
        mem::{size_of, zeroed},
        os::windows::io::AsRawHandle,
        process::Child,
    };
    type Handle = *mut c_void;
    #[repr(C)]
    struct Basic {
        process_time: i64,
        job_time: i64,
        flags: u32,
        min_working: usize,
        max_working: usize,
        active_processes: u32,
        affinity: usize,
        priority: u32,
        scheduling: u32,
    }
    #[repr(C)]
    struct Io {
        read_ops: u64,
        write_ops: u64,
        other_ops: u64,
        read_bytes: u64,
        write_bytes: u64,
        other_bytes: u64,
    }
    #[repr(C)]
    struct Extended {
        basic: Basic,
        io: Io,
        process_memory: usize,
        job_memory: usize,
        peak_process_memory: usize,
        peak_job_memory: usize,
    }
    #[link(name = "kernel32")]
    extern "system" {
        fn CreateJobObjectW(attributes: *const c_void, name: *const u16) -> Handle;
        fn SetInformationJobObject(
            job: Handle,
            class: i32,
            info: *const c_void,
            length: u32,
        ) -> i32;
        fn AssignProcessToJobObject(job: Handle, process: Handle) -> i32;
        fn CloseHandle(handle: Handle) -> i32;
    }
    pub(super) struct Job(Handle);
    impl Job {
        pub(super) fn new() -> Result<Self, String> {
            unsafe {
                let h = CreateJobObjectW(std::ptr::null(), std::ptr::null());
                if h.is_null() {
                    return Err("helper-start-failed".into());
                }
                let job = Self(h);
                let mut info: Extended = zeroed();
                info.basic.flags = 0x2000; // JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
                if SetInformationJobObject(
                    h,
                    9,
                    &info as *const _ as *const c_void,
                    size_of::<Extended>() as u32,
                ) == 0
                {
                    return Err("helper-start-failed".into());
                }
                Ok(job)
            }
        }
        pub(super) fn attach(&self, child: &Child) -> Result<(), String> {
            unsafe {
                if AssignProcessToJobObject(self.0, child.as_raw_handle()) == 0 {
                    return Err("helper-start-failed".into());
                }
                Ok(())
            }
        }
    }
    impl Drop for Job {
        fn drop(&mut self) {
            unsafe {
                CloseHandle(self.0);
            }
        }
    }
}
/// Distribution helper path takes precedence; development fallback is local.
pub fn resolve_executable() -> Option<PathBuf> {
    let local = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.join("helper/warframe-api-helper.exe")));
    local.filter(|p| p.is_file()).or_else(|| {
        #[cfg(debug_assertions)]
        {
            let target = Path::new(env!("CARGO_MANIFEST_DIR")).join("target");
            if std::env::current_exe()
                .ok()
                .is_some_and(|exe| exe.starts_with(target))
            {
                let dev = Path::new(env!("CARGO_MANIFEST_DIR"))
                    .join("helper-bin/warframe-api-helper.exe");
                return dev.is_file().then_some(dev);
            }
        }
        None
    })
}

pub const HELPER_SHA256: &str = "549814f2a13f6f0754fdf25a8611ba05a897ce45b66802c641a9982ae99e28fc";
#[cfg(windows)]
fn digest(bytes: &[u8]) -> Result<[u8; 32], String> {
    use std::ffi::c_void;
    type Handle = *mut c_void;
    #[link(name = "bcrypt")]
    extern "system" {
        fn BCryptOpenAlgorithmProvider(
            out: *mut Handle,
            id: *const u16,
            provider: *const u16,
            flags: u32,
        ) -> i32;
        fn BCryptHash(
            algorithm: Handle,
            secret: *const u8,
            secret_len: u32,
            input: *const u8,
            len: u32,
            output: *mut u8,
            output_len: u32,
        ) -> i32;
        fn BCryptCloseAlgorithmProvider(algorithm: Handle, flags: u32) -> i32;
    }
    unsafe {
        let id: Vec<u16> = "SHA256".encode_utf16().chain(Some(0)).collect();
        let mut h = std::ptr::null_mut();
        if BCryptOpenAlgorithmProvider(&mut h, id.as_ptr(), std::ptr::null(), 0) < 0 {
            return Err("helper-integrity-error".into());
        }
        let mut out = [0u8; 32];
        let status = BCryptHash(
            h,
            std::ptr::null(),
            0,
            bytes.as_ptr(),
            bytes.len() as u32,
            out.as_mut_ptr(),
            32,
        );
        BCryptCloseAlgorithmProvider(h, 0);
        if status < 0 {
            return Err("helper-integrity-error".into());
        }
        Ok(out)
    }
}
#[cfg(not(windows))]
fn digest(_: &[u8]) -> Result<[u8; 32], String> {
    Err("helper-start-failed".into())
}
fn verified_file(exe: &Path) -> Result<fs::File, String> {
    let mut options = fs::OpenOptions::new();
    options.read(true);
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        options.share_mode(1);
    }
    let mut file = options.open(exe).map_err(|_| "helper-integrity-error")?;
    let mut bytes = Vec::new();
    (&mut file)
        .take(64 * 1024 * 1024 + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "helper-integrity-error")?;
    if bytes.len() > 64 * 1024 * 1024 {
        return Err("helper-integrity-error".into());
    }
    let hash = digest(&bytes)?
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect::<String>();
    if hash != HELPER_SHA256 {
        return Err("helper-integrity-error".into());
    }
    Ok(file) // Keep the Windows read-sharing-only lock for the entire child run.
}
#[cfg(not(windows))]
pub fn game_pid() -> Option<u32> {
    None
}
#[cfg(windows)]
pub fn game_pid() -> Option<u32> {
    use std::{
        ffi::c_void,
        mem::{size_of, zeroed},
    };
    type Handle = *mut c_void;
    #[repr(C)]
    struct Entry {
        size: u32,
        usage: u32,
        pid: u32,
        heap: usize,
        module: u32,
        threads: u32,
        parent: u32,
        priority: i32,
        flags: u32,
        exe: [u16; 260],
    }
    #[link(name = "kernel32")]
    extern "system" {
        fn CreateToolhelp32Snapshot(flags: u32, pid: u32) -> Handle;
        fn Process32FirstW(h: Handle, e: *mut Entry) -> i32;
        fn Process32NextW(h: Handle, e: *mut Entry) -> i32;
        fn CloseHandle(h: Handle) -> i32;
    }
    unsafe {
        let h = CreateToolhelp32Snapshot(2, 0);
        if h as isize == -1 {
            return None;
        }
        let mut e: Entry = zeroed();
        e.size = size_of::<Entry>() as u32;
        let mut ok = Process32FirstW(h, &mut e);
        let mut found = None;
        while ok != 0 {
            let name = String::from_utf16_lossy(
                &e.exe[..e.exe.iter().position(|c| *c == 0).unwrap_or(260)],
            );
            if name.eq_ignore_ascii_case("Warframe.x64.exe")
                || name.eq_ignore_ascii_case("Warframe.exe")
            {
                found = Some(e.pid);
                break;
            }
            ok = Process32NextW(h, &mut e);
        }
        CloseHandle(h);
        found
    }
}
fn read_json(path: &Path) -> Result<Value, String> {
    let mut bytes = Vec::new();
    fs::File::open(path)
        .map_err(|_| "helper-invalid-inventory")?
        .take(LIMIT + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "helper-invalid-inventory")?;
    if bytes.len() as u64 > LIMIT {
        return Err("helper-invalid-inventory".into());
    }
    let bytes = bytes.strip_prefix(&[239, 187, 191]).unwrap_or(&bytes);
    let value: Value = serde_json::from_slice(bytes).map_err(|_| "helper-invalid-inventory")?;
    if !value.is_object() {
        return Err("helper-invalid-inventory".into());
    }
    Ok(value)
}
#[path = "helper_session_scan.rs"]
mod session_scan;
struct Session(Vec<u8>);
impl Drop for Session {
    fn drop(&mut self) {
        for b in &mut self.0 {
            unsafe {
                std::ptr::write_volatile(b, 0);
            }
        }
        std::sync::atomic::compiler_fence(Ordering::SeqCst);
    }
}
fn session_line(line: &[u8]) -> Option<Session> {
    let line = line.strip_suffix(b"\r").unwrap_or(line);
    let rest = line.strip_prefix(b"?accountId=")?;
    let (account, nonce) = rest.split_at_checked(24)?;
    if !account.iter().all(u8::is_ascii_hexdigit) {
        return None;
    }
    let nonce = nonce.strip_prefix(b"&nonce=")?;
    if nonce.is_empty() || nonce.len() > 20 || !nonce.iter().all(u8::is_ascii_digit) {
        return None;
    }
    std::str::from_utf8(nonce).ok()?.parse::<u64>().ok()?;
    Some(Session(line.to_vec()))
}
fn drain_session(mut stdout: impl Read) -> Option<Session> {
    let mut chunk = [0u8; 512];
    let mut line = Vec::with_capacity(96);
    let mut oversized = false;
    let mut session = None;
    loop {
        let n = match stdout.read(&mut chunk) {
            Ok(0) | Err(_) => break,
            Ok(n) => n,
        };
        for &b in &chunk[..n] {
            if b == b'\n' {
                if !oversized && session.is_none() {
                    session = session_line(&line);
                }
                line.fill(0);
                line.clear();
                oversized = false;
            } else if line.len() < 128 && !oversized {
                line.push(b);
            } else {
                line.fill(0);
                line.clear();
                oversized = true;
            }
        }
        chunk[..n].fill(0);
    }
    if !oversized && session.is_none() {
        session = session_line(&line);
    }
    line.fill(0);
    session
}
fn execute(
    command: Command,
    timeout: Duration,
    cancelled: impl Fn() -> bool,
) -> Result<Value, String> {
    execute_session(command, timeout, cancelled).map(|(v, _)| v)
}
fn execute_session(
    mut command: Command,
    timeout: Duration,
    cancelled: impl Fn() -> bool,
) -> Result<(Value, Option<Session>), String> {
    if cancelled() {
        return Err("helper-cancelled".into());
    }
    let work = WorkDir::new()?;
    let result = (|| {
        command
            .current_dir(&work.0)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::null());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000);
        }
        #[cfg(windows)]
        let job = job::Job::new()?;
        let mut child = Running(command.spawn().map_err(|_| "helper-start-failed")?);
        #[cfg(windows)]
        job.attach(&child.0)?;
        let stdout = child.0.stdout.take().ok_or("helper-start-failed")?;
        let output = std::thread::spawn(move || drain_session(stdout));
        let deadline = Instant::now() + timeout;
        loop {
            if cancelled() {
                return Err("helper-cancelled".into());
            }
            match child.0.try_wait().map_err(|_| "helper-failed")? {
                Some(status) => {
                    if !status.success() {
                        return Err(match status.code() {
                            Some(1) => "game-not-running",
                            Some(2) => "access-denied",
                            Some(3) => "helper-session-unavailable",
                            Some(5) => "helper-network-failed",
                            Some(6) => "helper-invalid-inventory",
                            _ => "helper-failed",
                        }
                        .into());
                    }
                    break;
                }
                None => {}
            }
            if Instant::now() >= deadline {
                return Err("helper-timeout".into());
            }
            std::thread::sleep(Duration::from_millis(100));
        }
        #[cfg(windows)]
        drop(job); // Close descendant stdout handles before joining the bounded drain.
        let session = output.join().map_err(|_| "helper-failed")?;
        // Drop kills/waits before the directory is removed on every return path.
        let inventory = work.0.join("inventory.json");
        if inventory.is_file() {
            return read_json(&inventory).map(|v| (v, session));
        }
        let fallback = work.0.join("lastData.dat");
        if fallback.is_file() {
            return read_json(&fallback).map(|v| (v, session));
        }
        Err("helper-invalid-inventory".into())
    })();
    work.cleanup()?;
    result
}
fn valid_core(value: &Value) -> bool {
    if [
        "MiscItems",
        "XPInfo",
        "Suits",
        "LongGuns",
        "Pistols",
        "Melee",
    ]
    .iter()
    .all(|k| value[*k].is_array())
        && value["RegularCredits"].is_number()
        && !value["LastInventorySync"].is_null()
    {
        return true;
    }
    for key in ["InventoryJSON", "InventoryJson"] {
        if let Some(raw) = value[key].as_str() {
            if let Ok(inner) = serde_json::from_str::<Value>(raw) {
                return [
                    "MiscItems",
                    "XPInfo",
                    "Suits",
                    "LongGuns",
                    "Pistols",
                    "Melee",
                ]
                .iter()
                .all(|k| inner[*k].is_array())
                    && inner["RegularCredits"].is_number()
                    && !inner["LastInventorySync"].is_null();
            }
        }
    }
    false
}
#[derive(Default)]
pub struct Client {
    pid: Option<u32>,
    session: Option<Session>,
    transport: &'static str,
}
impl Client {
    pub fn new() -> Self {
        Self::default()
    }
    pub fn transport(&self) -> &str {
        self.transport
    }
    pub fn has_session(&self) -> bool {
        self.session.is_some()
    }
    /// Read only the three supported weapon vendors using the existing in-memory session.
    pub fn vendor_info(&self, vendor: &str, cancelled: impl Fn() -> bool) -> Result<Value, String> {
        if !matches!(vendor, "/Lotus/Types/Game/VendorManifests/Hubs/PerrinSequenceWeaponVendorManifest" | "/Lotus/Types/Game/VendorManifests/TheHex/InfestedLichWeaponVendorManifest" | "/Lotus/Types/Game/VendorManifests/Hubs/TeshinHardModeVendorManifest") {
            return Err("vendor-not-supported".into());
        }
        fetch_endpoint(self.session.as_ref().ok_or("helper-session-unavailable")?, Some(vendor), cancelled)
    }
    pub fn reset(&mut self) {
        self.session = None;
        self.pid = None;
        self.transport = "";
    }
    pub fn recover_compatibility(
        &mut self,
        pid: u32,
        cancelled: impl Fn() -> bool,
    ) -> Result<Value, String> {
        self.reset();
        self.pid = Some(pid);
        let result = compatibility_session(pid, &cancelled);
        match result {
            Ok((value, session)) => {
                self.session = Some(session);
                self.transport = "compatibility-bootstrap";
                Ok(value)
            }
            Err(code) => {
                if code == "helper-cancelled" {
                    self.reset();
                }
                Err(code)
            }
        }
    }
    pub fn refresh(
        &mut self,
        exe: &Path,
        pid: u32,
        cancelled: impl Fn() -> bool,
    ) -> Result<Value, String> {
        if self.pid != Some(pid) {
            self.reset();
            self.pid = Some(pid);
        }
        if cancelled() {
            self.reset();
            return Err("helper-cancelled".into());
        }
        if let Some(session) = &self.session {
            let result = fetch(session, &cancelled);
            match result {
                Ok(value) => {
                    self.transport = "session-https";
                    return Ok(value);
                }
                Err(code) if code == "helper-auth-failed" => self.session = None,
                Err(code) => {
                    if code == "helper-cancelled" {
                        self.reset();
                    }
                    return Err(code);
                }
            }
        }
        if !exe.is_file() {
            return Err("helper-start-failed".into());
        }
        let exe = fs::canonicalize(exe).map_err(|_| "helper-start-failed")?;
        let _verified = verified_file(&exe)?;
        let mut transport = "helper-bootstrap";
        let (mut value, mut session) =
            match execute_session(Command::new(exe), Duration::from_secs(120), &cancelled) {
                Ok(result) => result,
                Err(code) if code == "helper-session-unavailable" => {
                    transport = "compatibility-bootstrap";
                    let (value, session) = compatibility_session(pid, &cancelled)?;
                    (value, Some(session))
                }
                Err(code) => return Err(code),
            };
        if cancelled() {
            self.reset();
            return Err("helper-cancelled".into());
        }
        if session.is_none() {
            let (verified, context) = compatibility_session(pid, &cancelled)?;
            value = verified; session = Some(context); transport = "compatibility-bootstrap";
        }
        if !valid_core(&value) { return Err("helper-invalid-inventory".into()); }
        if let Some(context) = &session { bind_session_identity(&mut value, context)?; }
        self.session = session;
        self.transport = transport;
        Ok(value)
    }
}
fn compatibility_session(
    pid: u32,
    cancelled: impl Fn() -> bool,
) -> Result<(Value, Session), String> {
    let candidates = session_scan::scan(pid, &cancelled)?;
    let deadline = Instant::now() + Duration::from_secs(40);
    for candidate in candidates.into_iter().take(3) {
        if cancelled() {
            return Err("helper-cancelled".into());
        }
        if Instant::now() >= deadline {
            break;
        }
        let session = Session(candidate.bytes().to_vec());
        match fetch(&session, &cancelled) {
            Ok(value) => return Ok((value, session)),
            Err(code) if code == "helper-auth-failed" => {}
            Err(code) => return Err(code),
        }
    }
    Err("helper-session-unavailable".into())
}
pub fn recover_compatibility(pid: u32, cancelled: impl Fn() -> bool) -> Result<Value, String> {
    Client::new().recover_compatibility(pid, cancelled)
}
// The account ID comes from the authenticated session that returned this inventory.
// It is transient; inventory_data emits only its scoped hash, never the nonce.
fn bind_session_identity(value: &mut Value, session: &Session) -> Result<(), String> {
    let raw = std::str::from_utf8(&session.0).map_err(|_| "helper-auth-failed")?;
    let account = raw.strip_prefix("?accountId=").and_then(|s|s.split_once("&nonce=")).map(|p|p.0)
        .filter(|id|id.len()==24 && id.bytes().all(|b|b.is_ascii_hexdigit())).ok_or("helper-auth-failed")?;
    for key in ["AccountId", "accountId"] {
        if let Some(existing)=value.get(key) {
            let id=existing.as_str().or_else(||existing.get("$oid").and_then(Value::as_str));
            if !id.is_some_and(|id|id.eq_ignore_ascii_case(account)){return Err("helper-account-mismatch".into());}
        }
    }
    if !value.is_object(){return Err("helper-invalid-inventory".into());}
    value["AccountId"]=Value::String(account.to_ascii_lowercase());
    Ok(())
}
fn fetch(session: &Session, cancelled: impl Fn() -> bool) -> Result<Value, String> {
    let mut value = fetch_endpoint(session, None, cancelled)?;
    bind_session_identity(&mut value, session)?;
    if !valid_core(&value) { return Err("helper-auth-failed".into()); }
    Ok(value)
}
fn fetch_endpoint(session: &Session, vendor: Option<&str>, cancelled: impl Fn() -> bool) -> Result<Value, String> {
    if cancelled() {
        return Err("helper-cancelled".into());
    }
    let raw = std::str::from_utf8(&session.0).map_err(|_| "helper-auth-failed")?;
    let (account, nonce) = raw
        .strip_prefix("?accountId=")
        .and_then(|s| s.split_once("&nonce="))
        .ok_or("helper-auth-failed")?;
    let client = reqwest::blocking::Client::builder()
        .https_only(true)
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|_| "helper-network-failed")?;
    let mut request = client
        .get(if vendor.is_some() { "https://mobile.warframe.com/api/getVendorInfo.php" } else { "https://mobile.warframe.com/api/inventory.php" })
        .query(&[("accountId", account), ("nonce", nonce)]);
    if let Some(vendor) = vendor { request = request.query(&[("vendor", vendor)]); }
    let response = request
        .send()
        .map_err(|_| {
            if cancelled() {
                "helper-cancelled"
            } else {
                "helper-network-failed"
            }
        })?;
    if cancelled() {
        return Err("helper-cancelled".into());
    }
    if matches!(response.status().as_u16(), 401 | 403) {
        return Err("helper-auth-failed".into());
    }
    if !response.status().is_success() {
        return Err("helper-network-failed".into());
    }
    let mut bytes = Vec::new();
    response
        .take(LIMIT + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| {
            if cancelled() {
                "helper-cancelled"
            } else {
                "helper-network-failed"
            }
        })?;
    if cancelled() {
        bytes.fill(0);
        return Err("helper-cancelled".into());
    }
    if bytes.len() as u64 > LIMIT {
        bytes.fill(0);
        return Err("helper-invalid-inventory".into());
    }
    let result = serde_json::from_slice::<Value>(&bytes).map_err(|_| "helper-auth-failed");
    bytes.fill(0);
    let value = result?;
    Ok(value)
}
pub fn run(exe: &Path, cancelled: impl Fn() -> bool) -> Result<Value, String> {
    let pid = game_pid().ok_or("game-not-running")?;
    Client::new().refresh(exe, pid, cancelled)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn work_directory_removed() {
        let p;
        {
            let w = WorkDir::new().unwrap();
            p = w.0.clone();
            fs::write(p.join("inventory.json"), b"private fixture").unwrap();
        }
        assert!(!p.exists());
    }
    #[test]
    fn rejects_json_array() {
        let w = WorkDir::new().unwrap();
        let p = w.0.join("inventory.json");
        fs::write(&p, b"[]").unwrap();
        assert!(read_json(&p).is_err());
    }
    #[test]
    fn controlled_child() {
        let Ok(mode) = std::env::var("MYFRAME_HELPER_FIXTURE") else {
            return;
        };
        match mode.as_str() {
            "success" => {
                fs::write("inventory.json", br#"{"MiscItems":[],"fixture":true}"#).unwrap()
            }
            "bad" => fs::write("inventory.json", b"invalid").unwrap(),
            "wait" => std::thread::sleep(Duration::from_secs(10)),
            _ => {}
        }
    }
    fn command(mode: &str) -> Command {
        let mut c = Command::new(std::env::current_exe().unwrap());
        c.args([
            "--exact",
            "helper_inventory::tests::controlled_child",
            "--nocapture",
        ])
        .env("MYFRAME_HELPER_FIXTURE", mode);
        c
    }
    #[test]
    fn reads_controlled_child() {
        assert_eq!(
            execute(command("success"), Duration::from_secs(5), || false).unwrap()["fixture"],
            true
        );
    }
    #[test]
    fn rejects_bad_output() {
        assert!(execute(command("bad"), Duration::from_secs(5), || false).is_err());
    }
    #[test]
    fn timeout_kills_child() {
        let start = Instant::now();
        assert!(
            execute(command("wait"), Duration::from_millis(100), || false)
                .unwrap_err()
                .contains("helper-timeout")
        );
        assert!(start.elapsed() < Duration::from_secs(3));
    }
    #[test]
    fn cancellation_kills_child() {
        let start = Instant::now();
        assert!(
            execute(command("wait"), Duration::from_secs(5), || start.elapsed()
                > Duration::from_millis(150))
            .unwrap_err()
            .contains("helper-cancelled")
        );
        assert!(start.elapsed() < Duration::from_secs(3));
    }
    #[cfg(windows)]
    #[test]
    fn sha256_known_vector() {
        assert_eq!(
            digest(b"abc")
                .unwrap()
                .iter()
                .map(|b| format!("{b:02x}"))
                .collect::<String>(),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }
    #[test]
    fn rejects_unpinned_executable() {
        let w = WorkDir::new().unwrap();
        let p = w.0.join("helper.exe");
        fs::write(&p, b"fixture not executable").unwrap();
        assert!(verified_file(&p).is_err());
    }
    #[test]
    fn cleanup_rejects_a_changed_parent() {
        let mut w = WorkDir::new().unwrap();
        let actual_root = w.1.clone();
        w.1 = w.1.join("not-the-owned-parent");
        assert_eq!(w.cleanup().unwrap_err(), "helper-cleanup-failed");
        assert!(w.0.exists());
        w.1 = actual_root;
        w.cleanup().unwrap();
        assert!(!w.0.exists());
    }
    #[cfg(windows)]
    #[test]
    fn job_close_terminates_controlled_child() {
        use std::os::windows::process::CommandExt;
        let job = job::Job::new().unwrap();
        let mut command = command("wait");
        command
            .creation_flags(0x08000000)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        let mut child = Running(command.spawn().unwrap());
        job.attach(&child.0).unwrap();
        std::thread::sleep(Duration::from_millis(100));
        assert!(child.0.try_wait().unwrap().is_none());
        let start = Instant::now();
        drop(job);
        // Kill-on-close does not promise a nonzero process exit code.
        child.0.wait().unwrap();
        assert!(start.elapsed() < Duration::from_secs(3));
    }
    #[test]
    fn inventory_without_account_id_binds_to_authenticated_session_without_nonce() {
        let session=Session(b"?accountId=0123456789abcdef01234567&nonce=987654321".to_vec());
        let mut value=serde_json::json!({"MiscItems":[]});
        bind_session_identity(&mut value,&session).unwrap();
        assert_eq!(value["AccountId"],"0123456789abcdef01234567");
        assert!(!value.to_string().contains("987654321"));
        assert!(!value.to_string().contains("nonce"));
        let mut raw=serde_json::json!({"LastInventorySync":{"$oid":"650000000000000000000000"},"MiscItems":[],"XPInfo":[],"Suits":[],"LongGuns":[],"Pistols":[],"Melee":[],"RegularCredits":0});
        bind_session_identity(&mut raw,&session).unwrap();
        let snapshot=crate::inventory_data::from_value(&raw,&crate::collection::catalog().unwrap(),None,"warframe-api-helper","2026-10-25T00:00:00Z").unwrap();
        assert!(snapshot.account_scope.as_ref().unwrap().starts_with("acct-v1-"));
        let saved=serde_json::to_string(&snapshot).unwrap();
        assert!(!saved.contains("0123456789abcdef01234567"));
        assert!(!saved.contains("987654321"));
        assert!(bind_session_identity(&mut serde_json::json!({"AccountId":"aaaaaaaaaaaaaaaaaaaaaaaa"}),&session).is_err());
        assert!(bind_session_identity(&mut serde_json::json!({"accountId":{"$oid":"aaaaaaaaaaaaaaaaaaaaaaaa"}}),&session).is_err());
    }
    #[test]
    fn strict_session_line_only() {
        let input = b"?accountId=0123456789abcdef01234567&nonce=123456789012345678";
        assert!(session_line(input).is_some());
        assert!(session_line(&[b"prefix ".as_slice(), input].concat()).is_none());
        assert!(session_line(&[input.as_slice(), b"&other=x".as_slice()].concat()).is_none());
        assert!(session_line(b"?accountId=bad&nonce=1").is_none());
    }
    #[test]
    fn bounded_drain_ignores_other_lines() {
        let b = b"unrelated\n?accountId=0123456789abcdef01234567&nonce=123\r\n";
        assert!(drain_session(std::io::Cursor::new(b)).is_some());
        assert!(drain_session(std::io::Cursor::new(vec![b'x'; 10000])).is_none());
    }
    #[test]
    fn pid_change_and_cancel_clear_session() {
        let mut c = Client::new();
        c.pid = Some(1);
        c.session = session_line(b"?accountId=0123456789abcdef01234567&nonce=1");
        assert!(c.refresh(Path::new("missing"), 2, || true).is_err());
        assert!(c.session.is_none());
        assert!(c.pid.is_none());
    }
}

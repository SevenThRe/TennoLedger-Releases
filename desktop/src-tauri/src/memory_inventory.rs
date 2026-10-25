//! Passive, bounded inventory discovery. No process mutation or credential access.
use serde_json::Value;
const WINDOW: usize = 8 * 1024 * 1024;

fn valid(v: &Value) -> bool {
    v.is_object() && v.get("LastInventorySync").is_some_and(|x| !x.is_null())
        && ["MiscItems", "XPInfo", "Suits", "LongGuns"].iter().all(|k| v.get(*k).is_some_and(Value::is_array))
        && v.get("RegularCredits").is_some_and(Value::is_number)
}
fn sync_key(v:&Value)->String {
    let n=&v["LastInventorySync"];
    n.as_str().or_else(||n.get("$oid").and_then(Value::as_str)).or_else(||n.get("oid").and_then(Value::as_str)).map(str::to_owned).unwrap_or_else(||n.to_string())
}
fn retain_newest(best:&mut Option<Value>,v:Value) {
    if best.as_ref().is_none_or(|b|sync_key(&v)>sync_key(b)) { *best=Some(v); }
}
// Single linear pass: each object records whether its subtree contains the
// inventory marker. Nested braces and escaped strings never become root guesses.
fn recover_utf8(bytes: &[u8]) -> Option<Value> {
    let mut best=None;
    let mut stack: Vec<(usize, bool)> = Vec::new();
    let (mut quoted, mut escape, mut string_start) = (false, false, 0);
    for (i, &b) in bytes.iter().enumerate() {
        if stack.is_empty() {
            quoted = false; escape = false;
            if b == b'{' { stack.push((i, false)); }
            continue;
        }
        if quoted {
            if escape { escape = false; }
            else if b == b'\\' { escape = true; }
            else if b == b'"' {
                quoted = false;
                if &bytes[string_start..i] == b"LastInventorySync" || &bytes[string_start..i] == b"InventoryJSON" || &bytes[string_start..i] == b"InventoryJson" {
                    if let Some(frame) = stack.last_mut() { frame.1 = true; }
                }
            } else if b < 0x20 { stack.clear(); quoted = false; }
            continue;
        }
        match b {
            b'"' => { quoted = true; string_start = i+1; },
            b'{' => { if stack.len() < 256 { stack.push((i,false)); } else { stack.clear(); } },
            b'}' => {
                if let Some((start, marker)) = stack.pop() {
                    if marker {
                        if let Ok(v) = serde_json::from_slice::<Value>(&bytes[start..=i]) {
                            if valid(&v) { retain_newest(&mut best,v); } else
                            if let Some(text)=v.get("InventoryJSON").or_else(||v.get("InventoryJson")).and_then(Value::as_str) {
                                if let Ok(inner)=serde_json::from_str::<Value>(text) { if valid(&inner) {retain_newest(&mut best,inner);} }
                            }
                        }
                        if let Some(parent) = stack.last_mut() { parent.1 = true; }
                    }
                }
            },
            0..=8 | 11..=12 | 14..=31 => { stack.clear(); },
            _ => {}
        }
    }
    best
}
pub fn recover(bytes: &[u8]) -> Option<Value> {
    let mut best=recover_utf8(bytes);
    let needle: Vec<u8> = "\"LastInventorySync\"".encode_utf16().flat_map(u16::to_le_bytes).collect();
    if memchr::memmem::find(bytes,&needle).is_none() { return best; }
    for offset in 0..2 {
        let units: Vec<u16> = bytes[offset.min(bytes.len())..].chunks_exact(2).map(|b| u16::from_le_bytes([b[0], b[1]])).collect();
        if let Some(v) = recover_utf8(String::from_utf16_lossy(&units).as_bytes()) { retain_newest(&mut best,v); }
    }
    best
}

fn count_marker(bytes:&[u8], ascii:&[u8])->u64 {
    let wide:Vec<u8>=ascii.iter().flat_map(|b|[*b,0]).collect();
    (memchr::memmem::find_iter(bytes,ascii).count()+memchr::memmem::find_iter(bytes,&wide).count()) as u64
}
fn marker_counts(bytes:&[u8])->(u64,u64,u64) {
    (count_marker(bytes,b"LastInventorySync"),count_marker(bytes,b"MiscItems"),count_marker(bytes,b"InventoryJSON")+count_marker(bytes,b"InventoryJson"))
}

#[derive(Default, Clone, serde::Serialize)]
#[serde(rename_all="camelCase")]
pub struct ScanStats {
    pub pid: u32,
    pub regions: u64,
    pub bytes: u64,
    pub candidates: u64,
    pub sweeps: u64,
    pub cache_reads: u64,
    pub last_error: Option<String>,
    pub phase: String,
    pub marker_hits: u64,
    pub misc_item_hits: u64,
    pub wrapper_hits: u64,
    pub account_marker_hits: u64,
}

#[derive(Default)]
pub struct Scanner {
    pid: u32,
    cursor: usize,
    tail: Vec<u8>,
    pub status: String,
    pub stats: ScanStats,
    cached_window: Option<(usize,usize)>,
    try_cache: bool,
    phase: u8,
    pending_bytes: usize,
}
impl Scanner {
    pub fn new() -> Self { Self { status: "game-not-running".into(), ..Self::default() } }
    pub fn pid(&self) -> u32 { self.pid }
    pub fn reset(&mut self) { self.pid = 0; self.cursor = 0; self.tail.clear(); self.cached_window=None; self.try_cache=false; self.phase=0; self.pending_bytes=0; self.stats=ScanStats::default(); self.status = "cancelled".into(); }
    #[cfg(not(windows))]
    pub fn poll(&mut self) -> Result<Option<Value>, String> { self.status = "unsupported-platform".into(); Ok(None) }
    #[cfg(windows)]
    pub fn poll(&mut self) -> Result<Option<Value>, String> { windows::poll(self) }
}

#[cfg(windows)]
mod windows {
    use super::*;
    use std::{ffi::c_void, mem::{size_of, zeroed}, time::{Duration, Instant}};
    type Handle = *mut c_void;
    #[repr(C)] struct ProcessEntry { size:u32, usage:u32, pid:u32, heap:usize, module:u32, threads:u32, parent:u32, priority:i32, flags:u32, exe:[u16;260] }
    #[repr(C)] struct MemoryInfo { base:usize, allocation:usize, allocation_protect:u32, region_size:usize, state:u32, protect:u32, kind:u32 }
    #[link(name="kernel32")]
    unsafe extern "system" {
        fn CreateToolhelp32Snapshot(flags:u32,pid:u32)->Handle;
        fn Process32FirstW(h:Handle,e:*mut ProcessEntry)->i32;
        fn Process32NextW(h:Handle,e:*mut ProcessEntry)->i32;
        fn OpenProcess(access:u32,inherit:i32,pid:u32)->Handle;
        fn CloseHandle(h:Handle)->i32;
        fn VirtualQueryEx(h:Handle,address:*const c_void,info:*mut MemoryInfo,len:usize)->usize;
        fn ReadProcessMemory(h:Handle,address:*const c_void,buf:*mut c_void,len:usize,read:*mut usize)->i32;
        fn GetLastError()->u32;
    }
    struct Owned(Handle);
    impl Drop for Owned { fn drop(&mut self) { unsafe { CloseHandle(self.0); } } }
    fn process() -> Result<Option<u32>,String> { unsafe {
        let h=CreateToolhelp32Snapshot(2,0); if h as isize == -1 { return Err(format!("process-enumeration-error:{}",GetLastError())); }
        let h=Owned(h); let mut e:ProcessEntry=zeroed(); e.size=size_of::<ProcessEntry>() as u32;
        let mut ok=Process32FirstW(h.0,&mut e);
        while ok != 0 { let n=String::from_utf16_lossy(&e.exe[..e.exe.iter().position(|x| *x==0).unwrap_or(260)]);
            if n.eq_ignore_ascii_case("Warframe.x64.exe") || n.eq_ignore_ascii_case("Warframe.exe") { return Ok(Some(e.pid)); }
            ok=Process32NextW(h.0,&mut e);
        } Ok(None)
    } }
    pub(super) fn poll(s:&mut Scanner)->Result<Option<Value>,String> { unsafe {
        let Some(pid)=process()? else { s.reset(); s.status="game-not-running".into(); return Ok(None) };
        if s.pid != pid { s.reset(); s.pid=pid; s.stats.pid=pid; }
        // Read-only rights, never WRITE/OPERATION/CREATE_THREAD.
        let h=OpenProcess(0x10|0x400,0,pid);
        if h.is_null() { let err=GetLastError(); s.stats.last_error=Some(format!("OpenProcess:{err}")); s.status=if err==5 {"access-denied".into()} else {format!("process-open-error:{err}")}; return Ok(None) }
        let h=Owned(h);
        // Alternate a direct reread with continuing discovery. Old heap copies
        // therefore cannot permanently pin discovery to one historical object.
        if s.try_cache {
            s.try_cache=false;
            if let Some((base,len))=s.cached_window {
                let mut buffer=vec![0u8;len]; let mut read=0;
                s.stats.cache_reads+=1;
                if ReadProcessMemory(h.0,base as *const c_void,buffer.as_mut_ptr().cast(),len,&mut read)!=0 {
                    buffer.truncate(read); s.stats.bytes+=read as u64;
                    if let Some(v)=recover(&buffer) { s.stats.candidates+=1; s.status="inventory-found".into(); return Ok(Some(v)); }
                }
                s.cached_window=None;
            }
        }
        s.try_cache=true;
        let start=Instant::now(); let mut scanned=0usize; s.status="scanning".into(); s.stats.phase=if s.phase==0 {"private"} else {"mapped"}.into();
        while scanned < 64*1024*1024 && start.elapsed() < Duration::from_millis(500) {
            let mut info:MemoryInfo=zeroed();
            if VirtualQueryEx(h.0,s.cursor as *const c_void,&mut info,size_of::<MemoryInfo>()) == 0 {
                s.cursor=0; s.tail.clear(); s.pending_bytes=0;
                if s.phase==0 {s.phase=1;s.status="scanning".into();} else {s.phase=0;s.stats.sweeps+=1;s.status="no-json".into();}
                s.stats.phase=if s.phase==0 {"private"} else {"mapped"}.into(); return Ok(None)
            }
            s.stats.regions+=1;
            let Some(end)=info.base.checked_add(info.region_size).filter(|v| *v>s.cursor) else { s.reset(); s.status="no-json".into(); return Ok(None) };
            let readable=info.state==0x1000 && info.protect & 0x100 ==0 && matches!(info.protect & 0xff,0x02|0x04|0x08|0x20|0x40|0x80);
            let selected=if s.phase==0 {info.kind==0x20000} else {info.kind!=0x20000};
            if !readable || !selected { s.cursor=end; s.tail.clear(); s.pending_bytes=0; continue; }
            let len=(end-s.cursor).min(1024*1024); let mut buffer=vec![0u8;len]; let mut read=0;
            let ok=ReadProcessMemory(h.0,s.cursor as *const c_void,buffer.as_mut_ptr().cast(),len,&mut read);
            s.cursor=s.cursor.saturating_add(len); scanned+=len;
            if ok==0 || read==0 { s.stats.last_error=Some(format!("ReadProcessMemory:{}",GetLastError())); s.tail.clear(); continue; }
            if read!=len { s.tail.clear(); continue; }
            s.stats.bytes+=read as u64; buffer.truncate(read);
            let mut probe=s.tail[s.tail.len().saturating_sub(64)..].to_vec(); probe.extend_from_slice(&buffer);
            let (marker,misc,wrapper)=marker_counts(&probe);
            s.stats.marker_hits+=marker; s.stats.misc_item_hits+=misc; s.stats.wrapper_hits+=wrapper;
            s.stats.account_marker_hits+=count_marker(&probe,b"SubscribedToEmails");
            s.pending_bytes=s.pending_bytes.saturating_sub(read);
            if marker>0 || wrapper>0 {s.pending_bytes=WINDOW;}
            s.tail.extend_from_slice(&buffer);
            if s.tail.len()>WINDOW { let excess=s.tail.len()-WINDOW; s.tail.drain(..excess); }
            if let Some(v)=if s.pending_bytes>0 {recover(&s.tail)} else {None} {
                s.stats.candidates+=1;
                s.cached_window=Some((s.cursor-s.tail.len(),s.tail.len()));
                s.tail.clear(); s.status="inventory-found".into(); return Ok(Some(v));
            }
            // Keep overlap across adjacent readable regions; VirtualQueryEx
            // boundaries are protection/allocation metadata, not JSON boundaries.
            // Skipped/unreadable regions already clear it above.
        } Ok(None)
    } }
    #[cfg(test)]
    pub(super) fn read_fixture(pid:u32, address:usize,len:usize)->Vec<u8> { unsafe {
        assert!(len <= WINDOW);
        let h=Owned(OpenProcess(0x10|0x400,0,pid)); assert!(!h.0.is_null());
        let mut out=vec![0u8;len]; let mut read=0;
        assert_ne!(ReadProcessMemory(h.0,address as *const c_void,out.as_mut_ptr().cast(),len,&mut read),0);
        out.truncate(read); out
    } }

}
#[cfg(test)] mod tests {
    use super::*;
    fn sample()->Vec<u8> { br#"{"note":"escaped \\\" } [ { text","nested":{"x":1},"LastInventorySync":{"$oid":"fixture"},"MiscItems":[],"XPInfo":[],"Suits":[],"LongGuns":[],"RegularCredits":120}"#.to_vec() }
    #[test] fn escaped_and_nested() { assert!(recover(&sample()).is_some()); }
    #[test] fn boundary() { let b=sample(); let split=b.len()/2; assert!(recover(&b[..split]).is_none()); let mut a=b[..split].to_vec(); a.extend_from_slice(&b[split..]); assert!(recover(&a).is_some()); }
    #[test] fn utf16() { let t=String::from_utf8(sample()).unwrap(); let mut b=vec![0xff]; b.extend(t.encode_utf16().flat_map(u16::to_le_bytes)); assert!(recover(&b).is_some()); }
    #[test] fn unrelated_string() { let inner=String::from_utf8(sample()).unwrap(); let b=serde_json::to_vec(&serde_json::json!({"payload":inner})).unwrap(); assert!(recover(&b).is_none()); }
    #[test] fn schema_required() { assert!(recover(br#"{"LastInventorySync":{},"MiscItems":[]}"#).is_none()); }
    #[test] fn large_marker_after_many_objects() {
        let mut b=br#"{"RawUpgrades":["#.to_vec();
        for i in 0..6000 { if i>0 {b.push(b',');} b.extend_from_slice(br#"{"ItemType":"/Lotus/Test/Fixture","ItemCount":2}"#); }
        b.extend_from_slice(br#"],"LastInventorySync":{"$oid":"fixture"},"MiscItems":[],"XPInfo":[],"Suits":[],"LongGuns":[],"RegularCredits":120}"#);
        assert!(recover(&b).is_some());
        let cut=b.len()-5;
        assert!(recover(&b[..cut]).is_none());
        let mut joined=b[..cut].to_vec(); joined.extend_from_slice(&b[cut..]);
        assert!(recover(&joined).is_some());
    }
    #[test] fn utf16_half_join() {
        let raw:String=String::from_utf8(sample()).unwrap(); let b:Vec<u8>=raw.encode_utf16().flat_map(u16::to_le_bytes).collect();
        let cut=b.len()/2+1; let mut joined=b[..cut].to_vec(); assert!(recover(&joined).is_none()); joined.extend_from_slice(&b[cut..]); assert!(recover(&joined).is_some());
    }
    #[test] fn real_local_cache_recovery_when_present() {
        let path=std::path::PathBuf::from(std::env::var_os("LOCALAPPDATA").unwrap_or_default()).join("AlecaFrame/lastData.dat");
        if !path.exists() {return;}
        let v=crate::inventory_data::read_cache(&path).unwrap();
        assert!(recover(&serde_json::to_vec(&v).unwrap()).is_some());
        let v = if let Some(raw)=v.get("InventoryJSON").or_else(||v.get("InventoryJson")).and_then(Value::as_str) { serde_json::from_str::<Value>(raw).unwrap() } else { v };
        let raw=serde_json::to_vec(&v).unwrap();
        assert!(raw.len()<WINDOW);
        let recovered=recover(&raw).expect("real cache structure must recover");
        assert_eq!(recovered["LastInventorySync"],v["LastInventorySync"]);
        // No raw data, player fields, or identifiers are printed or persisted.
    }
    #[cfg(windows)]
    #[test] fn controlled_child() {
        if std::env::var_os("MYFRAME_MEMORY_FIXTURE_CHILD").is_none() {return;}
        use std::io::{BufRead,Write};
        let mut b=sample();
        println!("FIXTURE_ADDRESS:{}:{}",b.as_ptr() as usize,b.len()); std::io::stdout().flush().unwrap();
        let mut line=String::new(); std::io::stdin().lock().read_line(&mut line).unwrap();
        if line.trim()=="update" {
            let pos=b.windows(3).position(|w|w==b"120").unwrap(); b[pos..pos+3].copy_from_slice(b"240");
            println!("UPDATED"); std::io::stdout().flush().unwrap();
            line.clear(); std::io::stdin().lock().read_line(&mut line).unwrap();
        }
        std::hint::black_box(b);
    }
    #[cfg(windows)]
    #[test] fn reads_controlled_external_process_and_fresh_change() {
        use std::{io::{BufRead,Write},process::{Command,Stdio}};
        let mut child=Command::new(std::env::current_exe().unwrap()).args(["--exact","memory_inventory::tests::controlled_child","--nocapture"]).env("MYFRAME_MEMORY_FIXTURE_CHILD","1").stdin(Stdio::piped()).stdout(Stdio::piped()).spawn().unwrap();
        let mut output=std::io::BufReader::new(child.stdout.take().unwrap());
        let mut line=String::new();
        let (address,len)=loop {line.clear(); assert!(output.read_line(&mut line).unwrap()>0); if let Some(v)=line.trim().strip_prefix("FIXTURE_ADDRESS:") {let (a,l)=v.split_once(':').unwrap();break(a.parse::<usize>().unwrap(),l.parse::<usize>().unwrap());}};
        let first=windows::read_fixture(child.id(),address,len); assert_eq!(recover(&first).unwrap()["RegularCredits"],120);
        child.stdin.as_mut().unwrap().write_all(b"update\n").unwrap();
        loop {line.clear(); assert!(output.read_line(&mut line).unwrap()>0);if line.trim()=="UPDATED" {break;}}
        let second=windows::read_fixture(child.id(),address,len); assert_eq!(recover(&second).unwrap()["RegularCredits"],240);
        child.stdin.as_mut().unwrap().write_all(b"done\n").unwrap(); assert!(child.wait().unwrap().success());
    }

    #[test] fn newest_blob_in_same_chunk_wins() {
        let old:Value=serde_json::from_slice(&sample()).unwrap(); let mut new=old.clone();
        new["LastInventorySync"]=serde_json::json!({"$oid":"zzzz-new"}); new["RegularCredits"]=serde_json::json!(999);
        let mut bytes=serde_json::to_vec(&old).unwrap(); bytes.push(0); bytes.extend_from_slice(&serde_json::to_vec(&new).unwrap());
        assert_eq!(recover(&bytes).unwrap()["RegularCredits"],999);
    }

    #[test] fn marker_statistics_accept_both_encodings() {
        let a=b"LastInventorySync MiscItems InventoryJSON"; assert_eq!(marker_counts(a),(1,1,1));
        let b:Vec<u8>=a.iter().flat_map(|b|[*b,0]).collect(); assert_eq!(marker_counts(&b),(1,1,1));
    }

}



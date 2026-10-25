//! Compatibility scanner for the current user's helper bootstrap. No network,
//! process writes, logging, persistent session storage, or exported diagnostics.
use std::sync::atomic::{compiler_fence, Ordering};
pub struct Candidate(Vec<u8>);
impl Candidate {
    pub fn bytes(&self) -> &[u8] {
        &self.0
    }
}
impl Drop for Candidate {
    fn drop(&mut self) {
        for b in &mut self.0 {
            unsafe {
                std::ptr::write_volatile(b, 0);
            }
        }
        compiler_fence(Ordering::SeqCst);
    }
}
fn parse(bytes: &[u8]) -> Option<(Candidate, usize)> {
    let rest = bytes.strip_prefix(b"?accountId=")?;
    if rest.len() < 24 || !rest[..24].iter().all(u8::is_ascii_hexdigit) {
        return None;
    }
    let nonce = rest[24..].strip_prefix(b"&nonce=")?;
    let len = nonce.iter().take_while(|b| b.is_ascii_digit()).count();
    // Require a terminator; an unterminated chunk is retried with overlap.
    if len == 0 || len > 20 || len == nonce.len() {
        return None;
    }
    if nonce[len].is_ascii_alphanumeric() || nonce[len] == b'_' {
        return None;
    }
    std::str::from_utf8(&nonce[..len])
        .ok()?
        .parse::<u64>()
        .ok()?;
    let size = b"?accountId=".len() + 24 + b"&nonce=".len() + len;
    Some((Candidate(bytes[..size].to_vec()), size))
}
fn collect(data: &[u8], base: usize, last: &mut Option<usize>, found: &mut Vec<(Candidate, u32)>) {
    for at in memchr::memmem::find_iter(data, b"?accountId=") {
        let absolute = base.saturating_add(at);
        if last.is_some_and(|old| absolute <= old) {
            continue;
        }
        if let Some((candidate, _)) = parse(&data[at..]) {
            *last = Some(absolute);
            if let Some((_, count)) = found
                .iter_mut()
                .find(|(old, _)| old.bytes() == candidate.bytes())
            {
                *count = count.saturating_add(1);
            } else if found.len() < 64 {
                found.push((candidate, 1));
            }
        }
    }
}
#[cfg(not(windows))]
pub fn scan(_: u32, cancelled: impl Fn() -> bool) -> Result<Vec<Candidate>, String> {
    Err(if cancelled() {
        "helper-cancelled"
    } else {
        "helper-session-unavailable"
    }
    .into())
}
#[cfg(windows)]
pub fn scan(pid: u32, cancelled: impl Fn() -> bool) -> Result<Vec<Candidate>, String> {
    use std::{
        ffi::c_void,
        mem::{size_of, zeroed},
        time::{Duration, Instant},
    };
    type Handle = *mut c_void;
    #[repr(C)]
    struct Info {
        base: usize,
        allocation: usize,
        allocation_protect: u32,
        size: usize,
        state: u32,
        protect: u32,
        kind: u32,
    }
    #[link(name = "kernel32")]
    extern "system" {
        fn OpenProcess(access: u32, inherit: i32, pid: u32) -> Handle;
        fn CloseHandle(handle: Handle) -> i32;
        fn VirtualQueryEx(
            handle: Handle,
            address: *const c_void,
            info: *mut Info,
            len: usize,
        ) -> usize;
        fn ReadProcessMemory(
            handle: Handle,
            address: *const c_void,
            out: *mut c_void,
            len: usize,
            read: *mut usize,
        ) -> i32;
    }
    struct Owned(Handle);
    impl Drop for Owned {
        fn drop(&mut self) {
            unsafe {
                CloseHandle(self.0);
            }
        }
    }
    if cancelled() {
        return Err("helper-cancelled".into());
    }
    unsafe {
        let handle = Owned(OpenProcess(0x10 | 0x400, 0, pid));
        if handle.0.is_null() {
            return Err("access-denied".into());
        }
        let deadline = Instant::now() + Duration::from_secs(15);
        let mut found = Vec::new();
        let mut buffer = Candidate(vec![0u8; 1024 * 1024 + 256]);
        'phases: for phase in 0..2 {
            let (mut cursor, mut tail, mut last) = (0usize, 0usize, None);
            loop {
                if cancelled() {
                    return Err("helper-cancelled".into());
                }
                if Instant::now() >= deadline {
                    break 'phases;
                }
                let mut info: Info = zeroed();
                if VirtualQueryEx(
                    handle.0,
                    cursor as *const c_void,
                    &mut info,
                    size_of::<Info>(),
                ) == 0
                {
                    break;
                }
                let Some(end) = info.base.checked_add(info.size).filter(|&end| end > cursor) else {
                    break;
                };
                let readable = info.state == 0x1000
                    && info.protect & 0x100 == 0
                    && matches!(info.protect & 0xff, 2 | 4 | 8 | 32 | 64 | 128);
                let selected = if phase == 0 {
                    info.kind == 0x20000
                } else {
                    info.kind != 0x20000
                };
                if !readable || !selected {
                    cursor = end;
                    tail = 0;
                    continue;
                }
                while cursor < end {
                    if cancelled() {
                        return Err("helper-cancelled".into());
                    }
                    if Instant::now() >= deadline {
                        break 'phases;
                    }
                    let len = (end - cursor).min(1024 * 1024);
                    let mut read = 0;
                    let ok = ReadProcessMemory(
                        handle.0,
                        cursor as *const c_void,
                        buffer.0[tail..].as_mut_ptr().cast(),
                        len,
                        &mut read,
                    );
                    if read > 0 && read <= len {
                        collect(
                            &buffer.0[..tail + read],
                            cursor.saturating_sub(tail),
                            &mut last,
                            &mut found,
                        );
                        let next_tail = (tail + read).min(256);
                        buffer
                            .0
                            .copy_within(tail + read - next_tail..tail + read, 0);
                        tail = next_tail;
                    } else {
                        tail = 0;
                    }
                    cursor = cursor.saturating_add(len);
                    if ok == 0 || read != len {
                        tail = 0;
                    }
                }
            }
        }
        found.sort_by(|a, b| b.1.cmp(&a.1));
        Ok(found
            .into_iter()
            .take(8)
            .map(|(candidate, _)| candidate)
            .collect())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> Vec<u8> {
        b"?accountId=0123456789abcdef01234567&nonce=123456789012345678\0".to_vec()
    }
    #[test]
    fn strict_parser() {
        assert_eq!(
            parse(&fixture()).unwrap().0.bytes(),
            &fixture()[..fixture().len() - 1]
        );
        assert!(parse(b"?accountId=x&nonce=1\0").is_none());
        assert!(
            parse(b"?accountId=0123456789abcdef01234567&nonce=18446744073709551616\0").is_none()
        );
        assert!(parse(b"?accountId=0123456789abcdef01234567&nonce=12x\0").is_none());
    }
    #[test]
    fn overlap_boundary_and_dedup() {
        let b = fixture();
        let cut = 40;
        let mut found = Vec::new();
        let mut last = None;
        collect(&b[..cut], 0, &mut last, &mut found);
        assert!(found.is_empty());
        collect(&b, 0, &mut last, &mut found);
        collect(&b, 0, &mut last, &mut found);
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].1, 1);
        collect(&b, 1000, &mut last, &mut found);
        assert_eq!(found[0].1, 2);
    }
    #[test]
    fn cancellation_before_open() {
        assert_eq!(scan(0, || true).err().unwrap(), "helper-cancelled");
    }
}

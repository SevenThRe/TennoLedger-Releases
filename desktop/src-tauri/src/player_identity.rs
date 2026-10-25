//! Reference FoundryHelper reads the game's own login line, not a market nickname.
use std::{fs::File, io::Read, path::Path, time::SystemTime};

#[derive(Debug, PartialEq, Eq)]
pub struct LoginIdentity {
    pub name: String,
    line: String,
    offset: usize,
    created: Option<SystemTime>,
}

fn system_message(line:&str)->Option<&str>{
    line.split_once(" Sys [Info]: ").and_then(|(prefix,message)|{
        let timestamp=prefix.trim();
        (!timestamp.is_empty() && timestamp.chars().all(|c|c.is_ascii_digit()||c=='.') && timestamp.parse::<f64>().is_ok_and(|n|n.is_finite()&&n>=0.0)).then_some(message)
    })
}
fn parse(text: &str) -> Option<LoginIdentity> {
    let mut result = None;
    let mut offset = 0;
    for line in text.split_inclusive('\n') {
        let message=system_message(line);
        if let Some(value) = message.and_then(|m| m.strip_prefix("Logged in ")) {
            let name = value.split('(').next()?.trim();
            result = if !name.is_empty() && name.len() <= 64
                && name.chars().all(|c| c.is_alphanumeric() || matches!(c, '-' | '_' | '.'))
            {
                Some(LoginIdentity { name: name.into(), line: line.trim_end().into(), offset, created: None })
            } else { None };
        } else if message.is_some_and(|m| m.starts_with("Logged out")) {
            result = None;
        }
        offset += line.len();
    }
    result
}

pub fn read(path: &Path) -> Option<LoginIdentity> {
    let file=File::open(path).ok()?;let meta=file.metadata().ok()?;
    // EE.log grows well beyond 16MB during long missions. Scan a finite snapshot
    // with bounded memory; an oversized unrelated line cannot suppress a name.
    let mut reader=file.take(meta.len());let mut chunk=[0u8;65536];let mut line=Vec::with_capacity(256);
    let mut discard=false;let mut offset=0usize;let mut start=0usize;let mut identity=None;
    loop {
        let n=reader.read(&mut chunk).ok()?;if n==0{break;}
        for &byte in &chunk[..n] {
            offset+=1;
            if byte==b'\n'{
                if !discard {
                    let text=String::from_utf8_lossy(&line);
                    if system_message(&text).is_some_and(|m|m.starts_with("Logged in ")||m.starts_with("Logged out")){
                        identity=parse(&text).map(|mut value|{value.offset=start;value.created=meta.created().ok();value});
                    }
                }
                line.clear();discard=false;start=offset;
            }else if !discard{if line.len()<65536{line.push(byte);}else{line.clear();discard=true;}}
        }
    }
    if !discard&&!line.is_empty(){let text=String::from_utf8_lossy(&line);if system_message(&text).is_some_and(|m|m.starts_with("Logged in ")||m.starts_with("Logged out")){identity=parse(&text).map(|mut value|{value.offset=start;value.created=meta.created().ok();value});}}
    identity
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn long_game_log_and_oversized_unrelated_line_do_not_erase_the_player_name(){
        use std::io::Write;
        let path=std::env::temp_dir().join(format!("myframe-name-{}-{}.log",std::process::id(),chrono::Utc::now().timestamp_nanos_opt().unwrap()));
        let mut file=File::create(&path).unwrap();file.write_all(b"1 Sys [Info]: Logged in Correct.Name (account)\n").unwrap();
        for _ in 0..18{file.write_all(&vec![b'x';1024*1024]).unwrap();}file.write_all(b"\n").unwrap();drop(file);
        assert_eq!(read(&path).unwrap().name,"Correct.Name");
        let mut file=std::fs::OpenOptions::new().append(true).open(&path).unwrap();file.write_all(b"2 Sys [Info]: Logged in Renamed.Name (account)\n").unwrap();drop(file);
        assert_eq!(read(&path).unwrap().name,"Renamed.Name");std::fs::remove_file(path).unwrap();
    }
    #[test]
    fn uses_latest_system_login_and_ignores_chat_or_credentials() {
        let log = "1 Sys [Info]: Logged in First.Name (account)\n2 Chat [Info]: Logged in Fake\n3 Sys [Info]: Logged in Actual-Name (account)\n";
        assert_eq!(parse(log).unwrap().name, "Actual-Name");
        assert!(parse("1 Sys [Info]: Logged in name@example.com (private)\n").is_none());
        assert!(parse("1 Chat [Info]: Logged in Fake\n").is_none());
        assert!(parse("1 Chat [Info]: Sys [Info]: Logged in Fake\n").is_none());
        assert!(parse("Sys [Info]: Logged in Fake\n").is_none());
    }
    #[test]
    fn logout_and_changed_login_invalidate_inflight_binding() {
        let first = "1 Sys [Info]: Logged in Same.Name (account)\n";
        assert_ne!(parse(first), parse(&(first.to_owned()+"2 Sys [Info]: Logged in Same.Name (account)\n")));
        assert_eq!(parse(first), parse(&(first.to_owned()+"2 Game [Info]: mission started\n")));
        assert!(parse(&(first.to_owned()+"2 Sys [Info]: Logged out\n")).is_none());
    }
}

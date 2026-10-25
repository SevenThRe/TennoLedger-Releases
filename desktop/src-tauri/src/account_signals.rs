//! Read only new log records. No log text or account identifiers leave this module.
use std::{fs::File,io::{Read,Seek,SeekFrom},path::Path,time::SystemTime};
#[derive(Default)] pub struct Signals {pub refresh:bool,pub login:bool}
#[derive(Default)] pub struct Tail {offset:u64,created:Option<SystemTime>,initialized:bool,pending:Vec<u8>,discard:bool}
impl Tail {
    pub fn poll(&mut self,path:&Path)->Signals {
        let mut out=Signals::default();
        let Ok(mut file)=File::open(path) else{return out};
        let Ok(meta)=file.metadata() else{return out};
        let created=meta.created().ok();
        if !self.initialized {self.offset=meta.len();self.initialized=true;}
        else if created!=self.created||meta.len()<self.offset {self.offset=0;self.pending.clear();self.discard=false;}
        self.created=created;
        if file.seek(SeekFrom::Start(self.offset)).is_err(){return out;}
        let mut bytes=Vec::new();if file.take(262144).read_to_end(&mut bytes).is_err(){return out;}
        self.offset+=bytes.len() as u64;
        self.consume(&bytes,&mut out);out
    }
    fn consume(&mut self,bytes:&[u8],out:&mut Signals){
        for &b in bytes {
            if b==b'\n' {
                if !self.discard {
                    let line=String::from_utf8_lossy(&self.pending);
                    if line.contains("OnInventoryResults completed") {out.refresh=true;}
                    if line.contains("MainMenu::LoginDone result=true") {out.login=true;out.refresh=true;}
                }
                self.pending.clear();self.discard=false;
            } else if !self.discard {
                if self.pending.len()<65536 {self.pending.push(b);} else {self.pending.clear();self.discard=true;}
            }
        }
    }
}
#[cfg(test)] mod tests {
    use super::*;
    #[test]fn fragmented_lines_and_login(){let mut t=Tail::default();let mut s=Signals::default();t.consume(b"Sys: OnInventoryRes",&mut s);assert!(!s.refresh);t.consume(b"ults completed in 87ms\n",&mut s);assert!(s.refresh);let mut s=Signals::default();t.consume(b"MainMenu::LoginDone result=true\n",&mut s);assert!(s.login);}
    #[test]fn oversized_records_cannot_trigger(){let mut t=Tail::default();let mut s=Signals::default();t.consume(&vec![b'x';65537],&mut s);t.consume(b"OnInventoryResults completed\n",&mut s);assert!(!s.refresh);t.consume(b"OnInventoryResults completed\n",&mut s);assert!(s.refresh);}
}

// Only extract the public in-game display name; never retain the login record.
pub fn login_name(text: &str) -> Option<String> {
    text.lines().rev().find_map(|line| {
        let (_, tail) = line.split_once("Logged in ")?;
        let name = tail.split_once('(').map_or(tail, |(name, _)| name);
        let name = name.trim();
        (!name.is_empty() && name.chars().count() <= 64 && !name.chars().any(char::is_control)).then(||name.to_owned())
    })
}
pub fn current_login_name() -> Option<String> {
    let path=std::path::PathBuf::from(std::env::var_os("LOCALAPPDATA")?).join("Warframe/EE.log");
    let file=File::open(path).ok()?;
    if file.metadata().ok()?.len()>64*1024*1024{return None;}
    let mut bytes=Vec::new();file.take(64*1024*1024).read_to_end(&mut bytes).ok()?;
    login_name(&String::from_utf8_lossy(&bytes))
}
#[cfg(test)] mod name_tests {
    use super::*;
    #[test] fn latest_public_name_only(){assert_eq!(login_name("Sys: Logged in Old (private)\nSys: Logged in New-Name (private)"),Some("New-Name".into()));}
    #[test] fn plain_login_and_crlf(){assert_eq!(login_name("22.621 Sys [Info]: Logged in MaeveBeckett\r\n"),Some("MaeveBeckett".into()));}
    #[test] fn missing_or_empty_is_unknown(){assert_eq!(login_name("Logged in  (private)"),None);assert_eq!(login_name("login failed"),None);}
}

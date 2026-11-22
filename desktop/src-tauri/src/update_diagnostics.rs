//! Diagnostics contain only allowlisted categories, never raw error text or URLs.
use std::{error::Error,time::Instant};
fn cause_kind(error:&(dyn Error+'static))->&'static str {
 let text=error.to_string().to_ascii_lowercase();
 if text.contains("tls")||text.contains("certificate")||text.contains("invalidcontenttype")||text.contains("invalid peer")||text.contains("corrupt message") {"tls"}
 else if let Some(io)=error.downcast_ref::<std::io::Error>() {match io.kind(){std::io::ErrorKind::TimedOut=>"timeout",std::io::ErrorKind::ConnectionRefused=>"connection_refused",std::io::ErrorKind::ConnectionReset=>"connection_reset",_=>"io"}}
 else {"unknown"}
}
pub fn failure(stage:&str,kind:&str,start:Instant,status:Option<u16>,causes:Vec<&str>)->String {
 serde_json::json!({"type":"update-diagnostic","schema":1,"stage":stage,"kind":kind,"elapsedMs":start.elapsed().as_millis().min(u64::MAX as u128) as u64,"status":status,"causes":causes}).to_string()
}
pub fn transport(stage:&str,error:&reqwest::Error,start:Instant)->String {
 let mut causes=vec![];let mut source=error.source();
 while let Some(e)=source {if causes.len()==8{break;}causes.push(cause_kind(e));source=e.source();}
 let kind=if error.is_timeout(){"timeout"}else if causes.contains(&"tls"){"tls"}else if error.is_redirect(){"redirect"}else if error.is_connect(){"connect"}else if error.is_body(){"body"}else {"transport_unknown"};
 failure(stage,kind,start,error.status().map(|s|s.as_u16()),causes)
}
pub fn io(stage:&str,error:&std::io::Error,start:Instant)->String {
 let mut causes=vec![cause_kind(error)];let mut source=error.source();while let Some(e)=source {if causes.len()==8{break;}causes.push(cause_kind(e));source=e.source();}
 failure(stage,"body",start,None,causes)
}
#[cfg(test)]mod tests {
 use super::*;use std::{net::TcpListener,io::Write,time::Duration};
 #[test]fn controlled_timeout_and_refused_connection(){
  let listener=TcpListener::bind("127.0.0.1:0").unwrap();let address=listener.local_addr().unwrap();
  let server=std::thread::spawn(move||{let (_stream,_)=listener.accept().unwrap();std::thread::sleep(Duration::from_millis(250));});
  let http=reqwest::blocking::Client::builder().no_proxy().timeout(Duration::from_millis(60)).build().unwrap();let start=Instant::now();let error=http.get(format!("http://{address}/?token=secret")).send().unwrap_err();
  let value=transport("manifest",&error,start);assert!(value.contains("timeout"));assert!(!value.contains("secret"));server.join().unwrap();
  let listener=TcpListener::bind("127.0.0.1:0").unwrap();let address=listener.local_addr().unwrap();drop(listener);let http=reqwest::blocking::Client::builder().no_proxy().timeout(Duration::from_secs(5)).build().unwrap();let start=Instant::now();let error=http.get(format!("http://{address}")).send().unwrap_err();let diagnostic=transport("signature",&error,start);assert!(diagnostic.contains("connect"),"{diagnostic}");
 }
 #[test]fn controlled_tls_protocol_failure(){
  let listener=TcpListener::bind("127.0.0.1:0").unwrap();let address=listener.local_addr().unwrap();
  let server=std::thread::spawn(move||{let (mut stream,_)=listener.accept().unwrap();stream.write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n").unwrap();std::thread::sleep(Duration::from_millis(60));});
  let error=reqwest::blocking::Client::builder().no_proxy().timeout(Duration::from_secs(2)).build().unwrap().get(format!("https://{address}/?secret=hidden")).send().unwrap_err();
  let diagnostic=transport("archive",&error,Instant::now());assert!(diagnostic.contains("\"tls\""),"{diagnostic}");assert!(!diagnostic.contains("hidden"));server.join().unwrap();
 }
 #[test]fn nested_sources_never_export_credentials_or_untrusted_text(){
  let nested=std::io::Error::other(std::io::Error::other("TLS certificate https://user:password@evil.invalid/a?token=secret Authorization: Bearer private\n\"stage\":\"forged\""));
  let result=io("archive",&nested,Instant::now());for secret in ["password","evil.invalid","secret","Authorization","private","forged"]{assert!(!result.contains(secret));}assert!(result.contains("tls"));
  assert_eq!(cause_kind(&std::io::Error::other("unknown remote error")),"io");
 }
}

//! arbi.guide's localhost export protocol; only the explicitly selected log is exposed.
use std::{io::{Read, Write}, net::{TcpListener, TcpStream}, sync::atomic::{AtomicU64, Ordering}, time::{Duration, Instant}};
static GENERATION: AtomicU64 = AtomicU64::new(0);

fn response(request: &str, port: u16, token: &str) -> (u16, bool) {
    let mut lines = request.split("\r\n");
    let first = lines.next().unwrap_or("").split_whitespace().collect::<Vec<_>>();
    if first.len()!=3 || first[2]!="HTTP/1.1" {return (400,false)}
    let headers = lines.filter_map(|s|s.split_once(':')).map(|(k,v)|(k.to_ascii_lowercase(),v.trim())).collect::<Vec<_>>();
    let header=|key:&str|headers.iter().find(|(k,_)|k==key).map(|(_,v)|*v);
    if header("host")!=Some(format!("127.0.0.1:{port}").as_str()) || header("origin")!=Some("https://arbi.guide") {return (403,false)}
    if first[1]!=format!("/v1/arbExports/{token}") {return (404,false)}
    match first[0] {"GET"=>(200,true),"OPTIONS" if header("access-control-request-method")==Some("GET")=>(204,false),_=>(405,false)}
}
fn serve(mut stream:TcpStream,port:u16,token:&str,log:&str)->std::io::Result<bool>{
    stream.set_read_timeout(Some(Duration::from_secs(2)))?;
    stream.set_write_timeout(Some(Duration::from_secs(5)))?;
    let mut bytes=Vec::new();let mut one=[0u8;1];
    while bytes.len()<16384 && !bytes.ends_with(b"\r\n\r\n") {if stream.read(&mut one)?==0 {return Ok(false)} bytes.push(one[0]);}
    let (status,send)=if bytes.ends_with(b"\r\n\r\n"){response(&String::from_utf8_lossy(&bytes),port,token)}else{(400,false)};
    let reason=match status{200=>"OK",204=>"No Content",403=>"Forbidden",404=>"Not Found",405=>"Method Not Allowed",_=>"Bad Request"};
    let body=if send{log}else{""};
    write!(stream,"HTTP/1.1 {status} {reason}\r\nConnection: close\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nAccess-Control-Allow-Origin: https://arbi.guide\r\nVary: Origin\r\nAccess-Control-Allow-Methods: GET\r\nAccess-Control-Allow-Headers: Accept\r\nAccess-Control-Allow-Private-Network: true\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: {}\r\n\r\n",body.len())?;
    stream.write_all(body.as_bytes())?;Ok(send)
}
pub fn open(log:String)->Result<(),String>{
    let token:String=rusqlite::Connection::open_in_memory().map_err(|e|e.to_string())?.query_row("SELECT lower(hex(randomblob(16)))",[],|r|r.get(0)).map_err(|e|e.to_string())?;
    let listener=TcpListener::bind(("127.0.0.1",0)).map_err(|e|e.to_string())?;
    let port=listener.local_addr().map_err(|e|e.to_string())?.port();
    listener.set_nonblocking(true).map_err(|e|e.to_string())?;
    let generation=GENERATION.fetch_add(1,Ordering::SeqCst)+1;
    let url=reqwest::Url::parse(&format!("https://arbi.guide/analyzer/?afPort={port}&afArbitrationID={token}")).map_err(|e|e.to_string())?;
    std::thread::spawn(move||{let start=Instant::now();while start.elapsed()<Duration::from_secs(180) && GENERATION.load(Ordering::SeqCst)==generation {match listener.accept(){Ok((stream,_))=>{if serve(stream,port,&token,&log).unwrap_or(false){break}},Err(e) if e.kind()==std::io::ErrorKind::WouldBlock=>std::thread::sleep(Duration::from_millis(50)),Err(_)=>break}}});
    crate::open_browser_url(&url)
}
#[cfg(test)]mod tests{use super::*;
 #[test]fn requires_origin_host_and_capability(){let token="0123456789abcdef0123456789abcdef";let req=format!("GET /v1/arbExports/{token} HTTP/1.1\r\nHost: 127.0.0.1:1234\r\nOrigin: https://arbi.guide\r\n\r\n");assert_eq!(response(&req,1234,token),(200,true));assert_eq!(response(&req.replace("https://arbi.guide","https://example.com"),1234,token),(403,false));assert_eq!(response(&req,1235,token),(403,false));assert_eq!(response(&req,1234,"different"),(404,false));assert_eq!(response(&req.replace("GET ","OPTIONS ").replace("\r\n\r\n","\r\nAccess-Control-Request-Method: GET\r\n\r\n"),1234,token),(204,false));}
 #[test]fn serves_exact_log_over_loopback(){let listener=TcpListener::bind(("127.0.0.1",0)).unwrap();let port=listener.local_addr().unwrap().port();let worker=std::thread::spawn(move||serve(listener.accept().unwrap().0,port,"token","仲裁\nline 2").unwrap());let mut client=TcpStream::connect(("127.0.0.1",port)).unwrap();write!(client,"GET /v1/arbExports/token HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nOrigin: https://arbi.guide\r\n\r\n").unwrap();let mut output=String::new();client.read_to_string(&mut output).unwrap();assert!(output.ends_with("\r\n\r\n仲裁\nline 2"));assert!(worker.join().unwrap());}
}

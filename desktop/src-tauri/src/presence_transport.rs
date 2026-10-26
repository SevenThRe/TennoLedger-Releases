//! Same environment/Windows proxy selection as reqwest; never bypass a failed configured proxy.
use std::{io::{Read,Write},net::{TcpStream,ToSocketAddrs},time::Duration};
use hyper_util::client::proxy::matcher::{Matcher,Intercept};
use tungstenite::client::IntoClientRequest;
const HOST:&str="ws.warframe.market";
pub fn request()->Result<tungstenite::http::Request<()>,String>{
 let mut request="wss://ws.warframe.market/socket".into_client_request().map_err(|_|"状态协议初始化失败")?;
 request.headers_mut().insert("Sec-WebSocket-Protocol","wfm".parse().unwrap());
 request.headers_mut().insert("User-Agent",concat!("TennoLedger/",env!("CARGO_PKG_VERSION")).parse().unwrap());
 Ok(request)
}
fn tcp(host:&str,port:u16)->Result<TcpStream,String>{
 let addresses=(host,port).to_socket_addrs().map_err(|_|"状态连接域名解析失败")?;
 for address in addresses.take(4){if let Ok(stream)=TcpStream::connect_timeout(&address,Duration::from_secs(8)){
  stream.set_read_timeout(Some(Duration::from_secs(10))).map_err(|_|"状态连接初始化失败")?;
  stream.set_write_timeout(Some(Duration::from_secs(8))).map_err(|_|"状态连接初始化失败")?;return Ok(stream)
 }}Err("状态连接超时，请检查网络或代理是否运行".into())
}
fn tunnel(stream:&mut TcpStream,auth:Option<&str>)->Result<(),String>{
 let mut request=format!("CONNECT {HOST}:443 HTTP/1.1\r\nHost: {HOST}:443\r\n");
 if let Some(auth)=auth{if auth.contains(['\r','\n']){return Err("代理认证配置无效".into())}request.push_str(&format!("Proxy-Authorization: {auth}\r\n"));}
 request.push_str("\r\n");stream.write_all(request.as_bytes()).map_err(|_|"代理隧道请求发送失败")?;
 let mut response=Vec::new();let mut byte=[0u8;1];
 while response.len()<16384&&!response.ends_with(b"\r\n\r\n"){if stream.read(&mut byte).map_err(|_|"代理隧道响应超时或断开")?==0{return Err("代理隧道提前关闭".into())}response.push(byte[0]);}
 if !response.ends_with(b"\r\n\r\n"){return Err("代理响应头超限".into())}
 let response=String::from_utf8_lossy(&response);let mut status=response.lines().next().unwrap_or("").split_whitespace();
 if !matches!(status.next(),Some("HTTP/1.0"|"HTTP/1.1")){return Err("代理返回无效响应".into())}
 match status.next().and_then(|s|s.parse::<u16>().ok()){Some(200)=>Ok(()),Some(407)=>Err("系统代理要求认证，请检查代理账号配置".into()),Some(code)=>Err(format!("系统代理拒绝状态隧道（HTTP {code}）")),None=>Err("代理返回无效状态码".into())}
}
pub fn open()->Result<TcpStream,String>{
 let destination="https://ws.warframe.market/socket".parse().map_err(|_|"状态地址无效")?;
 open_with_proxy(Matcher::from_system().intercept(&destination))
}
fn open_with_proxy(proxy:Option<Intercept>)->Result<TcpStream,String>{
 if let Some(proxy)=proxy{
  if proxy.uri().scheme_str()!=Some("http"){return Err("状态连接暂不支持此代理协议；请使用系统 HTTP 代理".into())}
  let host=proxy.uri().host().ok_or("代理地址无效")?;let port=proxy.uri().port_u16().unwrap_or(80);
  let mut stream=tcp(host,port)?;
  tunnel(&mut stream,proxy.basic_auth().and_then(|h|h.to_str().ok()))?;Ok(stream)
 }else{tcp(HOST,443)}
}
pub fn handshake_error(error:&tungstenite::HandshakeError<tungstenite::ClientHandshake<tungstenite::stream::MaybeTlsStream<TcpStream>>>)->String{
 use tungstenite::{HandshakeError,Error};
 match error{
  HandshakeError::Failure(Error::Http(response))=>{let status=response.status().as_u16();if response.headers().get("cf-mitigated").and_then(|h|h.to_str().ok())==Some("challenge"){"市场状态服务返回 Cloudflare 验证（HTTP 403）；请检查系统代理，稍后重连".into()}else{format!("市场状态握手被拒绝（HTTP {status}）")}},
  HandshakeError::Failure(Error::Tls(_))=>"市场状态 TLS 证书验证或加密协商失败".into(),
  HandshakeError::Failure(Error::Io(e)) if matches!(e.kind(),std::io::ErrorKind::TimedOut|std::io::ErrorKind::WouldBlock)=>"市场状态握手超时，请检查网络或系统代理".into(),
  HandshakeError::Failure(Error::Io(_))=>"市场状态连接中断，请检查网络或系统代理".into(),
  _=>"市场状态 WebSocket 协议握手失败".into()
 }
}
#[cfg(test)]mod tests{
 use super::*;
 #[test]fn handshake_identifies_product_without_credentials(){let r=request().unwrap();assert_eq!(r.headers()["Sec-WebSocket-Protocol"],"wfm");assert_eq!(r.headers()["User-Agent"],concat!("TennoLedger/",env!("CARGO_PKG_VERSION")));assert!(!r.headers().contains_key("Authorization"));assert!(!r.headers().contains_key("Cookie"));}
 #[test]fn connect_keeps_following_bytes_and_auth_out_of_application_stream(){let listener=std::net::TcpListener::bind(("127.0.0.1",0)).unwrap();let address=listener.local_addr().unwrap();let server=std::thread::spawn(move||{let(mut s,_)=listener.accept().unwrap();let mut data=Vec::new();let mut b=[0];while !data.ends_with(b"\r\n\r\n"){s.read_exact(&mut b).unwrap();data.push(b[0]);}let request=String::from_utf8(data).unwrap();assert!(request.starts_with("CONNECT ws.warframe.market:443 HTTP/1.1\r\n"));assert!(request.contains("Proxy-Authorization: Basic fixture\r\n"));s.write_all(b"HTTP/1.1 200 Connection established\r\n\r\nnext").unwrap();});let mut s=tcp("127.0.0.1",address.port()).unwrap();tunnel(&mut s,Some("Basic fixture")).unwrap();let mut tail=[0;4];s.read_exact(&mut tail).unwrap();assert_eq!(&tail,b"next");server.join().unwrap();}
 #[test]fn honors_no_proxy_and_https_selection(){let matcher=Matcher::builder().https("http://127.0.0.1:1234").no("localhost").build();assert!(matcher.intercept(&"https://localhost/".parse().unwrap()).is_none());assert_eq!(matcher.intercept(&"https://ws.warframe.market/socket".parse().unwrap()).unwrap().uri().port_u16(),Some(1234));}
 #[test]fn errors_do_not_expose_response_bodies(){let response=tungstenite::http::Response::builder().status(403).header("cf-mitigated","challenge").body(Some(b"secret body".to_vec())).unwrap();let error=tungstenite::HandshakeError::Failure(tungstenite::Error::Http(Box::new(response)));let message=handshake_error(&error);assert!(message.contains("Cloudflare"));assert!(!message.contains("secret"));}
}

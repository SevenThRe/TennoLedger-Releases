//! Public AlecaFrame price service. Contains public slugs only; never market credentials or inventory.
use serde::{Deserialize,Serialize};
use std::{collections::HashMap,io::Read,sync::{Mutex,OnceLock},time::{Duration,Instant}};
const URL:&str="https://api.alecaframe.com/prices/priceData";
#[derive(Clone,Debug,Default,Deserialize,Serialize)]
#[serde(rename_all="camelCase")]
pub struct Price{pub slug:String,pub post:Option<u32>,pub insta:Option<u32>,pub post_max:Option<u32>,pub min_r0:Option<u32>,pub min_r_max:Option<u32>,pub volume:Option<u64>,pub fetched_at:String}
struct Cache{client:reqwest::blocking::Client,items:HashMap<String,(Instant,Price)>,last:Option<Instant>}
static CACHE:OnceLock<Result<Mutex<Cache>,String>>=OnceLock::new();
fn valid_slugs(slugs:&[String])->Result<(),String>{if slugs.is_empty()||slugs.len()>200||slugs.iter().any(|s|s.is_empty()||s.len()>100||!s.bytes().all(|b|b.is_ascii_lowercase()||b.is_ascii_digit()||b==b'_')){return Err("公开价格请求仅支持1至200个有效市场slug".into());}Ok(())}
fn decode(body:&str,slugs:&[String],at:&str)->Result<Vec<Price>,String>{
 let values:Vec<serde_json::Value>=serde_json::from_str(body).map_err(|_|"Aleca公开价格响应格式变化")?;
 if values.len()!=slugs.len(){return Err("Aleca公开价格响应数量不符，未推测顺序".into());}
 values.into_iter().zip(slugs).map(|(value,slug)|{if !value.is_null()&&!value.is_object(){return Err("Aleca公开价格条目格式变化".into());}let number=|field:&str|->Result<Option<u32>,String>{let Some(v)=value.get(field).filter(|v|!v.is_null())else{return Ok(None)};let n=v.as_u64().filter(|n|*n<=2147483647).ok_or("Aleca公开价格值无效")?;Ok(Some(n as u32))};let volume=match value.get("volume").filter(|v|!v.is_null()){Some(v)=>Some(v.as_u64().filter(|n|*n<=9007199254740991).ok_or("公开价格成交量无效")?),None=>None};Ok(Price{slug:slug.clone(),post:number("post")?,insta:number("insta")?,post_max:number("postMax")?,min_r0:number("minR0")?,min_r_max:number("minRMax")?,volume,fetched_at:at.into()})}).collect()
}
fn read(slugs:Vec<String>,platform:&str)->Result<Vec<Price>,String>{
 valid_slugs(&slugs)?;if platform!="pc"{return Err("Aleca公开价格源仅确认PC，不套用于其他平台".into());}
 let cache=CACHE.get_or_init(||reqwest::blocking::Client::builder().timeout(Duration::from_secs(20)).redirect(reqwest::redirect::Policy::none()).no_proxy().user_agent("TennoLedger/0.1 public-price-reader").build().map(|client|Mutex::new(Cache{client,items:HashMap::new(),last:None})).map_err(|_|"公开价格TLS初始化失败".to_string())).as_ref().map_err(Clone::clone)?;
 let mut cache=cache.lock().map_err(|_|"公开价格队列锁错误")?;
 cache.items.retain(|_,(time,_)|time.elapsed()<Duration::from_secs(900));
 let mut missing:Vec<String>=slugs.iter().filter(|slug|!cache.items.contains_key(*slug)).cloned().collect();missing.sort();missing.dedup();
 if !missing.is_empty(){
  if let Some(last)=cache.last{if last.elapsed()<Duration::from_millis(500){std::thread::sleep(Duration::from_millis(500)-last.elapsed());}}
  cache.last=Some(Instant::now());
  let response=cache.client.post(URL).json(&missing).send().map_err(|_|"Aleca公开价格连接失败")?;
  if !response.status().is_success(){return Err(format!("Aleca公开价格HTTP {}",response.status().as_u16()));}
  let mut bytes=Vec::new();response.take(262145).read_to_end(&mut bytes).map_err(|_|"公开价格响应读取失败")?;if bytes.len()>262144{return Err("公开价格响应超限".into());}
  let body=std::str::from_utf8(&bytes).map_err(|_|"公开价格响应编码无效")?;
  for price in decode(body,&missing,&chrono::Utc::now().to_rfc3339())?{cache.items.insert(price.slug.clone(),(Instant::now(),price));}
 }
 slugs.into_iter().map(|slug|cache.items.get(&slug).map(|(_,p)|p.clone()).ok_or("公开价格未返回对应slug".into())).collect()
}
#[tauri::command]
pub async fn market_aleca_prices(slugs:Vec<String>,platform:String)->Result<Vec<Price>,String>{tauri::async_runtime::spawn_blocking(move||read(slugs,&platform)).await.map_err(|_|"公开价格任务失败".to_string())?}
#[cfg(test)]mod tests{
 use super::*;
 #[test]fn public_payload_is_bounded_slugs_only(){assert!(valid_slugs(&["serration".into(),"arcane_energize".into()]).is_ok());for s in ["Bearer token","../account","https://x","中文"]{assert!(valid_slugs(&[s.into()]).is_err());}assert!(valid_slugs(&vec!["x".into();201]).is_err());}
 #[test]fn observed_public_response_decodes_positionally_and_retains_unknown(){let rows=decode(r#"[{"post":2,"insta":0,"postMax":40,"minR0":2,"minRMax":40,"volume":6},null]"#,&["serration".into(),"unknown".into()],"now").unwrap();assert_eq!(rows[0].min_r_max,Some(40));assert_eq!(rows[0].insta,Some(0));assert_eq!(rows[1].min_r0,None);assert_eq!(rows[1].slug,"unknown");assert!(decode("[]",&["a".into()],"now").is_err());assert!(decode(r#"[{"minR0":-1}]"#,&["a".into()],"now").is_err());}
}

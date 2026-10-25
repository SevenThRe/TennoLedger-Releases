use serde_json::{json,Value};
use std::sync::{Mutex,OnceLock};
use std::time::{Duration,Instant};

static CACHE:OnceLock<Mutex<Option<(Instant,Value)>>>=OnceLock::new();
fn excluded(slug:&str)->bool{let lower=slug.to_lowercase();lower.contains("orokin")||lower.contains("forma")||slug.contains('’')}
fn expand_prices(items:&[Value],prices:Vec<Value>)->Result<Vec<Value>,String>{
 let expected=items.iter().filter(|item|!excluded(item["slug"].as_str().unwrap_or(""))).count();
 if expected!=prices.len(){return Err("批量价格数量与查询目录不一致".into());}
 let mut values=prices.into_iter();
 Ok(items.iter().map(|item|if excluded(item["slug"].as_str().unwrap_or("")){Value::Null}else{values.next().unwrap()}).collect())
}

fn merge(items:&[Value],prices:&[Value])->Result<Value,String>{
 if items.len()!=prices.len(){return Err("批量价格数量与市场目录不一致".into());}
 let rows:Vec<Value>=items.iter().zip(prices).map(|(item,price)|{
  let unit=price["post"].as_u64();let volume=price["volume"].as_u64();
  let total=unit.zip(volume).and_then(|(p,v)|p.checked_mul(v));
  json!({"slug":item["slug"],"gameRef":item["gameRef"],"i18n":item["i18n"],"unitPrice":unit,"volume":volume,"totalValue":total})
 }).collect();
 Ok(json!({"rows":rows,"fetchedAt":chrono::Utc::now().to_rfc3339(),"source":"AlecaFrame public priceData","platform":"pc"}))
}

fn fetch(items:Vec<Value>)->Result<Value,String>{
 let mut cached=CACHE.get_or_init(||Mutex::new(None)).lock().map_err(|_|"市场排行缓存锁错误")?;
 if let Some((time,data))=&*cached{if time.elapsed()<Duration::from_secs(900){return Ok(data.clone());}}
 let all:Vec<&str>=items.iter().map(|item|item["slug"].as_str().ok_or("市场目录缺少 slug")).collect::<Result<_,_>>()?;
 let slugs:Vec<&str>=all.into_iter().filter(|slug|!excluded(slug)).collect();
 if slugs.is_empty()||slugs.len()>20000{return Err("市场目录数量异常".into());}
 let client=reqwest::blocking::Client::builder().timeout(Duration::from_secs(20)).build().map_err(|e|e.to_string())?;
 let response=client.post("https://api.alecaframe.com/prices/priceData").json(&slugs).send().map_err(|e|format!("批量市场价格读取失败：{e}"))?;
 if !response.status().is_success(){return Err(format!("批量市场价格返回 HTTP {}",response.status()));}
 let prices:Vec<Value>=response.json().map_err(|e|format!("批量市场价格格式错误：{e}"))?;
 let data=merge(&items,&expand_prices(&items,prices)?)?;
 *cached=Some((Instant::now(),data.clone()));Ok(data)
}

#[tauri::command]
pub async fn market_analytics()->Result<Value,String>{
 let catalog=crate::market::market_request("items".into(),String::new(),"pc".into(),String::new(),json!({})).await?;
 let items=catalog["data"].as_array().ok_or("市场目录格式错误")?.clone();
 tauri::async_runtime::spawn_blocking(move||fetch(items)).await.map_err(|_|"市场排行任务失败".to_string())?
}

#[cfg(test)]
mod tests{
 use super::*;
 #[test]fn excluded_reference_items_do_not_shift_batch_alignment(){
  let items=vec![json!({"slug":"a"}),json!({"slug":"forma"}),json!({"slug":"b"}),json!({"slug":"orokin_cell"})];
  assert_eq!(expand_prices(&items,vec![json!({"post":1}),json!({"post":2})]).unwrap(),vec![json!({"post":1}),Value::Null,json!({"post":2}),Value::Null]);
  assert!(expand_prices(&items,vec![Value::Null]).is_err());assert!(excluded("Orokin_cell"));assert!(excluded("item’s"));assert!(!excluded("braton_prime_set"));
 }
 #[test]fn missing_prices_stay_unknown_and_totals_use_daily_volume(){
  let items=vec![json!({"slug":"a","gameRef":"/Lotus/Test/Item"}),json!({"slug":"b"}),json!({"slug":"c"})];
  let data=merge(&items,&[json!({"post":8,"volume":125}),Value::Null,json!({"post":0,"volume":0})]).unwrap();
  assert_eq!(data["rows"][0]["totalValue"],1000);assert!(data["rows"][1]["unitPrice"].is_null());
  assert_eq!(data["rows"][0]["gameRef"],"/Lotus/Test/Item");
  assert!(data["rows"][1]["volume"].is_null());assert_eq!(data["rows"][2]["totalValue"],0);
 }
 #[test]fn mismatched_or_invalid_values_never_attach_wrong_prices(){
  let items=vec![json!({"slug":"a"})];assert!(merge(&items,&[]).is_err());
  for price in [json!({"post":-1,"volume":2}),json!({"post":"8","volume":2}),json!({"post":u64::MAX,"volume":2})]{
   assert!(merge(&items,&[price]).unwrap()["rows"][0]["totalValue"].is_null());
  }
 }
 #[test]#[ignore="public network service"]fn public_batch_smoke(){
  let first=tauri::async_runtime::block_on(market_analytics()).unwrap();
  let rows=first["rows"].as_array().unwrap();assert!(rows.len()>100);
  let braton=rows.iter().find(|row|row["slug"]=="braton_prime_set").unwrap();
  assert!(braton["unitPrice"].is_number());assert!(braton["volume"].is_number());
  println!("Public catalog rows: {}; complete quotes: {}",rows.len(),rows.iter().filter(|row|row["totalValue"].is_number()).count());
  assert_eq!(first,tauri::async_runtime::block_on(market_analytics()).unwrap());
 }
}

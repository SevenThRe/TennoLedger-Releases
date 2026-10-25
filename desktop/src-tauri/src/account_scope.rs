//! Local pseudonymous identities. Raw game account IDs are never retained.
use serde_json::Value;
use sha2::{Digest,Sha256};
#[derive(Clone,serde::Serialize)]
#[serde(rename_all="camelCase")]
pub struct Profile {pub account_scope:String,pub name:Option<String>,pub captured_at:Option<String>,pub active:bool,pub unassigned:bool}
pub const LEGACY:&str="legacy-unassigned";
pub fn valid(scope:&str)->bool{
 ["acct-v1-","name-v1-"].iter().any(|prefix|scope.strip_prefix(prefix).is_some_and(|s|s.len()==64&&s.bytes().all(|c|c.is_ascii_hexdigit()&&!c.is_ascii_uppercase())))
}
fn text(value:&Value)->Option<&str>{value.as_str().or_else(||value["$oid"].as_str()).or_else(||value["oid"].as_str()).or_else(||value["OID"].as_str())}
fn checked(value:&str)->Result<&str,String>{let s=value.trim();if s.is_empty()||s.len()>512||s.chars().any(char::is_control){Err("账户身份格式无效".into())}else{Ok(s)}}
fn key(kind:&str,value:&str)->String{let mut hash=Sha256::new();hash.update(b"tennoledger-local-account-v1\0");hash.update(kind.as_bytes());hash.update([0]);hash.update(value.as_bytes());format!("{kind}-v1-{:x}",hash.finalize())}
fn inspect(value:&Value,depth:u8,ids:&mut Vec<String>,names:&mut Vec<String>)->Result<(),String>{
 if depth>1{return Err("库存包装层无效".into());}
 for field in ["AccountId","AccountID","accountId"]{if let Some(value)=value.get(field).filter(|v|!v.is_null()){let s=text(value).ok_or("账户身份格式无效")?;ids.push(checked(s)?.to_owned());}}
 if let Some(name)=value.get("DisplayName").and_then(Value::as_str).filter(|s|!s.trim().is_empty()){names.push(checked(name)?.to_lowercase());}
 for field in ["InventoryJSON","InventoryJson"]{if let Some(inner)=value.get(field){if let Some(raw)=inner.as_str(){if raw.len()>16*1024*1024{return Err("账户库存超限".into());}let inner:Value=serde_json::from_str(raw).map_err(|_|"账户库存JSON无效")?;inspect(&inner,depth+1,ids,names)?;}else if inner.is_object(){inspect(inner,depth+1,ids,names)?;}}}
 Ok(())
}
pub fn from_value(value:&Value)->Result<Option<String>,String>{
 let mut ids=vec![];let mut names=vec![];inspect(value,0,&mut ids,&mut names)?;
 if ids.windows(2).any(|p|p[0]!=p[1]){return Err("账户身份不一致".into());}
 if let Some(id)=ids.first(){return Ok(Some(key("acct",id)));}
 if names.windows(2).any(|p|p[0]!=p[1]){return Err("账户昵称不一致".into());}
 Ok(names.first().map(|name|key("name",name)))
}
pub fn source_may_select(active:&str,next:Option<&str>,source:&str)->bool{
 if active==LEGACY{return true;}
 let Some(next)=next else{return false;};
 source!="alecaframe-cache"||active==next
}
#[cfg(test)]mod tests{
 use super::*;use serde_json::json;
 #[test]fn ids_are_private_stable_and_preferred_over_renames(){let a=from_value(&json!({"AccountId":"private-A","DisplayName":"Name"})).unwrap().unwrap();assert!(valid(&a));assert!(!a.contains("private-A"));assert_eq!(a,from_value(&json!({"AccountId":{"$oid":"private-A"},"DisplayName":"Renamed"})).unwrap().unwrap());assert_ne!(a,from_value(&json!({"AccountId":"private-B"})).unwrap().unwrap());assert_ne!(a,from_value(&json!({"DisplayName":"Name"})).unwrap().unwrap());assert_eq!(from_value(&json!({})).unwrap(),None);}
 #[test]fn envelopes_conflicts_and_malformed_ids_fail_without_private_values(){assert!(from_value(&json!({"AccountId":"private-A","InventoryJson":{"AccountId":"private-B"}})).unwrap_err().find("private").is_none());assert!(from_value(&json!({"AccountId":{},"DisplayName":"Name"})).is_err());assert_eq!(from_value(&json!({"AccountId":"id","InventoryJSON":"{}"})).unwrap(),from_value(&json!({"AccountId":"id"})).unwrap());}
}

use crate::{collection,domain};
use serde_json::Value;
use std::collections::BTreeMap;

// AlecaFrame 3.0.4 StatsHandler.ReadVitusBalance reads this MiscItems ID.
// Keep it distinct from Steel Essence (/Lotus/Types/Items/MiscItems/SteelEssence).
const VITUS_ITEM_ID: &str = "/Lotus/Types/Items/MiscItems/Elitium";

pub fn append(data:&mut domain::Dataset,s:&collection::Snapshot)->Result<bool,String>{
    if !matches!(s.source.as_str(),"game-memory"|"warframe-api-helper") {return Ok(false);}
    let time=chrono::DateTime::parse_from_rfc3339(&s.captured_at).map_err(|_|"资产历史时间无效")?;
    let ts=time.with_timezone(&chrono::Utc).to_rfc3339_opts(chrono::SecondsFormat::Millis,true);
    if data.general_data_points.iter().any(|p|p.get("ts").and_then(Value::as_str).and_then(|t|chrono::DateTime::parse_from_rfc3339(t).ok()).is_some_and(|t|t==time)){return Ok(false);}
    if data.general_data_points.len()>=100000{return Err("资产历史记录数超过限制".into());}
    let profile=s.player_profile.as_ref();
    let mut row=BTreeMap::new();row.insert("ts".into(),Value::String(ts));
    for (key,value) in [("plat",profile.and_then(|p|p.platinum)),("credits",s.credits),("endo",profile.and_then(|p|p.endo)),("ducats",profile.and_then(|p|p.ducats)),("mr",s.mastery_rank.map(u64::from)),("aya",collection::count(s,"/Lotus/Types/Items/MiscItems/SchismKey")),("vitus",collection::count(s,VITUS_ITEM_ID))] {
        row.insert(key.into(),value.map(Value::from).unwrap_or(Value::Null));
    }
    // No confirmed event counters: absence is unknown, not a fabricated zero.
    data.general_data_points.push(row);
    data.general_data_points.sort_by(|a,b|a["ts"].as_str().cmp(&b["ts"].as_str()));
    Ok(true)
}

#[cfg(test)]mod tests{
 use super::*;
 fn snapshot()->collection::Snapshot{collection::Snapshot{schema_version:1,source:"warframe-api-helper".into(),captured_at:"2026-10-24T08:00:00+08:00".into(),credits:Some(42),..Default::default()}}
 #[test]fn records_only_live_and_keeps_unknowns(){let mut data=domain::Dataset::default();let mut s=snapshot();s.source="alecaframe-cache".into();assert!(!append(&mut data,&s).unwrap());s.source="warframe-api-helper".into();assert!(append(&mut data,&s).unwrap());let p=&data.general_data_points[0];assert_eq!(p["credits"],42);assert!(p["plat"].is_null());assert!(p["aya"].is_null());assert!(!p.contains_key("trades"));assert!(!p.contains_key("relicOpened"));assert_eq!(p["ts"],"2026-10-24T00:00:00.000Z");}
 #[test]fn replay_is_idempotent_and_roundtrips(){let mut data=domain::Dataset::default();let mut s=snapshot();s.counts.insert("/Lotus/Types/Items/MiscItems/SchismKey".into(),3);append(&mut data,&s).unwrap();s.captured_at="2026-10-24T00:00:00Z".into();assert!(!append(&mut data,&s).unwrap());assert_eq!(data.general_data_points.len(),1);assert_eq!(data.general_data_points[0]["aya"],3);assert_eq!(domain::parse(&serde_json::to_string(&data).unwrap()).unwrap().general_data_points.len(),1);}
 #[test]fn vitus_uses_elitium_and_preserves_partial_unknown_and_complete_zero(){
  let mut data=domain::Dataset::default();let mut s=snapshot();
  s.counts.insert("/Lotus/Types/Items/MiscItems/SteelEssence".into(),999);
  append(&mut data,&s).unwrap();assert!(data.general_data_points[0]["vitus"].is_null());
  s.captured_at="2026-10-24T00:01:00Z".into();s.complete=true;
  append(&mut data,&s).unwrap();assert_eq!(data.general_data_points[1]["vitus"],0);
  s.captured_at="2026-10-24T00:02:00Z".into();s.counts.insert(VITUS_ITEM_ID.into(),47);
  append(&mut data,&s).unwrap();assert_eq!(data.general_data_points[2]["vitus"],47);
 }
 #[test]fn same_day_samples_keep_each_balance_without_inventing_activity_counters(){
  let mut data=domain::Dataset::default();let mut s=snapshot();s.counts.insert(VITUS_ITEM_ID.into(),8);
  append(&mut data,&s).unwrap();
  s.captured_at="2026-10-24T00:05:00Z".into();s.counts.insert(VITUS_ITEM_ID.into(),3);
  append(&mut data,&s).unwrap();
  s.captured_at="2026-10-23T23:59:00Z".into();s.counts.insert(VITUS_ITEM_ID.into(),12);
  append(&mut data,&s).unwrap();
  assert_eq!(data.general_data_points.iter().map(|p|p["vitus"].as_u64().unwrap()).collect::<Vec<_>>(),vec![12,8,3]);
  assert!(data.general_data_points.iter().all(|p|!p.contains_key("trades")&&!p.contains_key("relicOpened")));
  let parsed=domain::parse(&serde_json::to_string(&data).unwrap()).unwrap();
  assert_eq!(parsed.general_data_points,data.general_data_points);
 }
}

#[cfg(test)]mod persistence_tests{
 use super::*;
 #[test]fn snapshot_and_history_persist_together_without_replacing_trades(){
  let db=crate::store::Store::open(std::path::Path::new(":memory:")).unwrap();
  let ledger=domain::parse(r#"{"trades":[{"id":"confirmed","ts":"2026-10-23T00:00:00Z","itemId":"item","name":"Item","side":"sale","quantity":1,"platinum":5}]}"#).unwrap();
  db.save(&ledger).unwrap();
  let s=collection::Snapshot{schema_version:1,source:"warframe-api-helper".into(),captured_at:"2026-10-24T00:00:00Z".into(),credits:Some(42),..Default::default()};
  assert!(db.save_live_collection(&s).unwrap());assert!(!db.save_live_collection(&s).unwrap());
  assert_eq!(db.load_collection().unwrap().unwrap().credits,Some(42));
  let saved=db.load().unwrap();assert_eq!(saved.trades[0].id,"confirmed");assert_eq!(saved.general_data_points.len(),1);
 }
}

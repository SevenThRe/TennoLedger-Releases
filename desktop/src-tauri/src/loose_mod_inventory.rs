use serde_json::Value;
use std::collections::BTreeMap;
pub type LooseMods = BTreeMap<String, Option<u64>>;

/// Preserve only anonymous rank-zero stacks; upgraded instances never qualify.
pub fn parse(value: &Value, ranks: Option<&BTreeMap<String, Option<BTreeMap<u32,u64>>>>) -> Option<LooseMods> {
    let ranks=ranks?;
    let rows=value["RawUpgrades"].as_array()?;
    let mut result:LooseMods=ranks.iter().map(|(id,rank)|(id.clone(),rank.as_ref().map(|_|0))).collect();
    for row in rows {
        let id=row["ItemType"].as_str()?;
        let count=row["ItemCount"].as_u64().or_else(||row["ItemCount"].as_str().and_then(|s|s.parse().ok()))?;
        if count==0 {continue;}
        let entry=result.get_mut(id)?;
        if entry.is_none(){continue;}
        let fingerprint=match row.get("UpgradeFingerprint") {
            None|Some(Value::Null)=>Some(0),
            Some(Value::String(s)) if s.is_empty()=>Some(0),
            Some(Value::String(s))=>serde_json::from_str::<Value>(s).ok().filter(Value::is_object).and_then(|v|match v.get("lvl"){None=>Some(0),Some(n)=>n.as_u64()}),
            _=>None,
        };
        let anonymous=match row.get("ItemId") {
            None|Some(Value::Null)=>Some(true),
            Some(Value::String(s))=>Some(s.is_empty()),
            Some(Value::Object(o))=>match o.get("$oid").or_else(||o.get("oid")) {None|Some(Value::Null)=>Some(true),Some(Value::String(s))=>Some(s.is_empty()),_=>None},
            _=>None,
        };
        match (fingerprint,anonymous) {
            (Some(0),Some(true))=>*entry=entry.unwrap().checked_add(count).filter(|n|*n<=1_000_000_000),
            (None,_)|(_,None)=>*entry=None,
            _=>{},
        }
    }
    Some(result)
}
pub fn validate(items:&LooseMods)->Result<(),String>{
    if items.len()>100000||items.iter().any(|(id,n)|!id.starts_with("/Lotus/")||id.len()>512||n.is_some_and(|n|n>1_000_000_000)){return Err("散装模组库存无效".into());}Ok(())
}
#[cfg(test)]
mod tests {
 use super::*;
 use serde_json::json;
 #[test]
 fn loose_mod_only_anonymous_rank_zero_stacks_qualify(){
  let ranks=BTreeMap::from([("/Lotus/Mod".into(),Some(BTreeMap::from([(0,12),(1,3)])))]);
  let data=json!({"RawUpgrades":[
   {"ItemType":"/Lotus/Mod","ItemCount":4},
   {"ItemType":"/Lotus/Mod","ItemCount":"2","UpgradeFingerprint":"{\"lvl\":0}","ItemId":{"$oid":""}},
   {"ItemType":"/Lotus/Mod","ItemCount":6,"ItemId":{"$oid":"private-instance"}},
   {"ItemType":"/Lotus/Mod","ItemCount":3,"UpgradeFingerprint":"{\"lvl\":1}"}
  ]});
  assert_eq!(parse(&data,Some(&ranks)).unwrap()["/Lotus/Mod"],Some(6));
  assert!(parse(&data,None).is_none());
 }
 #[test]
 fn loose_mod_unknown_identity_or_rank_is_not_zero(){
  let ranks=BTreeMap::from([("/Lotus/Mod".into(),Some(BTreeMap::from([(0,1)])))]);
  let data=json!({"RawUpgrades":[{"ItemType":"/Lotus/Mod","ItemCount":1,"ItemId":7}]});
  assert_eq!(parse(&data,Some(&ranks)).unwrap()["/Lotus/Mod"],None);
  let unknown=BTreeMap::from([("/Lotus/Mod".into(),None)]);
  assert_eq!(parse(&json!({"RawUpgrades":[]}),Some(&unknown)).unwrap()["/Lotus/Mod"],None);
  assert!(validate(&BTreeMap::from([("bad-id".into(),Some(1))])).is_err());
 }
 #[test]
 fn loose_mod_snapshot_capture_and_round_trip(){
  let raw=json!({"LastInventorySync":{"$oid":"650000000000000000000000"},"MiscItems":[],"XPInfo":[],"Suits":[],"LongGuns":[],"Pistols":[],"Melee":[],"PlayerLevel":12,"RegularCredits":8000,
   "RawUpgrades":[{"ItemType":"/Lotus/Upgrades/Test","ItemCount":3}],
   "Upgrades":[{"ItemType":"/Lotus/Upgrades/Test","UpgradeFingerprint":"{\"lvl\":0}","ItemId":{"$oid":"private"}}]});
  let snapshot=crate::inventory_data::from_value(&raw,&crate::collection::catalog().unwrap(),None,"test","2026-10-24T00:00:00Z").unwrap();
  assert_eq!(snapshot.upgrade_counts_by_rank.as_ref().unwrap()["/Lotus/Upgrades/Test"].as_ref().unwrap()[&0],4);
  assert_eq!(snapshot.loose_unranked_mods.as_ref().unwrap()["/Lotus/Upgrades/Test"],Some(3));
  let text=serde_json::to_string(&snapshot).unwrap();
  assert!(!text.contains("private"));
  let restored:crate::collection::Snapshot=serde_json::from_str(&text).unwrap();
  assert_eq!(restored.loose_unranked_mods,snapshot.loose_unranked_mods);
  let mut old=serde_json::to_value(&snapshot).unwrap();old.as_object_mut().unwrap().remove("looseUnrankedMods");
  assert!(serde_json::from_value::<crate::collection::Snapshot>(old).unwrap().loose_unranked_mods.is_none());
 }
}

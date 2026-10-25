//! Read-only cached mastery breakdown; never exports account identifiers or payloads.
#![allow(dead_code)]
#[path="../account_mastery.rs"] mod account_mastery;
#[path="../collection.rs"] mod collection;
#[path="../inventory_data.rs"] mod inventory_data;
#[path="../riven_inventory.rs"] mod riven_inventory;
fn main()->Result<(),Box<dyn std::error::Error>>{
 let path=std::path::PathBuf::from(std::env::var_os("LOCALAPPDATA").ok_or("LOCALAPPDATA missing")?).join("AlecaFrame/lastData.dat");
 let raw=inventory_data::read_cache(&path)?;
 let table:serde_json::Value=serde_json::from_str(include_str!("../../../public/mastery-account-sources.json"))?;
 let catalog:serde_json::Value=serde_json::from_str(include_str!("../../../public/catalog.json"))?;
 let mut groups=std::collections::BTreeMap::<String,u64>::new();
 let mut seen=std::collections::BTreeSet::new();let mut duplicates=0;let mut missing=0;let mut low=Vec::new();
 for row in raw["XPInfo"].as_array().ok_or("XPInfo missing")?{
  let id=row["ItemType"].as_str().ok_or("item type missing")?;
  if !seen.insert(id){duplicates+=1;continue;}
  let xp=row["XP"].as_u64().unwrap_or(0);let rule=&table["equipment"][id];
  let (Some(per),Some(cap))=(rule["xpPerRank"].as_u64(),rule["maxRank"].as_u64()) else{if xp>0{missing+=1;}continue;};
  let rank=(0..=cap).take_while(|r|r*r*if per==200{1000}else{500}<=xp).last().unwrap_or(0);
  let item=catalog["items"].as_array().unwrap().iter().find(|i|i["id"]==id);
  let group=item.and_then(|i|i["category"].as_str()).unwrap_or("special");
  *groups.entry(group.into()).or_default()+=rank*per;
  if rank<cap{low.push(serde_json::json!({"item":item.map(|i|i["name"].clone()),"rank":rank,"cap":cap,"remaining":(cap-rank)*per}));}
 }
 let normalized=inventory_data::from_value(&raw,&collection::catalog()?,None,"local-cache-audit","2026-10-23T00:00:00Z")?;
 println!("{}",serde_json::to_string_pretty(&serde_json::json!({"source":"existing local cache, not live acceptance","masteryRank":raw["PlayerLevel"],"groups":groups,"duplicateLedgerRows":duplicates,"unmappedPositiveLedgerRows":missing,"unfinishedLedgerItems":low,"plexusCopies":raw["CrewShipHarnesses"].as_array().map(|v|v.len()),"totalXp":normalized.mastery_account.as_ref().and_then(|a|a.total_xp)}))?);Ok(())
}


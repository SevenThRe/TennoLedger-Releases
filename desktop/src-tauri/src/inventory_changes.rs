use crate::collection::{Catalog,Snapshot};
use serde::{Deserialize,Serialize};
use std::collections::{BTreeMap,BTreeSet};
#[derive(Clone,Default,Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
pub struct Change {pub quantity:u64,pub first_seen:String,pub last_seen:String,pub arcane_copies:bool,
 #[serde(default)]pub rank_quantities:Option<BTreeMap<u32,u64>>,
}
#[derive(Clone,Default,Serialize,Deserialize)]
#[serde(default,rename_all="camelCase")]
pub struct Changes {
 pub revision:u64,pub captured_at:Option<String>,pub baseline:Option<BTreeMap<String,u64>>,
 #[serde(default)]pub unknown:BTreeSet<String>,pub pending:BTreeMap<String,Change>,
 #[serde(default)]pub baseline_ranks:Option<BTreeMap<String,Option<BTreeMap<u32,u64>>>>,
}
pub const HARROW_CHASSIS:&str="/Lotus/Types/Recipes/WarframeRecipes/PriestChassisBlueprint";
fn rank_total(ranks:&BTreeMap<u32,u64>,arcane:bool)->Result<u64,String>{
 let mut total=0u64;for (&rank,&quantity) in ranks{if rank>100{return Err("增量等级无效".into());}let factor=if arcane{(u64::from(rank)+1)*(u64::from(rank)+2)/2}else{1};total=total.checked_add(quantity.checked_mul(factor).ok_or("增量数量溢出")?).ok_or("增量数量溢出")?;}Ok(total)
}
impl Changes {
 fn rank_gains(&self,snapshot:&Snapshot,id:&str,added:u64,arcane:bool)->Result<Option<BTreeMap<u32,u64>>,String>{
  let (Some(old),Some(now))=(&self.baseline_ranks,&snapshot.upgrade_counts_by_rank)else{return Ok(None)};
  if old.get(id).is_some_and(|r|r.is_none())||now.get(id).is_some_and(|r|r.is_none()){return Ok(None);}
  let empty=BTreeMap::new();let before=old.get(id).and_then(|r|r.as_ref()).unwrap_or(&empty);let after=now.get(id).and_then(|r|r.as_ref()).unwrap_or(&empty);
  // A disappearing rank may be fusion, upgrading, disposal or a trade. Do not
  // assign its replacement to a newly acquired rank without instance evidence.
  if before.iter().any(|(rank,count)|after.get(rank).copied().unwrap_or(0)<*count){return Ok(None);}
  let gains:BTreeMap<_,_>=after.iter().filter_map(|(&rank,&count)|{let gain=count.saturating_sub(before.get(&rank).copied().unwrap_or(0));(gain>0).then_some((rank,gain))}).collect();
  Ok((rank_total(&gains,arcane)?==added).then_some(gains))
 }
 pub fn record(&mut self,snapshot:&Snapshot,catalog:&Catalog)->Result<(),String>{
  if !snapshot.complete||snapshot.account_scope.is_none(){return Ok(());}
  let at=chrono::DateTime::parse_from_rfc3339(&snapshot.captured_at).map_err(|_|"增量快照时间无效")?;
  if self.captured_at.as_ref().and_then(|s|chrono::DateTime::parse_from_rfc3339(s).ok()).is_some_and(|old|at<=old){return Ok(());}
  let categories:BTreeMap<_,_>=catalog.items.iter().map(|i|(i.id.as_str(),i.category.as_str())).collect();
  let mut counts=snapshot.counts.clone();let mut unknown=BTreeSet::new();
  // Equivalent rank-zero arcane copies stay constant through fusion; mod leveling keeps instance counts.
  for item in &catalog.items {if matches!(item.category.as_str(),"mod"|"arcane") {
   match snapshot.upgrade_counts_by_rank.as_ref().and_then(|r|r.get(&item.id)) {
    Some(Some(ranks))=>{counts.insert(item.id.clone(),rank_total(ranks,item.category=="arcane")?);},
    None if snapshot.upgrade_counts_by_rank.is_some()=>{counts.insert(item.id.clone(),0);},
    _=>{counts.remove(&item.id);unknown.insert(item.id.clone());}
   }
  }}
  let tradeables: BTreeMap<String,String>=serde_json::from_str(include_str!("../../public/inventory-tradables.json")).map_err(|e|e.to_string())?;
  if let Some(old)=&self.baseline {for (id,&quantity) in &counts {
   if !tradeables.contains_key(id)&&id!=HARROW_CHASSIS{continue;}
   if self.unknown.contains(id){continue;}
   let added=quantity.saturating_sub(*old.get(id).unwrap_or(&0));if added==0{continue;}
   let arcane=categories.get(id.as_str())==Some(&"arcane");let upgraded=arcane||categories.get(id.as_str())==Some(&"mod");
   let gains=if upgraded{self.rank_gains(snapshot,id,added,arcane)?}else{None};
   let existed=self.pending.contains_key(id);
   let row=self.pending.entry(id.clone()).or_insert_with(||Change{quantity:0,first_seen:snapshot.captured_at.clone(),last_seen:snapshot.captured_at.clone(),arcane_copies:arcane,rank_quantities:gains.clone()});
   if existed {row.rank_quantities=match (&row.rank_quantities,gains){(Some(old),Some(new))=>{let mut all=old.clone();for(rank,count)in new{let entry=all.entry(rank).or_default();*entry=entry.checked_add(count).ok_or("增量等级数量溢出")?;}Some(all)},_=>None};}
   row.quantity=row.quantity.checked_add(added).ok_or("增量数量溢出")?;row.last_seen=snapshot.captured_at.clone();
  }}
  self.baseline=Some(counts);self.baseline_ranks=snapshot.upgrade_counts_by_rank.clone();self.unknown=unknown;self.captured_at=Some(snapshot.captured_at.clone());self.revision=self.revision.checked_add(1).ok_or("增量版本溢出")?;Ok(())
 }
 pub fn acknowledge(&mut self,revision:u64)->Result<(),String>{if revision!=self.revision{return Err("有新的物品记录，请刷新后再标记已读".into());}self.pending.clear();self.revision=self.revision.checked_add(1).ok_or("增量版本溢出")?;Ok(())}
 pub fn reset_baseline(&mut self){self.baseline=None;self.baseline_ranks=None;self.captured_at=None;self.unknown.clear();}
 pub fn validate(&self)->Result<(),String>{if self.captured_at.as_ref().is_some_and(|s|chrono::DateTime::parse_from_rfc3339(s).is_err())||self.baseline.as_ref().is_some_and(|b|b.keys().any(|id|!id.starts_with("/Lotus/")||id.len()>512))||self.unknown.iter().any(|id|!id.starts_with("/Lotus/")||id.len()>512)||self.pending.len()>100_000||self.baseline.as_ref().is_some_and(|b|b.len()>100_000)||self.pending.iter().any(|(id,c)|!id.starts_with("/Lotus/")||id.len()>512||c.quantity==0||chrono::DateTime::parse_from_rfc3339(&c.first_seen).is_err()||chrono::DateTime::parse_from_rfc3339(&c.last_seen).is_err()){return Err("库存增量记录无效".into());}
  if let Some(baseline)=&self.baseline_ranks{if baseline.len()>100000||baseline.iter().any(|(id,ranks)|!id.starts_with("/Lotus/")||id.len()>512||ranks.as_ref().is_some_and(|r|r.len()>101||r.iter().any(|(rank,count)|*rank>100||*count>1_000_000_000))){return Err("库存增量等级基线无效".into());}}
  for row in self.pending.values(){if chrono::DateTime::parse_from_rfc3339(&row.first_seen).map_err(|_|"增量日期无效")?>chrono::DateTime::parse_from_rfc3339(&row.last_seen).map_err(|_|"增量日期无效")?{return Err("增量日期顺序无效".into());}if let Some(ranks)=&row.rank_quantities{if ranks.is_empty()||ranks.len()>101||ranks.values().any(|n|*n==0)||rank_total(ranks,row.arcane_copies)?!=row.quantity{return Err("库存增量等级份数不一致".into());}}}Ok(())}
}
#[cfg(test)]mod tests{
 use super::*;
 fn shot(day:u32,n:u64)->Snapshot{Snapshot{account_scope:Some("acct-v1-".to_owned()+&"a".repeat(64)),complete:true,captured_at:format!("2026-10-{day:02}T00:00:00Z"),counts:BTreeMap::from([("/Lotus/Weapons/Syndicates/PerrinSequence/Pistols/PSDualCestra".into(),n)]),..Default::default()}}
 fn cat()->Catalog{Catalog{items:vec![]}}
 #[test]fn first_sync_decreases_and_replays_never_report_gains(){let mut c=Changes::default();c.record(&shot(1,50),&cat()).unwrap();assert!(c.pending.is_empty());c.record(&shot(2,49),&cat()).unwrap();c.record(&shot(1,100),&cat()).unwrap();assert!(c.pending.is_empty());c.record(&shot(3,51),&cat()).unwrap();assert_eq!(c.pending.values().next().unwrap().quantity,2);}
 #[test]fn ack_cannot_erase_arrivals_after_view_and_survives_restart(){let mut c=Changes::default();c.record(&shot(1,1),&cat()).unwrap();c.record(&shot(2,3),&cat()).unwrap();let viewed=c.revision;c.record(&shot(3,4),&cat()).unwrap();assert!(c.acknowledge(viewed).is_err());let mut restored:Changes=serde_json::from_str(&serde_json::to_string(&c).unwrap()).unwrap();assert_eq!(restored.pending.values().next().unwrap().quantity,3);restored.acknowledge(c.revision).unwrap();restored.record(&shot(4,4),&cat()).unwrap();assert!(restored.pending.is_empty());}
 #[test]fn incomplete_unidentified_and_import_rebaseline_do_not_invent_gains(){let mut c=Changes::default();let mut s=shot(1,3);s.complete=false;c.record(&s,&cat()).unwrap();s.complete=true;s.account_scope=None;c.record(&s,&cat()).unwrap();assert!(c.baseline.is_none());c.record(&shot(1,3),&cat()).unwrap();c.reset_baseline();c.record(&shot(2,99),&cat()).unwrap();assert!(c.pending.is_empty());}
 #[test]fn arcane_fusion_mod_leveling_and_first_new_mod_are_distinct(){
  let mut catalog=cat();let arcane="/Lotus/Upgrades/CosmeticEnhancers/Defensive/HealthRegenOnDamage";let mod_id="/Lotus/Upgrades/Mods/Rifle/WeaponDamageAmountMod";
  for(id,category)in [(arcane,"arcane"),(mod_id,"mod")] {catalog.items.push(crate::collection::Item{id:id.into(),name:id.into(),zh:id.into(),category:category.into(),prime:false,mastery_req:0,max_rank:0,xp_per_rank:0,vaulted:None,recipe:None});}
  let mut c=Changes::default();let mut s=shot(1,1);s.upgrade_counts_by_rank=Some(BTreeMap::from([(arcane.into(),Some(BTreeMap::from([(0,3)])))]));c.record(&s,&catalog).unwrap();
  s.captured_at=shot(2,1).captured_at;s.upgrade_counts_by_rank=Some(BTreeMap::from([(arcane.into(),Some(BTreeMap::from([(1,1)]))),(mod_id.into(),Some(BTreeMap::from([(0,1)])))]));c.record(&s,&catalog).unwrap();assert!(!c.pending.contains_key(arcane));assert_eq!(c.pending[mod_id].quantity,1);c.acknowledge(c.revision).unwrap();
  s.captured_at=shot(3,1).captured_at;s.upgrade_counts_by_rank.as_mut().unwrap().insert(mod_id.into(),Some(BTreeMap::from([(5,1)])));c.record(&s,&catalog).unwrap();assert!(c.pending.is_empty());
  s.captured_at=shot(4,1).captured_at;s.upgrade_counts_by_rank.as_mut().unwrap().insert(arcane.into(),None);c.record(&s,&catalog).unwrap();s.captured_at=shot(5,1).captured_at;s.upgrade_counts_by_rank.as_mut().unwrap().insert(arcane.into(),Some(BTreeMap::from([(5,1)])));c.record(&s,&catalog).unwrap();assert!(c.pending.is_empty(),"unknown rank data cannot establish gains");
 }

}


#[cfg(test)]mod rank_delta_tests{
 use super::*;
 const MOD:&str="/Lotus/Upgrades/Mods/Rifle/WeaponDamageAmountMod";
 const ARC:&str="/Lotus/Upgrades/CosmeticEnhancers/Defensive/HealthRegenOnDamage";
 fn catalog()->Catalog{Catalog{items:[(MOD,"mod"),(ARC,"arcane")].into_iter().map(|(id,category)|crate::collection::Item{id:id.into(),name:id.into(),zh:id.into(),category:category.into(),prime:false,mastery_req:0,max_rank:0,xp_per_rank:0,vaulted:None,recipe:None}).collect()}}
 fn shot(day:u32,mods:&[(u32,u64)],arcanes:&[(u32,u64)])->Snapshot{Snapshot{account_scope:Some("acct-v1-".to_owned()+&"a".repeat(64)),complete:true,captured_at:format!("2026-10-{day:02}T00:00:00Z"),upgrade_counts_by_rank:Some(BTreeMap::from([(MOD.into(),Some(mods.iter().copied().collect())),(ARC.into(),Some(arcanes.iter().copied().collect()))])),..Default::default()}}
 #[test]fn harrow_is_retained_separately_and_legacy_states_do_not_guess_rank(){
  let mut c:Changes=serde_json::from_str("{}").unwrap();c.validate().unwrap();let mut s=shot(1,&[],&[]);s.counts.insert(HARROW_CHASSIS.into(),5);c.record(&s,&catalog()).unwrap();s.captured_at=shot(2,&[],&[]).captured_at;s.counts.insert(HARROW_CHASSIS.into(),8);c.record(&s,&catalog()).unwrap();assert_eq!(c.pending[HARROW_CHASSIS].quantity,3);
  let legacy=serde_json::json!({"revision":2,"baseline":{MOD:0},"capturedAt":"2026-10-01T00:00:00Z","pending":{MOD:{"quantity":1,"firstSeen":"2026-10-01T00:00:00Z","lastSeen":"2026-10-01T00:00:00Z","arcaneCopies":false}}});
  let mut old:Changes=serde_json::from_value(legacy).unwrap();old.validate().unwrap();old.record(&shot(2,&[(10,1)],&[]),&catalog()).unwrap();assert!(old.pending[MOD].rank_quantities.is_none());
 }
 #[test]fn rank_zero_and_max_instances_survive_persistence_with_weighted_arcane_units(){
  let mut c=Changes::default();c.record(&shot(1,&[],&[]),&catalog()).unwrap();c.record(&shot(2,&[(0,2),(10,1)],&[(5,1)]),&catalog()).unwrap();
  assert_eq!(c.pending[MOD].quantity,3);assert_eq!(c.pending[MOD].rank_quantities.as_ref().unwrap()[&10],1);
  assert_eq!(c.pending[ARC].quantity,21);assert_eq!(c.pending[ARC].rank_quantities.as_ref().unwrap()[&5],1);
  c.validate().unwrap();let restored:Changes=serde_json::from_str(&serde_json::to_string(&c).unwrap()).unwrap();restored.validate().unwrap();assert_eq!(restored.pending[ARC].rank_quantities.as_ref().unwrap()[&5],1);
 }
 #[test]fn mixed_fusion_or_upgrade_with_new_copies_does_not_assign_a_false_rank(){
  let mut c=Changes::default();c.record(&shot(1,&[(0,2)],&[(0,3)]),&catalog()).unwrap();c.record(&shot(2,&[(5,2),(0,1)],&[(1,1),(0,1)]),&catalog()).unwrap();
  assert_eq!(c.pending[MOD].quantity,1);assert!(c.pending[MOD].rank_quantities.is_none());assert_eq!(c.pending[ARC].quantity,1);assert!(c.pending[ARC].rank_quantities.is_none());
  c.acknowledge(c.revision).unwrap();c.record(&shot(3,&[(5,3),(0,1)],&[(1,2),(0,1)]),&catalog()).unwrap();assert_eq!(c.pending[MOD].rank_quantities.as_ref().unwrap()[&5],1);assert_eq!(c.pending[ARC].rank_quantities.as_ref().unwrap()[&1],1);
 }
 #[test]fn rank_validation_checks_overflow_keys_and_equivalent_quantity(){
  let mut c=Changes::default();c.record(&shot(1,&[],&[]),&catalog()).unwrap();c.record(&shot(2,&[],&[(5,1)]),&catalog()).unwrap();
  c.pending.get_mut(ARC).unwrap().rank_quantities=Some(BTreeMap::from([(5,21)]));assert!(c.validate().is_err());
  c.pending.get_mut(ARC).unwrap().rank_quantities=Some(BTreeMap::from([(101,1)]));assert!(c.validate().is_err());
  c.pending.get_mut(ARC).unwrap().rank_quantities=Some(BTreeMap::from([(100,u64::MAX)]));assert!(c.validate().is_err());
  c.pending.get_mut(ARC).unwrap().rank_quantities=Some(BTreeMap::from([(5,0)]));assert!(c.validate().is_err());
  let mut fresh=Changes::default();assert!(fresh.record(&shot(1,&[],&[(u32::MAX,1)]),&catalog()).is_err());assert!(fresh.record(&shot(1,&[],&[(100,u64::MAX)]),&catalog()).is_err());
 }
}


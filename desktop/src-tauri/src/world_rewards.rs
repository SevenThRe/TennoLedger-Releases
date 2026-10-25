use super::{date,iso,nodes,reward_name,faction,mission};
use serde::{Serialize,Deserialize};
use serde_json::Value;
use std::collections::{BTreeMap,BTreeSet};
#[derive(Clone,Debug,Serialize,Deserialize)]
#[serde(rename_all="camelCase",default)]
pub struct Preferences{pub enabled:bool,pub catalyst:bool,pub reactor:bool,pub exilus:bool,pub weapon_parts:Vec<String>}
impl Default for Preferences{fn default()->Self{Self{enabled:false,catalyst:true,reactor:true,exilus:true,weapon_parts:vec![]}}}
#[derive(Clone,Debug,Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
pub struct Reward{pub id:String,pub name:String,pub quantity:u64,pub category:String}
#[derive(Clone,Debug,Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
pub struct RewardMission{pub id:String,pub kind:String,pub node_id:String,pub node:String,pub planet:String,pub mission_type:String,pub activation:String,pub expiry:Option<String>,pub side:Option<String>,pub faction:String,pub progress_percent:Option<f64>,pub required_completions:Option<u32>,pub event_target:Option<u64>,pub rewards:Vec<Reward>}
pub fn category(id:&str)->&'static str{
 let tail=id.rsplit('/').next().unwrap_or("").trim_end_matches("Blueprint");
 if !id.starts_with("/Lotus/Types/Items/MiscItems/")&&!id.starts_with("/Lotus/Types/Recipes/Components/"){return if id.starts_with("/Lotus/Types/Recipes/Weapons/"){"weapon"}else{"other"};}
 match tail{"OrokinCatalyst"=>"catalyst","OrokinReactor"=>"reactor","UtilityUnlocker"|"WeaponUtilityUnlocker"=>"exilus",_ if id.starts_with("/Lotus/Types/Recipes/Weapons/")=>"weapon",_=>"other"}
}
pub fn selected(reward:&Reward,p:&Preferences)->bool{p.enabled&&match reward.category.as_str(){"catalyst"=>p.catalyst,"reactor"=>p.reactor,"exilus"=>p.exilus,"weapon"=>p.weapon_parts.contains(&reward.id),_=>false}}
fn items(raw:&Value)->Vec<Reward>{
 let mut quantities=BTreeMap::new();
 for field in ["items","Items"]{for item in raw[field].as_array().into_iter().flatten(){if let Some(id)=item.as_str(){quantities.insert(id.replace("/Lotus/StoreItems/","/Lotus/"),1u64);}}}
 for field in ["countedItems","CountedItems"]{for item in raw[field].as_array().into_iter().flatten(){if let (Some(id),Some(quantity))=(item["ItemType"].as_str(),item["ItemCount"].as_u64().or_else(||item["ItemCount"].as_str()?.parse().ok()).filter(|q|*q>0&&*q<=1_000_000_000)){quantities.insert(id.replace("/Lotus/StoreItems/","/Lotus/"),quantity);}}}
 if let Some(credits)=raw["credits"].as_u64().filter(|n|*n>0){quantities.insert("@credits".into(),credits);}
 quantities.into_iter().filter(|(id,_)|id=="@credits"||id.starts_with("/Lotus/")&&id.len()<=512).map(|(id,quantity)|Reward{name:if id=="@credits"{"现金".into()}else{reward_name(&id)},category:category(&id).into(),id,quantity}).collect()
}
pub fn parse(raw:&Value,now:i64)->Vec<RewardMission>{
 let nodes=nodes();let mut rows=vec![];
 let mut add=|id:String,kind:&str,node_id:&str,mission_type:&str,activation:i64,expiry:Option<i64>,side:Option<&str>,faction_name:String,progress:Option<f64>,required:Option<u32>,target:Option<u64>,reward:&Value|{
  let rewards=items(reward);if rewards.is_empty(){return;}
  let node=&nodes.get(node_id).cloned().unwrap_or(Value::Null);
  let location=node["zh"].as_str().or_else(||node["name"].as_str()).unwrap_or(node_id);
  rows.push(RewardMission{id,kind:kind.into(),node_id:node_id.into(),node:location.into(),planet:node["planet"].as_str().unwrap_or("").into(),mission_type:mission_type.into(),activation:iso(activation),expiry:expiry.map(iso),side:side.map(str::to_owned),faction:faction_name,progress_percent:progress,required_completions:required,event_target:target,rewards});
 };
 for invasion in raw["Invasions"].as_array().into_iter().flatten(){
  if invasion["Completed"].as_bool()==Some(true){continue;}
  let (Some(id),Some(start))=(invasion["_id"]["$oid"].as_str(),date(&invasion["Activation"]))else{continue;};if start>now{continue;}
  let goal=invasion["Goal"].as_f64().filter(|g|*g>0.0);
  let infestation=invasion["DefenderMissionInfo"]["faction"].as_str().or_else(||invasion["Faction"].as_str())==Some("FC_INFESTATION");
  let factor=if infestation{100.0}else{50.0};
  let progress=goal.zip(invasion["Count"].as_f64()).map(|(g,n)|(factor*(1.0+n/g)).clamp(0.0,100.0));
  for (side,reward,fac) in [("attacker","AttackerReward","Faction"),("defender","DefenderReward","DefenderFaction")]{
   let pct=progress.map(|p|if side=="attacker"{p}else{100.0-p});
   add(format!("invasion:{id}:{start}:{side}"),"invasion",invasion["Node"].as_str().unwrap_or(""),"",start,None,Some(side),faction(invasion[fac].as_str().unwrap_or("")),pct,Some(3),None,&invasion[reward]);
  }
 }
 for alert in raw["Alerts"].as_array().into_iter().flatten(){
  let (Some(id),Some(start),Some(end))=(alert["_id"]["$oid"].as_str(),date(&alert["Activation"]),date(&alert["Expiry"]))else{continue;};if start>now||end<=now{continue;}
  let info=&alert["MissionInfo"];add(format!("alert:{id}:{start}"),"alert",info["location"].as_str().unwrap_or(""),&mission(info["missionType"].as_str().unwrap_or("")),start,Some(end),None,faction(info["faction"].as_str().unwrap_or("")),None,None,None,&info["missionReward"]);
 }
 for event in raw["Goals"].as_array().into_iter().flatten(){
  let (Some(id),Some(start),Some(end))=(event["_id"]["$oid"].as_str(),date(&event["Activation"]),date(&event["Expiry"]))else{continue;};if start>now||end<=now{continue;}
  let node=event["Node"].as_str().unwrap_or("");add(format!("event:{id}:{start}:final"),"event",node,"",start,Some(end),None,String::new(),None,None,event["Goal"].as_u64(),&event["Reward"]);
  for (index,reward) in event["InterimRewards"].as_array().into_iter().flatten().enumerate(){add(format!("event:{id}:{start}:stage:{index}"),"event",node,"",start,Some(end),None,String::new(),None,None,event["InterimGoals"][index].as_u64(),reward);}
 }
 let mut seen=BTreeSet::new();rows.retain(|row|seen.insert(row.id.clone()));rows.sort_by(|a,b|a.expiry.cmp(&b.expiry).then_with(||a.id.cmp(&b.id)));rows
}

#[cfg(test)]mod tests{
 use super::*;use serde_json::json;
 fn date(seconds:i64)->Value{json!({"$date":{"$numberLong":(seconds*1000).to_string()}})}
 fn invasion()->Value{json!({"_id":{"$oid":"test-invasion"},"Activation":date(900),"Node":"SolNode25","Completed":false,"Count":-50,"Goal":100,"Faction":"FC_CORPUS","DefenderFaction":"FC_GRINEER","AttackerReward":{"countedItems":[{"ItemType":"/Lotus/Types/Recipes/Components/OrokinCatalystBlueprint","ItemCount":1}]},"DefenderReward":{"items":["/Lotus/Types/Items/MiscItems/OrokinReactor"]}})}
 #[test]fn invasions_keep_both_sides_signed_control_and_unknown_end(){let raw=json!({"Invasions":[invasion()]});let rows=parse(&raw,1000);assert_eq!(rows.len(),2);let a=rows.iter().find(|r|r.side.as_deref()==Some("attacker")).unwrap();let d=rows.iter().find(|r|r.side.as_deref()==Some("defender")).unwrap();assert_eq!(a.progress_percent,Some(25.0));assert_eq!(d.progress_percent,Some(75.0));assert_eq!(a.required_completions,Some(3));assert!(a.expiry.is_none());assert_ne!(a.id,d.id);assert_eq!(a.rewards[0].category,"catalyst");assert_eq!(d.rewards[0].category,"reactor");}
 #[test]fn completed_future_and_expired_sources_do_not_leak_into_current_rows(){let mut complete=invasion();complete["Completed"]=true.into();let mut future=invasion();future["Activation"]=date(1100);assert!(parse(&json!({"Invasions":[complete,future]}),1000).is_empty());let event=json!({"_id":{"$oid":"expired"},"Activation":date(900),"Expiry":date(1000),"Reward":{"items":["/Lotus/Types/Items/MiscItems/OrokinReactor"]}});assert!(parse(&json!({"Goals":[event]}),1000).is_empty());}
 #[test]fn events_keep_final_and_interim_stages_normalize_store_ids_and_counts(){let reward=json!({"items":["/Lotus/StoreItems/Types/Items/MiscItems/OrokinReactor"],"countedItems":[{"ItemType":"/Lotus/StoreItems/Types/Items/MiscItems/OrokinReactor","ItemCount":3}]});let event=json!({"_id":{"$oid":"goal"},"Activation":date(900),"Expiry":date(1100),"Node":"EventNode1","Goal":100,"Reward":reward,"InterimRewards":[reward],"InterimGoals":[10]});let rows=parse(&json!({"Goals":[event]}),1000);assert_eq!(rows.len(),2);assert_ne!(rows[0].id,rows[1].id);assert!(rows.iter().any(|r|r.event_target==Some(10)));assert!(rows.iter().any(|r|r.event_target==Some(100)));for row in rows{assert_eq!(row.rewards.len(),1);assert_eq!(row.rewards[0].quantity,3);assert_eq!(row.rewards[0].id,"/Lotus/Types/Items/MiscItems/OrokinReactor");}}
 #[test]fn preferences_never_treat_similar_filename_as_a_special_reward(){assert_eq!(category("/Lotus/Unknown/OrokinCatalyst"),"other");let mut p=Preferences::default();let item=Reward{id:"/Lotus/Types/Recipes/Weapons/Part".into(),name:"Part".into(),quantity:1,category:"weapon".into()};assert!(!selected(&item,&p));p.enabled=true;p.weapon_parts.push(item.id.clone());assert!(selected(&item,&p));p.enabled=false;assert!(!selected(&item,&p));}
 #[test]fn retained_public_snapshot_keeps_invasion_sides_and_goal_rewards(){let raw:Value=serde_json::from_str(include_str!("../../tests/fixtures/world-api.json")).unwrap();let rows=parse(&raw,raw["Time"].as_i64().unwrap());assert!(rows.iter().any(|r|r.kind=="invasion"&&r.side.as_deref()==Some("attacker")));assert!(rows.iter().any(|r|r.kind=="invasion"&&r.side.as_deref()==Some("defender")));assert!(rows.iter().any(|r|r.kind=="event"));}
 #[test]fn infestation_starts_at_full_attacker_control_instead_of_half(){let mut invasion=invasion();invasion["Faction"]=json!("FC_INFESTATION");invasion["DefenderMissionInfo"]=json!({"faction":"FC_INFESTATION"});invasion["Count"]=json!(-50);let rows=parse(&json!({"Invasions":[invasion]}),1000);assert!(rows.iter().all(|r|r.progress_percent==Some(50.0)));}

}

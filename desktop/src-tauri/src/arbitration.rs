use serde::{Deserialize,Serialize};
use super::{Event,Notice};

#[derive(Clone,Debug,Default,Serialize,Deserialize)]
#[serde(rename_all="camelCase",default)]
pub struct Filter {pub mission_types:Vec<String>,pub planets:Vec<String>,pub node_ids:Vec<String>,pub factions:Vec<String>,pub tiers:Vec<String>,pub favorites_only:bool}
#[derive(Clone,Debug,Default,Serialize,Deserialize)]
#[serde(rename_all="camelCase",default)]
pub struct LegacyMatch {pub tiers:Vec<String>,pub node_ids:Vec<String>}
#[derive(Clone,Debug,Serialize,Deserialize)]
#[serde(rename_all="camelCase",default)]
pub struct Preferences {pub show_in_events:bool,pub favorite_node_ids:Vec<String>,pub match_preferences_configured:bool,pub lead_minutes:u32,pub notify_on_start:bool,pub alert_filter:Filter,pub reminder_ids:Vec<String>,pub legacy_match:Option<LegacyMatch>}
impl Default for Preferences {fn default()->Self{Self{show_in_events:true,favorite_node_ids:vec![],match_preferences_configured:false,lead_minutes:10,notify_on_start:true,alert_filter:Filter::default(),reminder_ids:vec![],legacy_match:None}}}
fn includes(values:&[String],value:&str)->bool{values.is_empty()||values.iter().any(|v|v==value)}
pub fn matches(e:&Event,p:&Preferences)->bool{if let Some(legacy)=&p.legacy_match{return legacy.tiers.iter().any(|t|Some(t.as_str())==e.rating.as_deref())||legacy.node_ids.contains(&e.node_id);}let f=&p.alert_filter;includes(&f.mission_types,&e.mission_type)&&includes(&f.planets,&e.planet)&&includes(&f.node_ids,&e.node_id)&&includes(&f.factions,&e.faction)&&includes(&f.tiers,e.rating.as_deref().unwrap_or("Unrated"))&&(!f.favorites_only||p.favorite_node_ids.contains(&e.node_id))}
pub fn validate(p:&Preferences,nodes:&std::collections::BTreeMap<String,serde_json::Value>)->Result<(),String>{
 if ![0,5,10,15,30,60].contains(&p.lead_minutes){return Err("仲裁提前提醒时间无效".into());}
 let f=&p.alert_filter;
 if let Some(legacy)=&p.legacy_match {if legacy.tiers.len()>6||legacy.node_ids.len()>100||legacy.tiers.iter().any(|t|!["S","A","B","C","D","F"].contains(&t.as_str()))||legacy.node_ids.iter().any(|id|!nodes.contains_key(id)){return Err("旧版仲裁偏好无效".into());}}
 for list in [&p.favorite_node_ids,&p.reminder_ids,&f.mission_types,&f.planets,&f.node_ids,&f.factions,&f.tiers] {
  if list.len()>200||list.iter().any(|v|v.is_empty()||v.len()>256||v.chars().any(char::is_control))||list.iter().collect::<std::collections::BTreeSet<_>>().len()!=list.len(){return Err("仲裁偏好无效或过多".into());}
 }
 if p.favorite_node_ids.iter().chain(&f.node_ids).any(|id|!nodes.contains_key(id))||f.tiers.iter().any(|t|!["S","A","B","C","D","F","Unrated"].contains(&t.as_str())) {return Err("仲裁节点或等级无效".into());}
 for (values,field) in [(&f.mission_types,"missionType"),(&f.planets,"planet"),(&f.factions,"faction")] {if values.iter().any(|v|!nodes.values().any(|n|n[field].as_str()==Some(v))){return Err("仲裁筛选条件无效".into());}}
 for id in &p.reminder_ids {
  let parts:Vec<_>=id.split(':').collect();
  if parts.len()!=3||parts[0]!="arbitration"||parts[1].parse::<i64>().ok().is_none_or(|t|!(946684800..=4102444800).contains(&t))||!nodes.contains_key(parts[2]) {return Err("仲裁轮次提醒无效".into());}
 }
 Ok(())
}
pub fn due(events:&[Event],p:&Preferences,enabled:bool,now:i64)->Vec<Notice>{
 events.iter().filter_map(|e|{
  let start=chrono::DateTime::parse_from_rfc3339(&e.activation).ok()?.timestamp();
  let at_start=now>=start&&now<start+300;
  let advance=p.lead_minutes>0&&now<start&&now>=start-i64::from(p.lead_minutes)*60;
  if !at_start&&!advance{return None;}
  let single=p.reminder_ids.contains(&e.id);
  if !single&&!(enabled&&matches(e,p)&&(advance||p.notify_on_start||p.lead_minutes==0)){return None;}
  Some(Notice{id:format!("{}:{}",e.id,if at_start{"start"}else{"advance"}),title:if at_start{"仲裁开始提醒"}else{"仲裁提前提醒"}.into(),body:format!("{} · {} · {}{}（社区预测）",e.node,e.mission_type,e.rating.as_deref().unwrap_or("未评级"),if advance{format!(" · {} 分钟后开始",(start-now+59)/60)}else{String::new()}),created_at:super::iso(now),kind:"arbitration".into(),delivery_error:None,system_state:None})
 }).collect()
}

//! Anonymous, bounded read-only access to the source used by the reference
//! weapon-family history chart. No account token or original app identity.
use serde_json::{json,Value};
use std::{collections::HashMap,sync::{Mutex,OnceLock},time::{Duration,Instant}};
type Cache=HashMap<String,(Instant,Value)>;
static CACHE:OnceLock<Mutex<Cache>>=OnceLock::new();
static LIST_CACHE:OnceLock<Mutex<Cache>>=OnceLock::new();
static SIMILAR_CACHE:OnceLock<Mutex<Cache>>=OnceLock::new();
fn minimum_price(value:&Value)->Option<u64>{let number=value.as_u64().or_else(||value.as_str()?.parse().ok())?;(number>0&&number<=10_000_000).then_some(number)}
fn slug(value:&str)->Result<(),String>{
    if value.is_empty()||value.len()>100||!value.bytes().all(|b|b.is_ascii_lowercase()||b.is_ascii_digit()||b==b'_'){return Err("武器市场标识无效".into());}Ok(())
}
#[tauri::command]
pub async fn riven_history(weapon_slug:String)->Result<Value,String>{
    slug(&weapon_slug)?;
    tauri::async_runtime::spawn_blocking(move||{
        let mut cache=CACHE.get_or_init(||Mutex::new(HashMap::new())).lock().map_err(|_|"历史行情队列锁错误")?;
        if let Some((at,value))=cache.get(&weapon_slug){if at.elapsed()<Duration::from_secs(900){return Ok(value.clone());}}
        let client=reqwest::blocking::Client::builder().timeout(Duration::from_secs(20)).redirect(reqwest::redirect::Policy::none()).user_agent("MyFrame/0.1.0 public-history-reader").build().map_err(|_|"历史行情客户端不可用")?;
        let response=client.get("https://api.alecaframe.com/rivens/rivenWeaponHistory").query(&[("weaponURLname",weapon_slug.as_str())]).send().map_err(|_|"历史来源连接失败或超时")?;
        if !response.status().is_success(){return Err(format!("历史来源 HTTP {}；未读取任何账户凭据",response.status().as_u16()));}
        if response.content_length().is_some_and(|n|n>4*1024*1024){return Err("历史来源响应过大".into());}
        use std::io::Read;
        let mut bytes=Vec::new();response.take(4*1024*1024+1).read_to_end(&mut bytes).map_err(|_|"历史来源读取失败")?;
        if bytes.len()>4*1024*1024{return Err("历史来源响应过大".into());}
        let data:Value=serde_json::from_slice(&bytes).map_err(|_|"历史来源不是有效 JSON")?;
        if !data.as_array().is_some_and(|v|v.len()<=20000){return Err("历史来源数据结构已变化".into());}
        // This independent endpoint has no publication timestamp. Its reading
        // time must never be inserted as a new point in the historical chart.
        let minimum=client.get("https://api.alecaframe.com/rivens/rivenMinimumPrice").query(&[("weaponURLname",weapon_slug.as_str())]).send().map_err(|e|e.to_string()).and_then(|response|{
            if !response.status().is_success(){return Err(format!("HTTP {}",response.status().as_u16()));}
            let mut bytes=Vec::new();response.take(4097).read_to_end(&mut bytes).map_err(|e|e.to_string())?;
            if bytes.len()>4096{return Err("响应过大".into());}
            let value:Value=serde_json::from_slice(&bytes).map_err(|e|e.to_string())?;
            minimum_price(&value).ok_or_else(||"最低价格式无效或暂无报价".to_owned())
        });
        let minimum_at=chrono::Utc::now().to_rfc3339();
        let value=json!({"data":data,"fetchedAt":chrono::Utc::now().to_rfc3339(),"source":"AlecaFrame public weapon-family history","sourceUrl":"https://api.alecaframe.com/rivens/rivenWeaponHistory","weaponSlug":weapon_slug,"minimumPrice":minimum.as_ref().ok(),"minimumFetchedAt":minimum_at,"minimumError":minimum.err(),"minimumSourceTimestamp":null});
        if cache.len()>=100{cache.clear();}cache.insert(weapon_slug,(Instant::now(),value.clone()));Ok(value)
    }).await.map_err(|_|"历史行情任务失败".to_owned())?
}

const SIMILAR_TAGS:&[&str]=&["WeaponAmmoMaxMod","WeaponDamageAmountMod","WeaponMeleeDamageMod","WeaponFreezeDamageMod","WeaponCritChanceMod","WeaponCritDamageMod","WeaponFactionDamageCorpus","WeaponMeleeFactionDamageCorpus","WeaponFactionDamageGrineer","WeaponMeleeFactionDamageGrineer","WeaponFactionDamageInfested","WeaponMeleeFactionDamageInfested","WeaponElectricityDamageMod","WeaponMeleeFinisherDamageMod","WeaponFireRateMod","WeaponFireDamageMod","WeaponImpactDamageMod","WeaponClipMaxMod","WeaponFireIterationsMod","WeaponProjectileSpeedMod","WeaponPunctureDepthMod","WeaponArmorPiercingDamageMod","WeaponMeleeRangeIncMod","WeaponRecoilReductionMod","WeaponReloadSpeedMod","WeaponSlashDamageMod","WeaponStunChanceMod","WeaponProcTimeMod","WeaponToxinDamageMod","WeaponZoomFovMod","ComboDurationMod","SlideAttackCritChanceMod"];
fn similar_request(weapon:&str,attrs:&Value,filters:&Value)->Result<Value,String>{
    slug(weapon)?;
    let list=attrs.as_array().filter(|a|a.len()<=4).ok_or("最多选择4个已核实词条")?;
    let mut seen=std::collections::HashSet::new();
    for item in list{let name=item["name"].as_str().ok_or("词条标识无效")?;if !SIMILAR_TAGS.contains(&name)||!seen.insert(name)||!item["positive"].is_boolean()||!item["required"].is_boolean()||item.as_object().is_none_or(|o|o.len()!=3){return Err("词条合同未核实".into());}}
    let object=filters.as_object().ok_or("筛选合同无效")?;
    let keys=["minPrice","maxPrice","minSimilarity","minRerolls","maxRerolls","negativeRequired"];
    if object.len()!=keys.len()||keys.iter().any(|key|!object.contains_key(*key)){return Err("筛选字段未核实".into());}
    for key in &keys[..5]{if !filters[*key].as_u64().is_some_and(|n|n<=if *key=="minSimilarity"{100}else{10_000_000}){return Err("筛选范围无效".into());}}
    if !filters["negativeRequired"].is_boolean()||filters["minPrice"].as_u64()>filters["maxPrice"].as_u64()||filters["minRerolls"].as_u64()>filters["maxRerolls"].as_u64(){return Err("筛选范围无效".into());}
    Ok(json!({"weaponURLName":weapon,"source":6,"attrs":attrs,"filters":filters}))
}
#[tauri::command]
pub async fn riven_similar(weapon_slug:String,attrs:Value,filters:Value)->Result<Value,String>{
    let body=similar_request(&weapon_slug,&attrs,&filters)?;
    tauri::async_runtime::spawn_blocking(move||{
        let key=body.to_string();let mut cache=SIMILAR_CACHE.get_or_init(||Mutex::new(HashMap::new())).lock().map_err(|_|"合并来源队列锁错误")?;
        if let Some((at,value))=cache.get(&key){if at.elapsed()<Duration::from_secs(120){return Ok(value.clone());}}
        let client=reqwest::blocking::Client::builder().timeout(Duration::from_secs(20)).redirect(reqwest::redirect::Policy::none()).user_agent("MyFrame/0.1.0 public-similarity-reader").build().map_err(|_|"合并来源客户端不可用")?;
        let response=client.post("https://api.alecaframe.com/rivens/similarRivens").json(&body).send().map_err(|_|"AlecaFrame公开合并来源连接失败")?;
        if !response.status().is_success(){return Err(format!("AlecaFrame公开合并来源 HTTP {}",response.status().as_u16()));}
        use std::io::Read;let mut bytes=Vec::new();response.take(4*1024*1024+1).read_to_end(&mut bytes).map_err(|_|"合并来源读取失败")?;if bytes.len()>4*1024*1024{return Err("合并来源响应过大".into());}
        let data:Value=serde_json::from_slice(&bytes).map_err(|_|"合并来源不是JSON")?;
        if !data["similarRivens"].as_array().is_some_and(|rows|rows.len()<=1000){return Err("合并来源合同变化".into());}
        let value=json!({"data":data["similarRivens"],"fetchedAt":chrono::Utc::now().to_rfc3339(),"weaponSlug":weapon_slug,"platform":"pc","source":"AlecaFrame public merged WFM + Riven.market","sourceUrl":"https://api.alecaframe.com/rivens/similarRivens"});
        if cache.len()>=100{cache.clear();}cache.insert(key,(Instant::now(),value.clone()));Ok(value)
    }).await.map_err(|_|"合并来源任务失败".to_owned())?
}
#[cfg(test)]mod tests{
    #[test]fn history_accepts_only_market_weapon_slugs(){for value in ["torid","rubico_prime"]{assert!(super::slug(value).is_ok());}for value in ["","../token","Torid","x?token=a","https://example.com"]{assert!(super::slug(value).is_err());}}
    #[test]fn minimum_accepts_the_actual_numeric_string_and_rejects_unknown(){use serde_json::json;assert_eq!(super::minimum_price(&json!("200")),Some(200));assert_eq!(super::minimum_price(&json!(200)),Some(200));for value in [json!(null),json!(0),json!(-1),json!(""),json!("NaN"),json!({"price":200}),json!(10000001)]{assert_eq!(super::minimum_price(&value),None);}}
    #[test]fn similarity_uses_original_tags_and_fixed_public_source_without_credentials(){use serde_json::json;let attrs=json!([{"name":"WeaponCritChanceMod","positive":true,"required":true},{"name":"WeaponZoomFovMod","positive":false,"required":true}]);let filters=json!({"minPrice":0,"maxPrice":10000000,"minSimilarity":0,"minRerolls":0,"maxRerolls":10000000,"negativeRequired":true});let body=super::similar_request("torid",&attrs,&filters).unwrap();assert_eq!(body["source"],6);assert_eq!(body["weaponURLName"],"torid");assert!(body.get("token").is_none());assert!(super::similar_request("torid",&json!([{"name":"critical_chance","positive":true,"required":true}]),&filters).is_err());let mut extra=filters.clone();extra["token"]=json!("never send");assert!(super::similar_request("torid",&attrs,&extra).is_err());extra=filters.clone();extra["minPrice"]=json!(10000001);assert!(super::similar_request("torid",&attrs,&extra).is_err());assert!(super::similar_request("torid",&json!([]),&filters).is_ok());}
}

fn attribute(input:&str,key:&str)->Option<String>{
    let marker=format!("data-{key}=\"");let rest=input.split_once(&marker)?.1;
    Some(rest.split('"').next()?.replace("&quot;","\"").replace("&#039;","'").replace("&gt;",">").replace("&lt;","<").replace("&amp;","&"))
}
fn parse_list(input:&str,weapon:&str,platform:&str)->Result<Vec<Value>,String>{
    let mut rows=Vec::new();
    for section in input.split("id=\"riven_").skip(1).take(25){
        let id=section.split('"').next().unwrap_or("");if id.is_empty()||!id.bytes().all(|b|b.is_ascii_digit()){continue;}
        let number=|key:&str|attribute(section,key).and_then(|v|v.parse::<u64>().ok());
        let Some(price)=number("price").filter(|n|*n>0) else{continue};
        let Some(rank)=number("rank").filter(|n|*n<=8) else{continue};
        let Some(mastery)=number("mr").filter(|n|*n<=100) else{continue};
        let Some(rerolls)=number("rerolls") else{continue};
        let Some(name)=attribute(section,"name") else{continue};
        let Some(found_weapon)=attribute(section,"weapon") else{continue};
        if !found_weapon.eq_ignore_ascii_case(weapon){continue;}
        let mut attributes=Vec::new();for index in 1..=4{
            let code=attribute(section,&format!("stat{index}"));let value=attribute(section,&format!("stat{index}val")).and_then(|v|v.parse::<f64>().ok());
            if let (Some(code),Some(value))=(code,value){if !code.is_empty()&&value.is_finite(){attributes.push(json!({"code":code,"value":value,"positive":index!=4}));}}
        }
        if attributes.is_empty(){continue;}
        let mut link=reqwest::Url::parse("https://riven.market/").map_err(|_|"来源链接无效")?;
        link.path_segments_mut().map_err(|_|"来源链接无效")?.extend(["list",platform,weapon]);link.set_fragment(Some(&format!("riven_{id}")));
        rows.push(json!({"id":id,"weapon":found_weapon,"name":name,"price":price,"rank":rank,"masteryLevel":mastery,"rerolls":rerolls,"polarity":attribute(section,"polarity"),"attributes":attributes,"source":"riven.market","link":link.as_str(),"age":attribute(section,"age")}));
    }
    if rows.is_empty(){
        let matching_entries=input.split("id=\"riven_").skip(1).any(|section|attribute(section,"weapon").is_some_and(|name|name.eq_ignore_ascii_case(weapon)));
        if matching_entries||!input.contains("riven-list")&&!input.to_lowercase().contains("no rivens"){return Err("Riven.market 页面结构变化或挂牌字段不完整，未生成推测挂牌".into());}
    }Ok(rows)
}
#[tauri::command]
pub async fn riven_market_list(weapon_name:String,platform:String,page:u32)->Result<Value,String>{
    if weapon_name.trim().is_empty()||weapon_name.len()>100||!weapon_name.chars().all(|c|c.is_ascii_alphanumeric()||" '&-().".contains(c))||page<1||page>100{return Err("来源武器名称或页码无效".into());}
    let platform=match platform.as_str(){"pc"=>"PC","ps4"=>"PS4","xbox"=>"XB1","switch"=>"NSW",_=>return Err("来源平台无效".into())};
    tauri::async_runtime::spawn_blocking(move||{
        let key=format!("riven-market:{platform}:{weapon_name}:{page}");let mut cache=LIST_CACHE.get_or_init(||Mutex::new(HashMap::new())).lock().map_err(|_|"来源队列锁错误")?;
        if let Some((at,value))=cache.get(&key){if at.elapsed()<Duration::from_secs(120){return Ok(value.clone());}}
        let client=reqwest::blocking::Client::builder().timeout(Duration::from_secs(20)).redirect(reqwest::redirect::Policy::none()).user_agent("MyFrame/0.1.0 public-list-reader").build().map_err(|_|"来源客户端不可用")?;
        let page_text=page.to_string();let query=[("baseurl","Lw=="),("platform",platform),("limit","25"),("recency","-1"),("veiled","false"),("onlinefirst","true"),("polarity","all"),("rank","all"),("mastery","16"),("weapon",weapon_name.as_str()),("stats","Any"),("neg","all"),("price","99999"),("rerolls","-1"),("sort","price"),("direction","ASC"),("page",page_text.as_str())];
        let response=client.get("https://riven.market/_modules/riven/showrivens.php").query(&query).send().map_err(|_|"Riven.market 连接失败或超时")?;
        if !response.status().is_success(){return Err(format!("Riven.market HTTP {}",response.status().as_u16()));}
        use std::io::Read;let mut bytes=Vec::new();response.take(2*1024*1024+1).read_to_end(&mut bytes).map_err(|_|"来源读取失败")?;if bytes.len()>2*1024*1024{return Err("来源响应过大".into());}
        let html=String::from_utf8(bytes).map_err(|_|"来源文字编码无效")?;let rows=parse_list(&html,&weapon_name,platform)?;
        let has_more=html.split("id=\"riven_").count().saturating_sub(1)>=25;
        let value=json!({"data":rows,"fetchedAt":chrono::Utc::now().to_rfc3339(),"source":"riven.market public listing page","page":page,"coverage":"page","limit":25,"hasMore":has_more});
        if cache.len()>100{cache.clear();}cache.insert(key,(Instant::now(),value.clone()));Ok(value)
    }).await.map_err(|_|"来源读取任务失败".to_owned())?
}
#[cfg(test)]mod list_tests{
    #[test]fn parses_real_listing_attribute_contract_without_executing_html(){
        let html=r#"<div id="riven-list"><div id="riven_2353750" data-weapon="Torid" data-name="Acri-critadex" data-price="900" data-rank="8" data-mr="16" data-polarity="naramon" data-rerolls="438" data-stat1="CritChance" data-stat1val="200.5" data-stat4="Corpus" data-stat4val="0.6"><script>ignored()</script></div>"#;
        let rows=super::parse_list(html,"Torid","PC").unwrap();assert_eq!(rows.len(),1);assert_eq!(rows[0]["price"],900);assert_eq!(rows[0]["attributes"][1]["value"],0.6);assert_eq!(rows[0]["attributes"][1]["positive"],false);assert!(rows[0]["link"].as_str().unwrap().starts_with("https://riven.market/list/PC/Torid#riven_"));
        assert!(super::parse_list(html,"Rubico","PC").unwrap().is_empty());assert!(super::parse_list("<html>Access denied</html>","Torid","PC").is_err());
        assert!(super::parse_list(&html.replace("data-price=\"900\"","data-price=\"unknown\""),"Torid","PC").is_err());
    }
    #[test]
    #[ignore = "explicit anonymous public-source smoke; no account or notification writes"]
    fn public_sources_read_only_smoke(){
        let history=tauri::async_runtime::block_on(super::riven_history("torid".into())).expect("public weapon history");
        let listings=tauri::async_runtime::block_on(super::riven_market_list("Torid".into(),"pc".into(),1)).expect("public listing page");
        assert!(history["data"].is_array());assert!(listings["data"].is_array());assert_eq!(listings["coverage"],"page");
        println!("public history rows={}, cross-source page rows={}, page=1",history["data"].as_array().unwrap().len(),listings["data"].as_array().unwrap().len());
    }
}

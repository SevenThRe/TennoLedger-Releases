//! Small persisted vendor view. Raw IDs, account data and random seeds are never retained.
use super::{VendorOffer, VendorPrice, VendorSnapshot};
use serde_json::Value;
pub const MANIFESTS: [(&str,&str);3] = [
    ("tenet","/Lotus/Types/Game/VendorManifests/Hubs/PerrinSequenceWeaponVendorManifest"),
    ("coda","/Lotus/Types/Game/VendorManifests/TheHex/InfestedLichWeaponVendorManifest"),
    ("teshin","/Lotus/Types/Game/VendorManifests/Hubs/TeshinHardModeVendorManifest"),
];
// The mobile Teshin response includes all eight weekly candidates with distant expiries.
// Apply WFCD's 2020-11-16 epoch before exposing them as currently offered.
fn weekly_index(store:&str,quantity:u64)->Option<usize>{
    match store.rsplit('/').next()? {
        "UmbraFormaBlueprint"=>Some(0),"Kuva" if quantity==50000=>Some(1),
        "RawModularPistolRandomMod"=>Some(2),"Forma" if quantity==3=>Some(3),
        "RawModularMeleeRandomMod"=>Some(4),"EvergreenLoginRewardFusionBundle"=>Some(5),
        "RawRifleRandomMod"=>Some(6),"RawShotgunRandomMod"=>Some(7),_=>None,
    }
}
fn date(v:&Value)->Option<String>{
    let ms=v["$date"]["$numberLong"].as_str().and_then(|s|s.parse().ok()).or_else(||v["$date"].as_i64())?;
    chrono::DateTime::from_timestamp_millis(ms).map(|d|d.to_rfc3339())
}
pub fn normalize(id:&str,raw:&Value,now:&str)->Result<VendorSnapshot,String>{
    let manifest=MANIFESTS.iter().find(|(key,_)|*key==id).ok_or("vendor-not-supported")?.1;
    let data=&raw["VendorInfo"];
    if data["TypeName"].as_str()!=Some(manifest){return Err("vendor-invalid-data".into());}
    let expiry=date(&data["Expiry"]).ok_or("vendor-invalid-expiry")?;
    let items=data["ItemManifest"].as_array().filter(|a|!a.is_empty()&&a.len()<=128).ok_or("vendor-invalid-data")?;
    let mut offers=Vec::new();
    for item in items {
        let store=item["StoreItem"].as_str().filter(|s|s.starts_with("/Lotus/StoreItems/")&&s.len()<=512).ok_or("vendor-invalid-item")?;
        let quantity=item["QuantityMultiplier"].as_u64().filter(|n|*n>0&&*n<=1_000_000).unwrap_or(1);
        let weekly=if id=="teshin"{weekly_index(store,quantity)}else{None};
        if let Some(index)=weekly {
            let timestamp=chrono::DateTime::parse_from_rfc3339(now).map_err(|_|"vendor-invalid-time")?.timestamp();
            if (timestamp-1605484800).div_euclid(604800).rem_euclid(8)!=index as i64 {continue;}
        }
        let mut prices=Vec::new();
        for p in item["ItemPrices"].as_array().ok_or("vendor-invalid-price")? {
            let item_id=p["ItemType"].as_str().filter(|s|s.starts_with("/Lotus/")&&s.len()<=512).ok_or("vendor-invalid-price")?.to_owned();
            let quantity=p["ItemCount"].as_u64().filter(|n|*n<=1_000_000).ok_or("vendor-invalid-price")?;
            prices.push(VendorPrice{item_id,quantity});
        }
        if prices.is_empty()||prices.len()>8{return Err("vendor-invalid-price".into());}
        offers.push(VendorOffer{item_id:store.replacen("/Lotus/StoreItems/","/Lotus/",1),expiry:if weekly.is_some(){expiry.clone()}else{date(&item["Expiry"]).unwrap_or_else(||expiry.clone())},quantity,prices,purchase_limit:item["PurchaseQuantityLimit"].as_u64(),element:None,bonus_percent:None});
    }
    Ok(VendorSnapshot{id:id.into(),captured_at:now.into(),expiry:Some(expiry),offers,error:None})
}

#[cfg(test)]mod tests{
 use super::*;use serde_json::json;
 #[test]fn retains_only_display_data_and_exact_expiry(){let raw=json!({"VendorInfo":{"TypeName":MANIFESTS[0].1,"Expiry":{"$date":{"$numberLong":"1792972800000"}},"ItemManifest":[{"StoreItem":"/Lotus/StoreItems/Weapons/Test","LocTagRandSeed":7801909967800408000u64,"Id":{"$oid":"private"},"QuantityMultiplier":1,"PurchaseQuantityLimit":1,"ItemPrices":[{"ItemType":"/Lotus/Types/Items/MiscItems/GranumBucks","ItemCount":40}]}]}});let v=normalize("tenet",&raw,"2026-10-24T00:00:00Z").unwrap();assert_eq!(v.offers[0].item_id,"/Lotus/Weapons/Test");assert_eq!(v.offers[0].prices[0].quantity,40);assert!(v.offers[0].bonus_percent.is_none());let s=serde_json::to_string(&v).unwrap();assert!(!s.contains("private"));assert!(!s.contains("780190"));assert!(normalize("coda",&raw,"2026-10-24T00:00:00Z").is_err());}
 #[test]fn rejects_missing_inventory(){assert!(normalize("tenet",&json!({}),"2026-10-24T00:00:00Z").is_err());}
 #[test]fn teshin_filters_future_weekly_candidates_but_keeps_regular_kuva(){
  let row=|name:&str,quantity:u64|json!({"StoreItem":format!("/Lotus/StoreItems/Types/Items/{}",name),"QuantityMultiplier":quantity,"ItemPrices":[{"ItemType":"/Lotus/Types/Items/MiscItems/SteelEssence","ItemCount":150}],"Expiry":{"$date":{"$numberLong":"2051240400000"}}});
  let raw=json!({"VendorInfo":{"TypeName":MANIFESTS[2].1,"Expiry":{"$date":{"$numberLong":"1792972800000"}},"ItemManifest":[row("UmbraFormaBlueprint",1),row("Kuva",50000),row("Kuva",10000),row("EvergreenLoginRewardFusionBundle",1)]}});
  let v=normalize("teshin",&raw,"2026-10-24T00:00:00Z").unwrap();assert_eq!(v.offers.len(),2);assert!(v.offers.iter().any(|o|o.quantity==10000));assert_eq!(v.offers[1].expiry,v.expiry.unwrap());
 }
}

//! Decode only inventory-owned randomized mods; fingerprints never leave this module.
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeSet;
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RivenAttribute {
    pub slug: String,
    pub name: String,
    pub value: f64,
    pub positive: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub roll_quality: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub values_by_rank: Option<Vec<f64>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ranges_by_rank: Option<Vec<[f64; 2]>>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OwnedRiven {
    pub id: String,
    pub name: String,
    pub weapon_slug: Option<String>,
    pub weapon_name: Option<String>,
    pub category: Option<String>,
    pub rank: u32,
    pub max_rank: u32,
    pub mastery_level: u32,
    pub rerolls: u32,
    pub polarity: String,
    pub attributes: Vec<RivenAttribute>,
    pub veiled: bool,
    pub tradeable: bool,
    pub blocked_reason: Option<String>,
    pub quantity: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub challenge: Option<RivenChallenge>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub weapon_previews: Vec<RivenWeaponPreview>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RivenWeaponPreview {
    pub weapon_id: String,
    pub weapon_name: String,
    pub disposition: f64,
    pub attributes: Vec<RivenAttribute>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RivenChallenge {
    pub id: String,
    pub group: String,
    pub description: String,
    pub progress: Option<f64>,
    pub required: Option<f64>,
}
fn veiled_challenge(fp:&Value,t:&Value,raw:bool)->RivenChallenge {
    if raw {return RivenChallenge{id:"PREVEILED_ID".into(),group:"尚未生成挑战".into(),description:"装备紫卡以揭示挑战".into(),progress:None,required:None};}
    let challenge=&fp["challenge"];
    let id=challenge["Type"].as_str().unwrap_or("UNKNOWN");
    let data=&t["challenges"][id];
    let template=data["description"].as_str().unwrap_or("未知挑战");
    let required=challenge["Required"].as_f64().filter(|x|x.is_finite()&&*x>=0.0);
    let progress=challenge["Progress"].as_f64().filter(|x|x.is_finite()&&*x>=0.0);
    let mut description=template.replace("|COUNT|",&required.map(|x|x.to_string()).unwrap_or("—".into()));
    if let Some(complication)=challenge["Complication"].as_str().filter(|s|!s.is_empty()) {
        description.push(' ');
        description.push_str(data["complications"][complication]["description"].as_str().unwrap_or("（未知附加条件）"));
    }
    RivenChallenge{id:id.into(),group:template.replace("|COUNT| ",""),description,progress,required}
}
fn n(v: &Value, k: &str) -> Option<u32> {
    v[k].as_u64().and_then(|x| u32::try_from(x).ok())
}
pub fn normalize(input: &Value) -> Vec<OwnedRiven> {
    let cat: Value = serde_json::from_str(include_str!("../../public/riven-catalog.json"))
        .expect("bundled riven catalogue");
    let mut seen = BTreeSet::new();
    let mut out = vec![];
    for group in ["Upgrades", "RawUpgrades"] {
        for e in input[group].as_array().into_iter().flatten() {
            let Some(kind) = e["ItemType"].as_str() else {
                continue;
            };
            let t = &cat["types"][kind];
            if t.is_null() {
                continue;
            }
            let raw = e["UpgradeFingerprint"].as_str().unwrap_or("");
            let fp: Value = serde_json::from_str(raw).unwrap_or(Value::Null);
            let item_id = e["ItemId"]
                .as_str()
                .or_else(|| e["ItemId"]["$oid"].as_str())
                .or_else(|| e["ItemId"]["oid"].as_str())
                .or_else(|| e["ItemId"]["OID"].as_str());
            let id = item_id
                .map(str::to_owned)
                .unwrap_or_else(|| format!("{kind}%%PREVEILED"));
            if !seen.insert(id.clone()) {
                continue;
            }
            let invalid_fingerprint = !kind.contains("/Raw") && !fp.is_object();
            let veiled = !fp["challenge"].is_null() || kind.contains("/Raw");
            let mut r = OwnedRiven {
                id,
                name: t["veiledName"].as_str().unwrap_or("Riven Mod").into(),
                weapon_slug: None,
                weapon_name: None,
                category: Some(
                    t["veiledName"]
                        .as_str()
                        .unwrap_or("")
                        .replace(" Riven Mod", "")
                        .to_lowercase()
                        .replace("archgun", "arch")
                        .replace("arch-melee", "arch"),
                ),
                rank: n(&fp, "lvl").unwrap_or(0),
                max_rank: 8,
                mastery_level: n(&fp, "lvlReq").unwrap_or(0),
                rerolls: n(&fp, "rerolls").unwrap_or(0),
                polarity: match fp["pol"].as_str() {
                    Some("AP_ATTACK") => "madurai",
                    Some("AP_DEFENSE") => "vazarin",
                    Some("AP_TACTIC") => "naramon",
                    _ => "",
                }
                .into(),
                attributes: vec![],
                veiled,
                tradeable: false,
                blocked_reason: Some("未揭示紫卡请通过普通物品市场挂售".into()),
                // Upgrades contains individual owned instances; ItemCount is not a stack size.
                // A raw stack must supply its count. Zero is an invalid sentinel rejected
                // by validate; never fabricate an owned card from a missing/broken count.
                quantity: if group == "Upgrades" { 1 } else { e["ItemCount"].as_u64().unwrap_or(0) },
                challenge: veiled.then(||veiled_challenge(&fp,t,kind.contains("/Raw"))),
                weapon_previews: vec![],
            };
            if invalid_fingerprint {
                r.blocked_reason = Some("紫卡指纹缺失或损坏，无法判断揭示状态".into());
            } else if !veiled {
                let result = decode(&fp, t, &cat, &mut r);
                r.blocked_reason = result.err();
                r.tradeable = r.blocked_reason.is_none();
            }
            out.push(r);
        }
    }
    out
}
fn decode(fp: &Value, t: &Value, cat: &Value, r: &mut OwnedRiven) -> Result<(), String> {
    decode_base(fp, t, cat, r)?;
    let base_name = r.weapon_name.clone().unwrap_or_default();
    for weapon in cat["weapons"].as_array().into_iter().flatten().filter(|weapon| {
        let name=weapon["name"].as_str().unwrap_or("");
        name==base_name || (!name.contains("Garuda") && !name.contains("Valkyr") && name.split(' ').any(|part| part==base_name))
    }) {
        let (Some(id),Some(name),Some(disposition))=(weapon["id"].as_str(),weapon["name"].as_str(),weapon["omegaAtt"].as_f64()) else {continue;};
        let mut fingerprint=fp.clone();
        fingerprint["compat"]=Value::String(id.into());
        let mut preview=r.clone();
        preview.weapon_previews.clear();
        preview.attributes.clear();
        // A variant need not have its own market slug to support in-game preview.
        let result=decode_base(&fingerprint,t,cat,&mut preview);
        if result.as_ref().is_err_and(|error| error!="武器尚未映射市场目录") {continue;}
        let attributes=preview.attributes;
        if attributes.len()!=r.attributes.len() {continue;}
        r.weapon_previews.push(RivenWeaponPreview{weapon_id:id.into(),weapon_name:name.into(),disposition,attributes});
    }
    r.weapon_previews.sort_by_key(|p| p.weapon_name!=base_name);
    Ok(())
}
fn decode_base(fp: &Value, t: &Value, cat: &Value, r: &mut OwnedRiven) -> Result<(), String> {
    let compat = match fp["compat"].as_str().ok_or("缺少紫卡武器")? {
        "/Lotus/Weapons/Tenno/Melee/Dagger/DarkDaggerBase" => {
            "/Lotus/Weapons/Tenno/Melee/Dagger/DarkDagger"
        }
        "/Lotus/Weapons/Tenno/Shotgun/QuadShotgunBase" => {
            "/Lotus/Weapons/Tenno/Shotgun/QuadShotgun"
        }
        x => x,
    };
    let w = cat["weapons"]
        .as_array()
        .unwrap()
        .iter()
        .find(|w| w["id"] == compat)
        .ok_or("紫卡武器目录尚未收录")?;
    r.weapon_name = w["name"].as_str().map(str::to_owned);
    if let Some(category) = w["category"].as_str() {
        r.category = Some(category.to_lowercase());
    }
    r.weapon_slug = w["slug"].as_str().map(str::to_owned);
    let buffs = fp["buffs"].as_array().ok_or("紫卡正面词条缺失")?;
    let curses = fp["curses"].as_array().cloned().unwrap_or_default();
    let multi = cat["multipliers"]
        .as_array()
        .unwrap()
        .iter()
        .find(|m| {
            m["goodModifiersCount"].as_u64() == Some(buffs.len() as u64)
                && m["badModifiersCount"].as_u64() == Some(curses.len() as u64)
        })
        .ok_or("紫卡词条数量无效")?;
    if ["lvl", "lvlReq", "rerolls"]
        .iter()
        .any(|k| fp.get(*k).is_some_and(|v| !v.is_null()) && n(fp, k).is_none())
        || r.rank > 8
        || !(8..=16).contains(&r.mastery_level)
        || r.polarity.is_empty()
    {
        return Err("紫卡等级、极性或洗练字段无效".into());
    }
    let mut names = vec![];
    for (entries, positive) in [(buffs, true), (&curses, false)] {
        for a in entries {
            let tag = a["Tag"].as_str().ok_or("紫卡词条标识缺失")?;
            let s = &t["rivenStats"][tag];
            let random = a["Value"]
                .as_i64()
                .filter(|n| *n >= 0 && *n <= 1_073_741_820)
                .ok_or("紫卡随机词条数值无效")?;
            let base = s["baseValue"].as_f64().ok_or("紫卡词条不在目录中")?;
            let disposition = w["omegaAtt"].as_f64().ok_or("武器倾向缺失")?;
            let factor = multi[if positive {
                "goodModifierMultiplier"
            } else {
                "badModifierMultiplier"
            }]
            .as_f64()
            .unwrap();
            let loc = s["localizationString"].as_str().unwrap_or("");
            let mut v = 90.0 * base * disposition * factor;
            if !positive && tag == "WeaponMeleeComboPointsOnHitMod" && v > 0.0 {
                v = -v
            }
            if loc.contains("|val|%") || loc.contains("|STAT1|%") {
                v *= 100.0
            }
            let worst = rank_values(v * if positive {0.9} else {1.1}, loc.contains("Damage to"));
            let best = rank_values(v * if positive {1.1} else {0.9}, loc.contains("Damage to"));
            let ranges_by_rank = worst.into_iter().zip(best).map(|(lo,hi)| [lo,hi]).collect();
            v *= (0.9 + random as f64 / 53_687_091.0 / 100.0).clamp(0.9, 1.1);
            let values_by_rank = rank_values(v, loc.contains("Damage to"));
            let v = values_by_rank[r.rank as usize];
            let slug = s["slug"].as_str().ok_or("紫卡词条尚未映射市场属性")?;
            r.attributes.push(RivenAttribute {
                slug: slug.into(),
                name: s["name"].as_str().unwrap_or(slug).into(),
                value: v,
                positive,
                roll_quality: Some(roll_quality(random, positive)),
                values_by_rank: Some(values_by_rank),
                ranges_by_rank: Some(ranges_by_rank),
            });
            if positive {
                names.push((
                    random,
                    s["prefixTag"].as_str().unwrap_or(""),
                    s["suffixTag"].as_str().unwrap_or(""),
                ))
            }
        }
    }
    names.sort_by(|a, b| b.0.cmp(&a.0));
    let name = if names.len() == 2 {
        format!("{}{}", names[0].1, names[1].2)
    } else {
        format!("{}-{}{}", names[0].1, names[1].1, names[2].2)
    };
    let mut chars = name.chars();
    r.name = chars.next().unwrap().to_uppercase().collect::<String>() + chars.as_str();
    if r.weapon_slug.is_none() {
        return Err("武器尚未映射市场目录".into());
    }
    Ok(())
}
fn roll_quality(random: i64, positive: bool) -> f64 {
    let fraction = (random as f64 / 1_073_741_820.0).clamp(0.0, 1.0);
    if positive { fraction } else { 1.0 - fraction }
}
fn rank_values(maximum: f64, faction_multiplier: bool) -> Vec<f64> {
    (0..=8).map(|rank| {
        let value = maximum * (rank + 1) as f64 / 9.0;
        if faction_multiplier { ((value + 1.0) * 100.0).round_ties_even() / 100.0 }
        else { (value * 10.0).round_ties_even() / 10.0 }
    }).collect()
}
fn invalid_attribute(a:&RivenAttribute, rank:u32)->bool {
    !a.value.is_finite() || a.value.abs() > 100000.0 || a.slug.is_empty()
                    || a.roll_quality.is_some_and(|q| !q.is_finite() || !(0.0..=1.0).contains(&q))
                    || a.values_by_rank.as_ref().is_some_and(|values| values.len()!=9
                        || values.iter().any(|v| !v.is_finite() || v.abs()>100000.0)
                        || values.get(rank as usize)!=Some(&a.value))
                    || a.ranges_by_rank.as_ref().is_some_and(|ranges| ranges.len()!=9
                        || ranges.iter().flatten().any(|v| !v.is_finite() || v.abs()>100000.0))
}
pub fn validate(rivens: &[OwnedRiven]) -> Result<(), String> {
    let cat: Value = serde_json::from_str(include_str!("../../public/riven-catalog.json"))
        .expect("bundled catalogue");
    let mut ids = BTreeSet::new();
    if rivens.len() > 10000 {
        return Err("紫卡数量超限".into());
    }
    for r in rivens {
        if r.quantity == 0 || r.quantity > 1_000_000_000 {
            return Err("紫卡库存数量缺失或无效，请重新读取库存".into());
        }
        if r.id.is_empty()
            || r.id.len() > 600
            || !ids.insert(&r.id)
            || r.rank > 8
            || r.max_rank != 8
            || r.mastery_level > 16
            || r.attributes.len() > 4
            || r.challenge.as_ref().is_some_and(|c| !r.veiled || c.id.len()>600 || c.group.len()>2000 || c.description.len()>4000 || [c.progress,c.required].iter().flatten().any(|v|!v.is_finite()||*v<0.0))
            || r.attributes.iter().any(|a| invalid_attribute(a,r.rank))
            || r.weapon_previews.len()>50
            || r.weapon_previews.iter().any(|p| p.weapon_id.is_empty() || p.weapon_name.len()>300
                || !p.disposition.is_finite() || p.disposition<=0.0 || p.disposition>5.0
                || p.attributes.len()!=r.attributes.len()
                || p.attributes.iter().zip(&r.attributes).any(|(a,original)| a.slug!=original.slug || a.positive!=original.positive || invalid_attribute(a,r.rank)))
        {
            return Err("紫卡库存字段无效或重复".into());
        }
        if r.tradeable
            && (r.veiled
                || r.blocked_reason.is_some()
                || r.weapon_slug.is_none()
                || r.attributes.iter().filter(|a| a.positive).count() < 2
                || !(8..=16).contains(&r.mastery_level)
                || !["madurai", "vazarin", "naramon"].contains(&r.polarity.as_str())
                || r.attributes.iter().any(|a| {
                    !cat["attributes"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .any(|x| x["slug"] == a.slug)
                })
                || r.attributes
                    .iter()
                    .map(|a| &a.slug)
                    .collect::<BTreeSet<_>>()
                    .len()
                    != r.attributes.len()
                || r.attributes.iter().filter(|a| !a.positive).count() > 1
                || !cat["weapons"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .any(|w| w["slug"].as_str() == r.weapon_slug.as_deref()))
        {
            return Err("紫卡交易资料不完整".into());
        }
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn veiled_challenge_preserves_progress_complication_and_stacks(){
        let cat:Value=serde_json::from_str(include_str!("../../public/riven-catalog.json")).unwrap();
        let (kind,t)=cat["types"].as_object().unwrap().iter().find(|(_,t)|t["challenges"]["/Lotus/Types/Challenges/RandomizedKill"].is_object()).unwrap();
        let fp=serde_json::json!({"challenge":{"Type":"/Lotus/Types/Challenges/RandomizedKill","Required":20,"Progress":7,"Complication":"/Lotus/Types/Challenges/Complications/ResetOnDamageTaken"}});
        let r=normalize(&serde_json::json!({"Upgrades":[{"ItemType":kind,"ItemId":"test-veiled","UpgradeFingerprint":fp.to_string()}]}));
        let c=r[0].challenge.as_ref().unwrap();
        assert_eq!(c.progress,Some(7.0));assert_eq!(c.required,Some(20.0));
        assert!(c.description.contains("20"));assert!(c.description.contains("without taking damage"));assert!(!c.group.contains("|COUNT|"));
        assert!(validate(&r).is_ok());
        let raw=veiled_challenge(&Value::Null,t,true);assert_eq!(raw.required,None);assert_eq!(raw.id,"PREVEILED_ID");
        let raw_kind=cat["types"].as_object().unwrap().keys().find(|k|k.contains("/Raw")).unwrap();
        let stack=normalize(&serde_json::json!({"RawUpgrades":[{"ItemType":raw_kind,"ItemCount":4}]}));
        assert_eq!(stack[0].quantity,4);assert_eq!(stack[0].challenge.as_ref().unwrap().id,"PREVEILED_ID");

    }
    #[test]
    fn rank_preview_scales_before_rounding_and_keeps_faction_baseline() {
        assert_eq!(rank_values(98.46, false)[0], 10.9);
        assert_eq!(rank_values(98.46, false)[8], 98.5);
        assert_eq!(rank_values(0.54, true)[0], 1.06);
        assert_eq!(rank_values(0.54, true)[8], 1.54);
        assert_eq!(rank_values(-0.27, true)[0], 0.97);
        assert_eq!(rank_values(-0.27, true)[8], 0.73);
    }
    #[test]
    fn random_quality_reverses_negative_traits_and_preserves_legacy_imports() {
        assert_eq!(roll_quality(0, true), 0.0);
        assert_eq!(roll_quality(1_073_741_820, true), 1.0);
        assert_eq!(roll_quality(0, false), 1.0);
        assert_eq!(roll_quality(1_073_741_820, false), 0.0);
        assert_eq!(roll_quality(536_870_910, false), 0.5);
        let old: RivenAttribute = serde_json::from_str(r#"{"slug":"zoom","name":"Zoom","value":20,"positive":false}"#).unwrap();
        assert_eq!(old.roll_quality, None);
    }
    #[test]
    fn deduplicate_and_block_malformed() {
        let input = serde_json::json!({"Upgrades":[{"ItemType":"/Lotus/Upgrades/Mods/Randomized/LotusRifleRandomModRare","ItemId":{"$oid":"a"},"UpgradeFingerprint":"broken"},{"ItemType":"/Lotus/Upgrades/Mods/Randomized/LotusRifleRandomModRare","ItemId":{"$oid":"a"}}]});
        let r = normalize(&input);
        assert_eq!(r.len(), 1);
        assert!(!r[0].tradeable);
        assert!(r[0].blocked_reason.as_deref().unwrap().contains("损坏"));
        assert!(!r[0].veiled);
        assert_eq!(r[0].category.as_deref(), Some("rifle"));
        validate(&r).unwrap();
    }
    #[test]
    fn rejects_false_tradeability() {
        let input = serde_json::json!({"RawUpgrades":[{"ItemType":"/Lotus/Upgrades/Mods/Randomized/RawRifleRandomMod","ItemCount":4}]});
        let mut r = normalize(&input);
        assert_eq!(r[0].quantity, 4);
        r[0].tradeable = true;
        assert!(validate(&r).is_err());
    }
    #[test]
    fn upgrade_instances_ignore_item_count_but_raw_stacks_preserve_it() {
        let input = serde_json::json!({
            "Upgrades":[
                {"ItemType":"/Lotus/Upgrades/Mods/Randomized/LotusRifleRandomModRare","ItemId":"a","ItemCount":0,"UpgradeFingerprint":"broken"},
                {"ItemType":"/Lotus/Upgrades/Mods/Randomized/LotusRifleRandomModRare","ItemId":"b","ItemCount":99,"UpgradeFingerprint":"broken"},
                {"ItemType":"/Lotus/Upgrades/Mods/Randomized/LotusRifleRandomModRare","ItemId":"c","UpgradeFingerprint":"broken"}
            ],
            "RawUpgrades":[{"ItemType":"/Lotus/Upgrades/Mods/Randomized/RawRifleRandomMod","ItemCount":4}]
        });
        let rows = normalize(&input);
        assert_eq!(rows.len(), 4);
        assert_eq!(rows.iter().map(|r| r.quantity).collect::<Vec<_>>(), vec![1,1,1,4]);
        validate(&rows).unwrap();
    }
    #[test]
    fn raw_stack_counts_must_be_explicit_positive_integers() {
        for count in [Value::Null, serde_json::json!("4"), serde_json::json!(-1),
            serde_json::json!(1.5), serde_json::json!(true), serde_json::json!(0),
            serde_json::json!(1_000_000_001u64)] {
            let mut entry = serde_json::json!({"ItemType":"/Lotus/Upgrades/Mods/Randomized/RawRifleRandomMod"});
            if !count.is_null() { entry["ItemCount"] = count; }
            let rows = normalize(&serde_json::json!({"RawUpgrades":[entry]}));
            assert_eq!(rows.len(), 1);
            assert!(validate(&rows).unwrap_err().contains("库存数量"));
        }
        for count in [1, 4, 1_000_000_000u64] {
            let rows = normalize(&serde_json::json!({"RawUpgrades":[{
                "ItemType":"/Lotus/Upgrades/Mods/Randomized/RawRifleRandomMod", "ItemCount":count
            }]}));
            assert_eq!(rows[0].quantity, count);
            validate(&rows).unwrap();
        }
    }
    #[test]
    fn known_fingerprint_decodes_current_rank_and_name() {
        let cat: Value =
            serde_json::from_str(include_str!("../../public/riven-catalog.json")).unwrap();
        let w = cat["weapons"]
            .as_array()
            .unwrap()
            .iter()
            .find(|w| w["name"] == "Soma")
            .unwrap();
        let fp = serde_json::json!({"compat":w["id"],"lvlReq":12,"lvl":0,"rerolls":5,"pol":"AP_ATTACK","buffs":[{"Tag":"WeaponCritChanceMod","Value":536870910},{"Tag":"WeaponCritDamageMod","Value":0}],"curses":[]});
        let input = serde_json::json!({"Upgrades":[{"ItemType":w["rivenUID"],"ItemId":{"$oid":"test-card"},"UpgradeFingerprint":fp.to_string()}]});
        let r = normalize(&input);
        assert_eq!(r.len(), 1);
        assert!(r[0].tradeable, "{:?}", r[0].blocked_reason);
        assert_eq!(r[0].name, "Critatis");
        assert_eq!(r[0].attributes.len(), 2);
        assert_eq!(r[0].attributes[0].roll_quality, Some(0.5));
        let ranges=r[0].attributes[0].ranges_by_rank.as_ref().unwrap();
        assert_eq!(ranges.len(),9);
        assert!(ranges[0][0]<=r[0].attributes[0].value && ranges[0][1]>=r[0].attributes[0].value);
        assert_eq!(r[0].attributes[1].roll_quality, Some(0.0));
        assert_eq!(r[0].weapon_slug.as_deref(), Some("soma"));
        assert_eq!(r[0].rerolls, 5);
        assert_eq!(r[0].weapon_previews[0].weapon_name, "Soma");
        let prime=r[0].weapon_previews.iter().find(|p|p.weapon_name=="Soma Prime").unwrap();
        assert_ne!(prime.attributes[0].value,r[0].attributes[0].value);
        assert_eq!(prime.attributes[0].roll_quality,r[0].attributes[0].roll_quality);
        assert_eq!(prime.attributes[0].values_by_rank.as_ref().unwrap().len(),9);
        validate(&r).unwrap();
        let expected = (90.0
            * cat["types"][w["rivenUID"].as_str().unwrap()]["rivenStats"]["WeaponCritChanceMod"]
                ["baseValue"]
                .as_f64()
                .unwrap()
            * w["omegaAtt"].as_f64().unwrap()
            * 0.99
            * 100.0
            / 9.0
            * 10.0)
            .round_ties_even()
            / 10.0;
        assert_eq!(r[0].attributes[0].value, expected);
        let mut bad = r.clone();
        bad[0].attributes[0].slug = "unknown_attribute".into();
        assert!(validate(&bad).is_err());
    }

    #[test]
    fn real_cache_riven_aggregate_if_present() {
        let Some(local) = std::env::var_os("LOCALAPPDATA") else {
            return;
        };
        let path = std::path::PathBuf::from(local).join("AlecaFrame/lastData.dat");
        if !path.exists() {
            return;
        }
        let v = crate::inventory_data::read_cache(&path).unwrap();
        let snapshot = crate::inventory_data::from_value(
            &v,
            &crate::collection::catalog().unwrap(),
            None,
            "cache",
            "2026-10-23T00:00:00Z",
        )
        .unwrap();
        let r = snapshot.rivens.unwrap();
        validate(&r).unwrap();
        let mut blocked = std::collections::BTreeMap::new();
        for x in &r {
            if let Some(reason) = &x.blocked_reason {
                *blocked.entry(reason).or_insert(0) += 1;
            }
        }
        eprintln!(
            "riven aggregate: total={}, revealed={}, ready={}, blocked={:?}",
            r.len(),
            r.iter().filter(|r| !r.veiled).count(),
            r.iter().filter(|r| r.tradeable).count(),
            blocked
        );
    }
}

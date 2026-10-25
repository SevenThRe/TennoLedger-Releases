//! Normalize account inventory without retaining private account identifiers or raw payloads.
use crate::collection::{Catalog, MasteryAccount, MasteryProgress, PlayerProfile, Snapshot};
use serde_json::Value;
use std::{collections::BTreeMap, path::Path};
const LIMIT: usize = 16 * 1024 * 1024;
fn pending_recipe_counts(value: &Value) -> Option<BTreeMap<String, u64>> {
    let rows = value.get("PendingRecipes")?.as_array()?;
    if rows.len() > 10000 { return None; }
    let mut counts = BTreeMap::new();
    for row in rows {
        let id = row.get("ItemType")?.as_str()?;
        if !id.starts_with("/Lotus/") || id.len() > 512 { return None; }
        *counts.entry(id.to_owned()).or_insert(0) += 1;
    }
    Some(counts)
}

#[cfg(test)]
mod pending_recipe_tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn preserves_unknown_and_empty_queue() {
        assert_eq!(pending_recipe_counts(&json!({})), None);
        assert_eq!(pending_recipe_counts(&json!({"PendingRecipes":[]})), Some(BTreeMap::new()));
        assert_eq!(pending_recipe_counts(&json!({"PendingRecipes":[{}]})), None);
    }
    #[test]
    fn counts_each_craft_even_after_completion_until_claimed() {
        let raw = json!({"PendingRecipes":[{"ItemType":"/Lotus/Test/Blueprint","CompletionDate":0},{"ItemType":"/Lotus/Test/Blueprint","CompletionDate":9999999999_i64}]});
        assert_eq!(pending_recipe_counts(&raw).unwrap()["/Lotus/Test/Blueprint"], 2);
    }
}
const REQUIRED: &[&str] = &[
    "MiscItems",
    "XPInfo",
    "Suits",
    "LongGuns",
    "Pistols",
    "Melee",
];
const EQUIPMENT: &[&str] = &[
    "Suits",
    "LongGuns",
    "Pistols",
    "Melee",
    "Sentinels",
    "SentinelWeapons",
    "SpaceSuits",
    "SpaceGuns",
    "SpaceMelee",
    "KubrowPets",
    "MoaPets",
    "Hoverboards",
    "MechSuits",
    "SpecialItems",
    "OperatorAmps",
    "CrewShipHarnesses",
    "Upgrades",
];
fn unranked_equipment_counts(value:&Value,catalog:&Catalog)->BTreeMap<String,Option<u64>>{
 let mut out:BTreeMap<String,Option<u64>>=BTreeMap::new();
 for (group,category)in [("Suits","warframe"),("LongGuns","primary"),("Pistols","secondary"),("Melee","melee"),("Sentinels","sentinel"),("SentinelWeapons","sentinelweapon")]{
  let Some(rows)=value[group].as_array()else{continue;};
  for item in catalog.items.iter().filter(|i|i.category==category){out.entry(item.id.clone()).or_insert(Some(0));}
  for row in rows{let Some(id)=row["ItemType"].as_str()else{continue;};let entry=out.entry(id.into()).or_insert(Some(0));match row.get("XP").and_then(numeric){Some(0)=>{*entry=entry.and_then(|n|n.checked_add(1));},Some(_)=>{},None=>{*entry=None;}}}
 }
 out
}
const STACKS: &[&str] = &[
    "MiscItems",
    "RawUpgrades",
    "Recipes",
    "Consumables",
    "LevelKeys",
    "FlavourItems",
    "WeaponSkins",
];
fn add(counts: &mut BTreeMap<String, u64>, id: &str, n: u64) -> Result<(), String> {
    if !id.starts_with("/Lotus/") || id.len() > 512 {
        return Err("库存物品类型无效".into());
    }
    let value = counts.entry(id.into()).or_default();
    *value = value
        .checked_add(n)
        .filter(|n| *n <= 1_000_000_000)
        .ok_or("库存数量超限")?;
    Ok(())
}
fn numeric(v: &Value) -> Option<u64> {
    v.as_u64().or_else(|| v.as_str()?.parse().ok())
}
fn upgrade_counts_by_rank(value: &Value) -> Result<Option<BTreeMap<String, Option<BTreeMap<u32, u64>>>>, String> {
    let (Some(raw), Some(upgraded)) = (value["RawUpgrades"].as_array(), value["Upgrades"].as_array()) else {
        return Ok(None);
    };
    let mut result: BTreeMap<String, Option<BTreeMap<u32, u64>>> = BTreeMap::new();
    for (entries, stacked) in [(raw, true), (upgraded, false)] {
        for entry in entries {
            let id = entry["ItemType"].as_str().ok_or("模组缺少物品类型")?;
            let count = if stacked { entry.get("ItemCount").and_then(numeric).ok_or("模组缺少数量")? } else { 1 };
            let rank = match entry.get("UpgradeFingerprint") {
                None | Some(Value::Null) => Some(0),
                Some(Value::String(s)) if s.is_empty() => Some(0),
                Some(Value::String(s)) => serde_json::from_str::<Value>(s).ok().filter(Value::is_object).and_then(|fp| {
                    match fp.get("lvl") { None => Some(0), Some(v) => v.as_u64().filter(|n| *n <= 100).map(|n| n as u32) }
                }),
                _ => None,
            };
            let ranks = result.entry(id.into()).or_insert_with(|| Some(BTreeMap::new()));
            if let Some(rank) = rank {
                if let Some(ranks) = ranks {
                    let n = ranks.entry(rank).or_default();
                    *n = n.checked_add(count).filter(|n| *n <= 1_000_000_000).ok_or("模组数量超限")?;
                }
            } else { *ranks = None; }
        }
    }
    Ok(Some(result))
}
fn optional_number(value: &Value, key: &str) -> Result<Option<u64>, String> {
    match value.get(key).filter(|v| !v.is_null()) {
        None => Ok(None),
        Some(v) => numeric(v)
            .map(Some)
            .ok_or_else(|| format!("账户数值无效：{key}")),
    }
}
fn intrinsic_progress(value: &Value, keys: &[&str]) -> Result<Option<MasteryProgress>, String> {
    let mut sum = 0;
    let mut complete = true;
    for key in keys {
        match optional_number(&value["PlayerSkills"], key)? {
            Some(n) if n <= 10 => sum += n as u32,
            Some(_) => return Err("内源之力等级超限".into()),
            None => complete = false,
        }
    }
    Ok(complete.then_some(MasteryProgress {
        current: sum,
        max: keys.len() as u32 * 10,
    }))
}
fn sync_time(value: &Value) -> Option<String> {
    let sync = &value["LastInventorySync"];
    let oid = sync
        .as_str()
        .or_else(|| sync["$oid"].as_str())
        .or_else(|| sync["oid"].as_str())
        .or_else(|| sync["OID"].as_str())?;
    if oid.len() != 24 || !oid.bytes().all(|b| b.is_ascii_hexdigit()) {
        return None;
    }
    let seconds = i64::from_str_radix(&oid[..8], 16).ok()?;
    Some(chrono::DateTime::from_timestamp(seconds, 0)?.to_rfc3339())
}
pub fn from_value(
    value: &Value,
    catalog: &Catalog,
    previous: Option<&Snapshot>,
    source: &str,
    fallback_time: &str,
) -> Result<Snapshot, String> {
    let account_scope=crate::account_scope::from_value(value)?;
    for field in ["InventoryJson", "InventoryJSON"] {
        if let Some(inner) = value.get(field) {
            if let Some(text) = inner.as_str() {
                if text.len() > LIMIT {
                    return Err("账户库存超过16MiB".into());
                }
                let inner: Value = serde_json::from_str(text).map_err(|_| "账户库存JSON无效")?;
                if inner.get("InventoryJson").is_some() || inner.get("InventoryJSON").is_some() {
                    return Err("库存包装层无效".into());
                }
                let mut out=from_value(&inner,catalog,None,source,fallback_time)?;
                out.account_scope=account_scope.or(out.account_scope);
                if let Some(old)=previous.filter(|old|old.account_scope==out.account_scope){out.favorites=old.favorites.clone();}
                return Ok(out);
            }
            if inner.is_object() {
                let mut out=from_value(inner,catalog,None,source,fallback_time)?;
                out.account_scope=account_scope.or(out.account_scope);
                if let Some(old)=previous.filter(|old|old.account_scope==out.account_scope){out.favorites=old.favorites.clone();}
                return Ok(out);
            }
        }
    }
    if !value.is_object()
        || value.get("LastInventorySync").is_none()
        || REQUIRED.iter().any(|k| !value[*k].is_array())
    {
        return Err("缺少完整账户库存结构".into());
    }
    let captured_at = sync_time(value).unwrap_or_else(|| fallback_time.to_owned());
    if chrono::DateTime::parse_from_rfc3339(&captured_at).is_err() {
        return Err("库存时间无效".into());
    }
    let mut out = Snapshot {
        account_scope,
        pending_recipes: pending_recipe_counts(value),
        schema_version: 1,
        rivens: Some(crate::riven_inventory::normalize(value)),
        captured_at,
        source: source.to_owned(),
        complete: EQUIPMENT
            .iter()
            .chain(STACKS.iter())
            .all(|k| value[*k].is_array()),
        mastery_rank: optional_number(value, "PlayerLevel")?
            .map(|n| u32::try_from(n).unwrap_or(u32::MAX)),
        credits: optional_number(value, "RegularCredits")?,
        player_profile: Some(PlayerProfile {
            name: value
                .get("DisplayName")
                .and_then(Value::as_str)
                .map(str::to_owned),
            platinum: optional_number(value, "PremiumCredits")?,
            endo: optional_number(value, "FusionPoints")?,
            ducats: None,
        }),
        mastery_account: Some(MasteryAccount {
            // XPInfo is the historical equipment ledger, independent of owned groups.
            ranks_complete: true,
            railjack: intrinsic_progress(
                value,
                &[
                    "LPS_TACTICAL",
                    "LPS_PILOTING",
                    "LPS_GUNNERY",
                    "LPS_ENGINEERING",
                    "LPS_COMMAND",
                ],
            )?,
            duviri: intrinsic_progress(
                value,
                &[
                    "LPS_DRIFT_COMBAT",
                    "LPS_DRIFT_OPPORTUNITY",
                    "LPS_DRIFT_RIDING",
                    "LPS_DRIFT_ENDURANCE",
                ],
            )?,
            // Total XP and star chart require the versioned node XP catalogue.
            // Equipment XP alone would misrepresent account progress.
            ..MasteryAccount::default()
        }),
        ..Snapshot::default()
    };
    if value["Affiliations"].is_array() || value.as_object().is_some_and(|o|o.keys().any(|k|k.starts_with("DailyAffiliation"))) {
        let mut standing = crate::collection::StandingSnapshot { captured_at: if matches!(source,"warframe-api-helper"|"game-memory") { fallback_time.to_owned() } else { out.captured_at.clone() }, ..Default::default() };
        for a in value["Affiliations"].as_array().into_iter().flatten() {
            let Some(tag) = a["Tag"].as_str().filter(|s|!s.is_empty()&&s.len()<=128&&s.bytes().all(|b|b.is_ascii_alphanumeric()||b==b'_')) else {continue;};
            standing.affiliations.push(crate::collection::SyndicateStanding { tag:tag.into(), rank:a["Title"].as_i64().and_then(|r|i32::try_from(r).ok()).filter(|r|(-2..=10000).contains(r)), standing:a["Standing"].as_i64().filter(|n|(-1_000_000..=1_000_000_000).contains(n)) });
        }
        for key in ["DailyAffiliation","DailyAffiliationPvp","DailyAffiliationLibrary","DailyAffiliationCetus","DailyAffiliationQuills","DailyAffiliationSolaris","DailyAffiliationVentkids","DailyAffiliationVox","DailyAffiliationEntrati","DailyAffiliationNecraloid","DailyAffiliationZariman","DailyAffiliationCavia","DailyAffiliationHex"] {
            if let Some(n)=value[key].as_u64().filter(|n|*n<=1_000_000) {standing.daily_remaining.insert(key.into(),n);}
        }
        out.standing=Some(standing);
    }
    out.vendors=value.get("MyFrameVendors").and_then(|v|serde_json::from_value(v.clone()).ok());
    crate::account_mastery::complete(value, out.mastery_account.as_mut().unwrap());
    out.upgrade_counts_by_rank = upgrade_counts_by_rank(value)?;
    out.loose_unranked_mods = crate::collection::loose_mod_inventory::parse(value, out.upgrade_counts_by_rank.as_ref());
    if let Some(old) = previous.filter(|old|old.account_scope==out.account_scope) {
        out.favorites = old.favorites.clone();
    }
    for field in STACKS {
        if let Some(entries) = value.get(*field) {
            let entries = entries.as_array().ok_or("库存列表类型无效")?;
            for entry in entries {
                let id = entry["ItemType"].as_str().ok_or("库存缺少物品类型")?;
                let n = entry
                    .get("ItemCount")
                    .and_then(numeric)
                    .or_else(|| {
                        if *field == "FlavourItems" || *field == "WeaponSkins" {
                            Some(1)
                        } else {
                            None
                        }
                    })
                    .ok_or("库存缺少数量")?;
                add(
                    &mut out.counts,
                    id,
                    if *field == "Recipes" && n == 0 { 1 } else { n },
                )?;
            }
        }
    }
    out.unranked_equipment_counts=Some(unranked_equipment_counts(value,catalog));
    out.incarnon = Some(std::collections::BTreeSet::new());
    for field in EQUIPMENT {
        if let Some(entries) = value.get(*field) {
            for entry in entries.as_array().ok_or("装备列表类型无效")? {
                let id = entry["ItemType"].as_str().ok_or("装备缺少物品类型")?;
                add(&mut out.counts, id, 1)?;
                if ["LongGuns", "Pistols", "Melee"].contains(field)
                    && entry["SkillTree"].as_str().is_some_and(|s| !s.trim().is_empty())
                {
                    out.incarnon.as_mut().unwrap().insert(id.to_owned());
                }
            }
        }
    }
    if let Some(profile) = &mut out.player_profile {
        // MiscItems is required and fully enumerated; absence means no ducats.
        profile.ducats = Some(
            out.counts
                .get("/Lotus/Types/Items/MiscItems/PrimeBucks")
                .copied()
                .unwrap_or(0),
        );
    }
    let items: BTreeMap<_, _> = catalog.items.iter().map(|i| (i.id.as_str(), i)).collect();
    for entry in value["XPInfo"].as_array().unwrap() {
        let id = entry["ItemType"].as_str().ok_or("精通记录缺少类型")?;
        let xp = entry.get("XP").and_then(numeric).ok_or("精通经验无效")?;
        if let Some(item) = items.get(id) {
            let denominator = if item.xp_per_rank == 200 {
                1000.0
            } else {
                500.0
            };
            let rank = ((xp as f64 / denominator).sqrt().floor() as u32).min(item.max_rank);
            out.ranks
                .entry(id.into())
                .and_modify(|r| *r = (*r).max(rank))
                .or_insert(rank);
        }
    }
    if let Some(consumed) = value["InfestedFoundry"]["ConsumedSuits"].as_array() {
        let mut set = std::collections::BTreeSet::new();
        for entry in consumed {
            if let Some(id) = entry["s"].as_str() {
                if id.starts_with("/Lotus/") {
                    set.insert(id.to_owned());
                }
            }
        }
        out.helminth = Some(set);
    }
    out.archon_shard_frames = crate::collection::archon_inventory::parse(&value["Suits"]);
    out.archon_shards = out.archon_shard_frames.as_deref()
        .and_then(crate::collection::archon_inventory::equipped_types);
    crate::collection::validate(&out, catalog)?;
    Ok(out)
}
pub fn read_cache(path: &Path) -> Result<Value, String> {
    use std::io::Read;
    let mut bytes = Vec::new();
    std::fs::File::open(path)
        .map_err(|_| "无法读取本地库存缓存")?
        .take((LIMIT + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|_| "读取库存缓存失败")?;
    if bytes.len() > LIMIT {
        return Err("库存缓存超过16MiB".into());
    }
    let start = bytes.strip_prefix(&[239, 187, 191]).unwrap_or(&bytes);
    if start.iter().find(|b| !b.is_ascii_whitespace()) != Some(&b'{') {
        bytes = decrypt(&bytes)?;
    }
    let plain = bytes.strip_prefix(&[239, 187, 191]).unwrap_or(&bytes);
    serde_json::from_slice(plain).map_err(|_| "库存缓存不是有效JSON".into())
}
#[cfg(not(windows))]
fn decrypt(_: &[u8]) -> Result<Vec<u8>, String> {
    Err("此平台不支持加密缓存".into())
}
#[cfg(windows)]
fn decrypt(input: &[u8]) -> Result<Vec<u8>, String> {
    use std::ffi::c_void;
    type Handle = *mut c_void;
    #[link(name = "bcrypt")]
    extern "system" {
        fn BCryptOpenAlgorithmProvider(
            out: *mut Handle,
            id: *const u16,
            provider: *const u16,
            flags: u32,
        ) -> i32;
        fn BCryptSetProperty(
            handle: Handle,
            property: *const u16,
            input: *const u8,
            len: u32,
            flags: u32,
        ) -> i32;
        fn BCryptGenerateSymmetricKey(
            handle: Handle,
            key: *mut Handle,
            object: *mut u8,
            object_len: u32,
            secret: *const u8,
            secret_len: u32,
            flags: u32,
        ) -> i32;
        fn BCryptDecrypt(
            key: Handle,
            input: *const u8,
            len: u32,
            padding: *mut c_void,
            iv: *mut u8,
            iv_len: u32,
            output: *mut u8,
            output_len: u32,
            written: *mut u32,
            flags: u32,
        ) -> i32;
        fn BCryptDestroyKey(key: Handle) -> i32;
        fn BCryptCloseAlgorithmProvider(handle: Handle, flags: u32) -> i32;
    }
    struct Algorithm(Handle);
    impl Drop for Algorithm {
        fn drop(&mut self) {
            unsafe {
                BCryptCloseAlgorithmProvider(self.0, 0);
            }
        }
    }
    struct Key(Handle);
    impl Drop for Key {
        fn drop(&mut self) {
            unsafe {
                BCryptDestroyKey(self.0);
            }
        }
    }
    fn wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(Some(0)).collect()
    }
    fn check(status: i32) -> Result<(), String> {
        if status < 0 {
            Err("本地缓存解密失败".into())
        } else {
            Ok(())
        }
    }
    if input.is_empty() || input.len() % 16 != 0 {
        return Err("加密缓存长度无效".into());
    }
    let key_bytes = [
        76, 69, 79, 45, 65, 76, 69, 67, 9, 69, 79, 45, 65, 76, 69, 67,
    ];
    let mut iv = [
        49, 50, 70, 71, 66, 51, 54, 45, 76, 69, 51, 45, 113, 61, 57, 0,
    ];
    unsafe {
        let mut algorithm = std::ptr::null_mut();
        check(BCryptOpenAlgorithmProvider(
            &mut algorithm,
            wide("AES").as_ptr(),
            std::ptr::null(),
            0,
        ))?;
        let algorithm = Algorithm(algorithm);
        let mode = wide("ChainingModeCBC");
        check(BCryptSetProperty(
            algorithm.0,
            wide("ChainingMode").as_ptr(),
            mode.as_ptr() as *const u8,
            (mode.len() * 2) as u32,
            0,
        ))?;
        let mut key = std::ptr::null_mut();
        check(BCryptGenerateSymmetricKey(
            algorithm.0,
            &mut key,
            std::ptr::null_mut(),
            0,
            key_bytes.as_ptr(),
            16,
            0,
        ))?;
        let key = Key(key);
        let mut output = vec![0u8; input.len()];
        let mut written = 0;
        check(BCryptDecrypt(
            key.0,
            input.as_ptr(),
            input.len() as u32,
            std::ptr::null_mut(),
            iv.as_mut_ptr(),
            16,
            output.as_mut_ptr(),
            output.len() as u32,
            &mut written,
            1,
        ))?;
        output.truncate(written as usize);
        Ok(output)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    fn raw() -> Value {
        json!({"LastInventorySync":{"$oid":"650000000000000000000000"},"MiscItems":[],"XPInfo":[],"Suits":[],"LongGuns":[],"Pistols":[],"Melee":[],"PlayerLevel":12,"RegularCredits":8000})
    }
    #[test]
    fn standing_keeps_missing_and_zero_distinct_and_dates_live_reads() {
        let mut v=raw(); let cat=crate::collection::catalog().unwrap();
        v["Affiliations"]=json!([{"Tag":"PerrinSyndicate","Title":-1,"Standing":-16000},{"Tag":"HexSyndicate","Title":5}]);
        v["DailyAffiliation"]=json!(0);
        v["DailyAffiliationHex"]=json!(-1);
        let out=from_value(&v,&cat,None,"warframe-api-helper","2026-10-24T12:00:00Z").unwrap();
        let s=out.standing.unwrap();assert_eq!(s.captured_at,"2026-10-24T12:00:00Z");
        assert_eq!(s.affiliations[0].standing,Some(-16000));assert_eq!(s.affiliations[1].standing,None);
        assert_eq!(s.daily_remaining.get("DailyAffiliation"),Some(&0));assert!(!s.daily_remaining.contains_key("DailyAffiliationHex"));
        let cached=from_value(&v,&cat,None,"alecaframe-cache","2026-10-24T12:00:00Z").unwrap();assert_ne!(cached.standing.unwrap().captured_at,"2026-10-24T12:00:00Z");
        assert!(from_value(&raw(),&cat,None,"test","2026-10-24T12:00:00Z").unwrap().standing.is_none());
    }
    #[test]
    fn installed_incarnon_survives_consumed_adapter() {
        let mut v=raw();
        v["Melee"]=json!([
            {"ItemType":"/Lotus/Weapons/Test/OkinaPrime","SkillTree":"01234"},
            {"ItemType":"/Lotus/Weapons/Test/Other","SkillTree":""}
        ]);
        let out=from_value(&v,&crate::collection::catalog().unwrap(),None,"test","2026-10-23T00:00:00Z").unwrap();
        let installed=out.incarnon.unwrap();
        assert!(installed.contains("/Lotus/Weapons/Test/OkinaPrime"));
        assert!(!installed.contains("/Lotus/Weapons/Test/Other"));
        assert_eq!(installed.len(),1);
    }
    #[test]
    fn archon_instances_flow_through_snapshot_without_false_empty_slot_flags() {
        let mut v=raw();
        v["Suits"]=json!([
            {"ItemType":"/Lotus/Powersuits/Excalibur/Excalibur","ItemId":{"$oid":"one"},"ArchonCrystalUpgrades":[null,{"Color":"ACC_NONE"}]},
            {"ItemType":"/Lotus/Powersuits/Excalibur/Excalibur","ItemId":{"$oid":"two"},"ArchonCrystalUpgrades":[null,{"Color":"ACC_RED_MYTHIC","UpgradeType":"/Lotus/TestEffect"}]}
        ]);
        let cat=crate::collection::catalog().unwrap();
        let out=from_value(&v,&cat,None,"test","2026-10-24T00:00:00Z").unwrap();
        let saved=serde_json::to_value(&out).unwrap();
        assert_eq!(saved["archonShardFrames"][1]["instanceId"],"two");
        assert!(saved["archonShardFrames"][1]["slots"][0].is_null());
        assert_eq!(out.archon_shards.as_ref().unwrap().len(),1);
        v["Suits"][1]["ArchonCrystalUpgrades"]=json!([]);
        assert!(from_value(&v,&cat,None,"test","2026-10-24T00:00:00Z").unwrap().archon_shards.unwrap().is_empty());
        v["Suits"][1].as_object_mut().unwrap().remove("ArchonCrystalUpgrades");
        let unknown=from_value(&v,&cat,None,"test","2026-10-24T00:00:00Z").unwrap();
        assert!(unknown.archon_shards.is_none());
        assert!(unknown.archon_shard_frames.unwrap()[1].slots.is_none());
    }
    #[test]
    fn account_profile_and_intrinsics_keep_unknown_distinct_from_zero() {
        let cat = crate::collection::catalog().unwrap();
        let mut v = raw();
        v["DisplayName"] = json!("Tenno");
        v["PremiumCredits"] = json!("31557");
        v["FusionPoints"] = json!(974720);
        v["MiscItems"] =
            json!([{"ItemType":"/Lotus/Types/Items/MiscItems/PrimeBucks","ItemCount":41}]);
        v["PlayerSkills"] = json!({"LPS_TACTICAL":10,"LPS_PILOTING":10,"LPS_GUNNERY":10,"LPS_ENGINEERING":10,"LPS_COMMAND":10,"LPS_DRIFT_COMBAT":0});
        let out = from_value(&v, &cat, None, "test", "2026-10-23T00:00:00Z").unwrap();
        assert!(!out.complete);
        let p = out.player_profile.unwrap();
        assert_eq!(p.name.as_deref(), Some("Tenno"));
        assert_eq!(p.platinum, Some(31557));
        assert_eq!(p.endo, Some(974720));
        assert_eq!(p.ducats, Some(41));
        let a = out.mastery_account.unwrap();
        assert!(a.ranks_complete);
        assert_eq!(a.railjack.unwrap().current, 50);
        assert!(a.duviri.is_none());
        assert!(a.total_xp.is_none());
        assert!(a.star_normal.is_none());
        for bad in [
            json!(-1),
            json!(1.5),
            json!("garbage"),
            json!(1_000_000_000_001_u64),
        ] {
            v["PremiumCredits"] = bad;
            assert!(from_value(&v, &cat, None, "test", "2026-10-23T00:00:00Z").is_err());
        }
        v["PremiumCredits"] = json!(0);
        v["PlayerSkills"]["LPS_TACTICAL"] = json!(11);
        assert!(from_value(&v, &cat, None, "test", "2026-10-23T00:00:00Z").is_err());
    }
    #[test]
    fn duplicates_blueprints_xp_and_secrets() {
        let cat = crate::collection::catalog().unwrap();
        let item = cat
            .items
            .iter()
            .find(|i| i.max_rank == 30 && i.xp_per_rank == 200)
            .unwrap();
        let mut raw = raw();
        raw["MiscItems"] = json!([{"ItemType":"/Lotus/Unknown/FutureItem","ItemCount":2},{"ItemType":"/Lotus/Unknown/FutureItem","ItemCount":3}]);
        raw["Recipes"] = json!([{"ItemType":"/Lotus/Test/Blueprint","ItemCount":0}]);
        raw["XPInfo"] = json!([{"ItemType":item.id,"XP":900000}]);
        raw["AccountId"] = json!("private-account");
        raw["SessionKey"] = json!("secret");
        let result = from_value(&raw, &cat, None, "game-memory", "2026-10-23T00:00:00Z").unwrap();
        assert_eq!(result.counts["/Lotus/Unknown/FutureItem"], 5);
        assert_eq!(result.counts["/Lotus/Test/Blueprint"], 1);
        assert_eq!(result.ranks[&item.id], 30);
        assert_eq!(crate::collection::count(&result, &item.id), None);
        let serialized = serde_json::to_string(&result).unwrap();
        assert!(!serialized.contains("secret"));
        assert!(!serialized.contains("private-account"));
    }
    #[test]
    fn rejects_partial_and_preserves_favorites() {
        let cat = crate::collection::catalog().unwrap();
        assert!(from_value(
            &json!({"MiscItems":[]}),
            &cat,
            None,
            "game-memory",
            "2026-10-23T00:00:00Z"
        )
        .is_err());
        let mut old = Snapshot::default();
        old.favorites.insert("favorite".into());
        let out = from_value(
            &raw(),
            &cat,
            Some(&old),
            "alecaframe-cache",
            "2026-10-23T00:00:00Z",
        )
        .unwrap();
        assert!(out.favorites.contains("favorite"));
    }
    #[cfg(windows)]
    #[test]
    fn decrypts_reference_aes_cbc_pkcs7() {
        let cipher = [
            140, 9, 219, 192, 78, 84, 106, 221, 168, 231, 121, 118, 127, 40, 138, 56, 37, 83, 131,
            7, 59, 130, 50, 72, 152, 174, 137, 226, 62, 48, 153, 246,
        ];
        assert_eq!(decrypt(&cipher).unwrap(), br#"{"test":"cache-format"}"#);
    }
    #[test]
    fn real_local_cache_if_present() {
        let Some(local) = std::env::var_os("LOCALAPPDATA") else {
            return;
        };
        let path = std::path::PathBuf::from(local).join("AlecaFrame/lastData.dat");
        if !path.exists() {
            return;
        }
        let value = read_cache(&path).expect("existing cache decrypts");
        let result = from_value(
            &value,
            &crate::collection::catalog().unwrap(),
            None,
            "alecaframe-cache",
            "2026-10-23T00:00:00Z",
        )
        .expect("existing cache normalizes");
        eprintln!(
            "mastery aggregate={}",
            serde_json::to_string(&result.mastery_account).unwrap()
        );
        eprintln!(
            "cache verified: count_entries={}, rank_entries={}, complete={}, timestamp={}",
            result.counts.len(),
            result.ranks.len(),
            result.complete,
            result.captured_at
        );
    }
    #[test]
    fn upgrade_rank_counts_preserve_stacks_instances_and_unknown_fingerprints() {
        let v = json!({"RawUpgrades":[{"ItemType":"/Lotus/Mod","ItemCount":20}],"Upgrades":[
            {"ItemType":"/Lotus/Mod","UpgradeFingerprint":"{\"lvl\":10}"},
            {"ItemType":"/Lotus/Mod","UpgradeFingerprint":"{\"lvl\":5}"},
            {"ItemType":"/Lotus/Broken","UpgradeFingerprint":"broken"},
            {"ItemType":"/Lotus/Broken","UpgradeFingerprint":"{\"lvl\":0}"}
        ]});
        let counts = upgrade_counts_by_rank(&v).unwrap().unwrap();
        let ranks = counts["/Lotus/Mod"].as_ref().unwrap();
        assert_eq!(ranks[&0], 20); assert_eq!(ranks[&5], 1); assert_eq!(ranks[&10], 1);
        assert!(counts["/Lotus/Broken"].is_none());
        assert!(upgrade_counts_by_rank(&json!({"RawUpgrades":[]})).unwrap().is_none());
        assert!(upgrade_counts_by_rank(&json!({"RawUpgrades":[],"Upgrades":[]})).unwrap().unwrap().is_empty());
    }
    #[test]
    fn complete_requires_every_owned_group_and_counts_ranked_mods() {
        let mut v = raw();
        for key in EQUIPMENT.iter().chain(STACKS.iter()) {
            v[*key] = json!([]);
        }
        v["Upgrades"] = json!([{"ItemType":"/Lotus/Upgrades/Test","ItemCount":0,"UpgradeFingerprint":"ranked"},{"ItemType":"/Lotus/Upgrades/Test","ItemCount":0}]);
        let cat = crate::collection::catalog().unwrap();
        let out = from_value(&v, &cat, None, "game-memory", "2026-10-23T00:00:00Z").unwrap();
        assert!(out.complete);
        assert_eq!(out.counts["/Lotus/Upgrades/Test"], 2);
        assert!(out.upgrade_counts_by_rank.as_ref().unwrap()["/Lotus/Upgrades/Test"].is_none());
        let serialized = serde_json::to_string(&out).unwrap();
        assert!(serialized.contains("upgradeCountsByRank"));
        let restored = crate::collection::parse(&serialized).unwrap();
        assert_eq!(restored.upgrade_counts_by_rank, out.upgrade_counts_by_rank);
        v.as_object_mut().unwrap().remove("MechSuits");
        let out = from_value(&v, &cat, None, "game-memory", "2026-10-23T00:00:00Z").unwrap();
        assert!(!out.complete);
        assert_eq!(
            crate::collection::count(&out, "/Lotus/Powersuits/EntratiMech"),
            None
        );
    }
    #[test]
    fn invalid_sync_uses_fallback() {
        let mut v = raw();
        v["LastInventorySync"] = json!({"$oid":"bad"});
        let out = from_value(
            &v,
            &crate::collection::catalog().unwrap(),
            None,
            "game-memory",
            "2026-10-23T00:00:00Z",
        )
        .unwrap();
        assert_eq!(out.captured_at, "2026-10-23T00:00:00Z");
    }
    #[test]
    fn account_identity_controls_favorite_inheritance_including_envelopes(){
        let cat=crate::collection::catalog().unwrap();let mut value=raw();value["AccountId"]=json!("private-A");
        let mut a=from_value(&value,&cat,None,"test","2026-01-01T00:00:00Z").unwrap();a.favorites.insert("/Lotus/Test/Favorite".into());
        let same=from_value(&value,&cat,Some(&a),"test","2026-01-01T00:00:00Z").unwrap();assert_eq!(same.favorites,a.favorites);
        value["AccountId"]=json!("private-B");let other=from_value(&value,&cat,Some(&a),"test","2026-01-01T00:00:00Z").unwrap();assert!(other.favorites.is_empty());assert_ne!(other.account_scope,a.account_scope);
        value.as_object_mut().unwrap().remove("AccountId");let unknown=from_value(&value,&cat,Some(&a),"test","2026-01-01T00:00:00Z").unwrap();assert!(unknown.favorites.is_empty());assert!(unknown.account_scope.is_none());
        let envelope=json!({"AccountId":"private-A","InventoryJSON":value.to_string()});let same=from_value(&envelope,&cat,Some(&a),"test","2026-01-01T00:00:00Z").unwrap();assert_eq!(same.account_scope,a.account_scope);assert_eq!(same.favorites,a.favorites);
        assert!(!serde_json::to_string(&same).unwrap().contains("private-A"));
    }
    #[test]
    fn rank_distribution_keeps_arcane_entries_and_marks_bad_fingerprints_unknown(){
        let mut value=raw();value["RawUpgrades"]=json!([{"ItemType":"/Lotus/Upgrades/Arcanes/TestArcane","ItemCount":2}]);value["Upgrades"]=json!([{"ItemType":"/Lotus/Upgrades/Arcanes/TestArcane","UpgradeFingerprint":"{\"lvl\":3}"},{"ItemType":"/Lotus/Upgrades/Arcanes/UnknownArcane","UpgradeFingerprint":"invalid"}]);
        let counts=upgrade_counts_by_rank(&value).unwrap().unwrap();let arcane=counts["/Lotus/Upgrades/Arcanes/TestArcane"].as_ref().unwrap();assert_eq!(arcane[&0],2);assert_eq!(arcane[&3],1);assert_eq!(counts["/Lotus/Upgrades/Arcanes/UnknownArcane"],None);
    }

}

#[cfg(test)]mod tradable_equipment_tests{use super::*;use serde_json::json;#[test]fn only_explicit_instance_xp_zero_counts(){let catalog=crate::collection::catalog().unwrap();let id="/Lotus/Sentinels/Shade/PrismaShadePowerSuit";let values=json!({"Sentinels":[{"ItemType":id,"XP":0},{"ItemType":id,"XP":900000}],"XPInfo":[{"ItemType":id,"XP":900000}]});assert_eq!(unranked_equipment_counts(&values,&catalog).get(id),Some(&Some(1)));let missing=json!({"Sentinels":[{"ItemType":id}]});assert_eq!(unranked_equipment_counts(&missing,&catalog).get(id),Some(&None));let absent=unranked_equipment_counts(&json!({}),&catalog);assert!(!absent.contains_key(id));}}

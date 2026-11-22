//! Opt-in helper diagnostic. Never prints raw account data or helper stdout.
#![allow(dead_code)]
#[path = "../account_scope.rs"]
mod account_scope;
#[path = "../acquisition.rs"]
mod acquisition;
#[path = "../account_mastery.rs"]
mod account_mastery;
#[path = "../collection.rs"]
mod collection;
#[path = "../helper_inventory.rs"]
mod helper_inventory;
#[path = "../inventory_data.rs"]
mod inventory_data;
#[path = "../player_identity.rs"]
mod player_identity;
#[path = "../riven_inventory.rs"]
mod riven_inventory;
#[path = "../resource_queue_diagnostic.rs"]
mod resource_queue_diagnostic;
#[path = "../archon_diagnostic.rs"]
mod archon_diagnostic;

fn default_ee_log_path() -> std::path::PathBuf {
    std::env::var_os("LOCALAPPDATA")
        .map(std::path::PathBuf::from)
        .unwrap_or_default()
        .join("Warframe/EE.log")
}

fn parse_cli_paths(
    args: &[std::ffi::OsString],
) -> Result<(Option<std::path::PathBuf>, Option<std::path::PathBuf>), String> {
    let mut exe = None;
    let mut ee_log = None;
    let mut iter = args.iter();
    while let Some(arg) = iter.next() {
        let s = arg.to_string_lossy();
        if s == "--ee-log" {
            let value = iter.next().ok_or("missing path after --ee-log")?;
            ee_log = Some(std::path::PathBuf::from(value));
        } else if let Some(rest) = s.strip_prefix("--ee-log=") {
            if rest.is_empty() {
                return Err("missing path after --ee-log=".into());
            }
            ee_log = Some(std::path::PathBuf::from(rest));
        } else if !s.starts_with("--") && exe.is_none() {
            exe = Some(std::path::PathBuf::from(arg));
        }
    }
    Ok((exe, ee_log))
}

/// Unwraps legacy InventoryJSON envelopes and fills DisplayName from EE.log when the API omits it.
fn unwrap_and_enrich_display_name(
    raw: &serde_json::Value,
    ee_login: Option<&player_identity::LoginIdentity>,
) -> (serde_json::Value, &'static str) {
    let mut value = raw.clone();
    let verified_account = value.get("AccountId").cloned();
    for key in ["InventoryJSON", "InventoryJson"] {
        if value[key].is_object() {
            value = value[key].take();
            break;
        }
        if let Some(text) = value[key].as_str() {
            if let Ok(inner) = serde_json::from_str::<serde_json::Value>(text) {
                value = inner;
            }
            break;
        }
    }
    if let Some(account) = verified_account {
        value["AccountId"] = account;
    }
    let has_api_name = value
        .get("DisplayName")
        .and_then(serde_json::Value::as_str)
        .is_some_and(|name| !name.trim().is_empty());
    if has_api_name {
        return (value, "api");
    }
    if let Some(identity) = ee_login.filter(|id| !id.name.trim().is_empty()) {
        value["DisplayName"] = serde_json::Value::String(identity.name.clone());
        return (value, "ee_log");
    }
    (value, "missing")
}

/// Summarizes normalized profile completeness without leaking raw names or currency balances.
fn summarize_player_profile(
    snapshot: &collection::Snapshot,
    display_name_source: &str,
    ee_log_found: bool,
    ee_login_detected: bool,
) -> serde_json::Value {
    let profile = snapshot.player_profile.as_ref();
    let has_display_name = profile
        .and_then(|p| p.name.as_deref())
        .is_some_and(|s| !s.trim().is_empty());
    let has_mastery_rank = snapshot.mastery_rank.is_some();
    let platinum = profile.and_then(|p| p.platinum).is_some();
    let credits = snapshot.credits.is_some();
    let ducats = profile.and_then(|p| p.ducats).is_some();
    let endo = profile.and_then(|p| p.endo).is_some();
    let profile_complete =
        has_display_name && has_mastery_rank && platinum && credits && ducats && endo;
    serde_json::json!({
        "hasDisplayName": has_display_name,
        "displayNameSource": display_name_source,
        "eeLogFound": ee_log_found,
        "eeLogLoginDetected": ee_login_detected,
        "hasMasteryRank": has_mastery_rank,
        "currenciesPresent": {
            "platinum": platinum,
            "credits": credits,
            "ducats": ducats,
            "endo": endo,
        },
        "profileComplete": profile_complete,
    })
}

fn acquisition_decision_code(snapshot: &collection::Snapshot) -> &'static str {
    match acquisition::choose(None, snapshot, false) {
        acquisition::Decision::Accept => "accept",
        acquisition::Decision::Unchanged => "unchanged",
        other => other.rejection_code().unwrap_or("rejected"),
    }
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args_os().skip(1).collect();
    let twice = args.iter().any(|a| a == "--twice");
    let compatibility = args.iter().any(|a| a == "--compatibility");
    let (exe_arg, ee_log_arg) = parse_cli_paths(&args)?;
    let exe = exe_arg
        .or_else(helper_inventory::resolve_executable)
        .ok_or("helper missing")?;
    let ee_log_path = ee_log_arg.unwrap_or_else(default_ee_log_path);
    let pid = helper_inventory::game_pid().ok_or("game-not-running")?;
    let catalog = collection::catalog()?;
    let mut client = helper_inventory::Client::new();
    for pass in 1..=if twice { 2 } else { 1 } {
        let start = std::time::Instant::now();
        let raw = if compatibility && pass == 1 {
            client.recover_compatibility(pid, || false)?
        } else {
            client.refresh(Some(&exe), pid, || false)?
        };
        let ee_log_found = ee_log_path.is_file();
        let ee_login = player_identity::read(&ee_log_path);
        let (enriched, display_name_source) =
            unwrap_and_enrich_display_name(&raw, ee_login.as_ref());
        let snapshot = inventory_data::from_value(
            &enriched,
            &catalog,
            None,
            "warframe-api-helper",
            &chrono::Utc::now().to_rfc3339(),
        )?;
        if args.iter().any(|a| a == "--standing-vendors") {
            let inner = raw.get("InventoryJSON").or_else(|| raw.get("InventoryJson")).and_then(|v|v.as_str()).and_then(|s|serde_json::from_str::<serde_json::Value>(s).ok());
            let data = inner.as_ref().unwrap_or(&raw);
            let standing: serde_json::Map<String,serde_json::Value> = data.as_object().into_iter().flatten().filter(|(k,_)| k.starts_with("DailyAffiliation")).map(|(k,v)|(k.clone(),v.clone())).collect();
            let affiliations: Vec<_> = data["Affiliations"].as_array().into_iter().flatten().map(|v|serde_json::json!({"Tag":v["Tag"],"Standing":v["Standing"],"Title":v["Title"]})).collect();
            println!("{}",serde_json::json!({"standingFields":standing,"affiliations":affiliations,"aya":collection::count(&snapshot,"/Lotus/Types/Items/MiscItems/SchismKey")}));
            for (id,vendor) in collection::vendor_data::MANIFESTS {
                match client.vendor_info(vendor,||false).and_then(|value|{if id=="teshin"{let rows:Vec<_>=value["VendorInfo"]["ItemManifest"].as_array().into_iter().flatten().map(|o|serde_json::json!({"item":o["StoreItem"],"expiry":o["Expiry"],"activation":o["Activation"],"bin":o["Bin"],"quantity":o["QuantityMultiplier"],"keys":o.as_object().map(|m|m.keys().collect::<Vec<_>>())})).collect();println!("{}",serde_json::json!({"teshinDisplayFields":rows}));}collection::vendor_data::normalize(id,&value,&chrono::Utc::now().to_rfc3339())}) {
                    Ok(value)=>println!("{}",serde_json::json!({"vendor":id,"offers":value.offers.len(),"expiry":value.expiry,"prices":value.offers.iter().map(|o|&o.prices).collect::<Vec<_>>()})),
                    Err(code)=>println!("{}",serde_json::json!({"vendor":id,"error":code})),
                }
            }
        }
        if args.iter().any(|a| a == "--resource-queue") {
            println!("{}",serde_json::json!({"resourceQueue":resource_queue_diagnostic::summarize(&snapshot)?,"pass":pass}));
        }
        if args.iter().any(|a| a == "--archon-shards") {
            println!("{}",serde_json::json!({"archonShards":archon_diagnostic::summarize(&snapshot)?,"pass":pass}));
        }
        println!(
            "{}",
            serde_json::json!({
                "status":"inventory-retrieved",
                "accountBound":snapshot.account_scope.as_ref().is_some_and(|s|s.starts_with("acct-v1-")),
                "pass":pass,
                "source":snapshot.source,
                "capturedAt":snapshot.captured_at,
                "complete":snapshot.complete,
                "missingOwnedGroups":snapshot.missing_owned_groups,
                "inventoryAvailable":snapshot.inventory_available(),
                "acquisitionDecision":acquisition_decision_code(&snapshot),
                "playerProfile":summarize_player_profile(&snapshot,display_name_source,ee_log_found,ee_login.is_some()),
                "countEntries":snapshot.counts.len(),
                "rankEntries":snapshot.ranks.len(),
                "pendingRecipesKnown":snapshot.pending_recipes.is_some(),
                "pendingRecipeKinds":snapshot.pending_recipes.as_ref().map(|rows|rows.len()),
                "pendingRecipeJobs":snapshot.pending_recipes.as_ref().map(|rows|rows.values().sum::<u64>()),
                "elapsedMs":start.elapsed().as_millis(),
                "transport":client.transport(),
                "sessionRetained":client.has_session()
            })
        );
        if twice && pass == 1 {
            std::thread::sleep(std::time::Duration::from_secs(2));
        }
    }
    client.reset();
    Ok(())
}
fn shape(value: &serde_json::Value, depth: usize) -> serde_json::Value {
    if depth > 7 { return serde_json::json!("depth-limit"); }
    match value {
        serde_json::Value::Object(fields) => serde_json::Value::Object(fields.iter().map(|(k,v)| (k.clone(),shape(v,depth+1))).collect()),
        serde_json::Value::Array(items) => serde_json::json!({"length":items.len(),"first":items.first().map(|v|shape(v,depth+1))}),
        serde_json::Value::String(_) => serde_json::json!("string"),
        serde_json::Value::Number(_) => serde_json::json!("number"),
        serde_json::Value::Bool(_) => serde_json::json!("boolean"),
        _ => serde_json::Value::Null,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    const ALL_OWNED_GROUPS: &[&str] = &[
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
        "MiscItems",
        "RawUpgrades",
        "Recipes",
        "Consumables",
        "LevelKeys",
        "FlavourItems",
        "WeaponSkins",
    ];

    fn complete_raw_payload() -> serde_json::Value {
        let mut payload = json!({
            "AccountId": "507f1f77bcf86cd799439011",
            "DisplayName": "SecretTennoName",
            "PlayerLevel": 35,
            "RegularCredits": 136090000,
            "PremiumCredits": 31557,
            "FusionPoints": 974720,
            "LastInventorySync": {"$oid": "650000000000000000000000"},
            "XPInfo": [],
        });
        for group in ALL_OWNED_GROUPS {
            payload[*group] = json!([]);
        }
        payload["MiscItems"] =
            json!([{"ItemType": "/Lotus/Types/Items/MiscItems/PrimeBucks", "ItemCount": 41}]);
        payload
    }

    #[test]
    fn api_display_name_takes_precedence_and_redacts_raw_values() {
        let raw = complete_raw_payload();
        let cat = collection::catalog().unwrap();
        let (enriched, source) = unwrap_and_enrich_display_name(&raw, None);
        assert_eq!(source, "api");
        let snapshot = inventory_data::from_value(
            &enriched,
            &cat,
            None,
            "warframe-api-helper",
            &chrono::Utc::now().to_rfc3339(),
        )
        .unwrap();
        let summary = summarize_player_profile(&snapshot, source, false, false);
        assert_eq!(summary["hasDisplayName"], true);
        assert_eq!(summary["displayNameSource"], "api");
        assert_eq!(summary["hasMasteryRank"], true);
        assert_eq!(summary["currenciesPresent"]["platinum"], true);
        assert_eq!(summary["currenciesPresent"]["credits"], true);
        assert_eq!(summary["currenciesPresent"]["ducats"], true);
        assert_eq!(summary["currenciesPresent"]["endo"], true);
        assert_eq!(summary["profileComplete"], true);
        assert_eq!(acquisition_decision_code(&snapshot), "accept");

        let serialized = summary.to_string();
        for secret in ["SecretTennoName", "136090000", "31557", "974720", "41", "507f1f77bcf86cd799439011"] {
            assert!(
                !serialized.contains(secret),
                "redacted summary leaked raw value {secret}: {serialized}"
            );
        }
    }

    #[test]
    fn ee_log_fallback_fills_missing_api_display_name_without_leaking_name() {
        let log_path = std::env::temp_dir().join(format!(
            "myframe-probe-ee-{}-{}.log",
            std::process::id(),
            chrono::Utc::now().timestamp_nanos_opt().unwrap_or(0)
        ));
        std::fs::write(
            &log_path,
            b"12.5 Sys [Info]: Logged in SecretTennoName (private)\n",
        )
        .unwrap();

        let ee_login = player_identity::read(&log_path);
        assert!(ee_login.is_some());

        let mut raw = complete_raw_payload();
        raw.as_object_mut().unwrap().remove("DisplayName");

        let (enriched, source) = unwrap_and_enrich_display_name(&raw, ee_login.as_ref());
        assert_eq!(source, "ee_log");
        let cat = collection::catalog().unwrap();
        let snapshot = inventory_data::from_value(
            &enriched,
            &cat,
            None,
            "warframe-api-helper",
            &chrono::Utc::now().to_rfc3339(),
        )
        .unwrap();
        let summary = summarize_player_profile(&snapshot, source, log_path.is_file(), ee_login.is_some());
        assert_eq!(summary["hasDisplayName"], true);
        assert_eq!(summary["displayNameSource"], "ee_log");
        assert_eq!(summary["eeLogFound"], true);
        assert_eq!(summary["eeLogLoginDetected"], true);
        assert_eq!(summary["profileComplete"], true);
        assert!(!summary.to_string().contains("SecretTennoName"));

        let args = vec![
            std::ffi::OsString::from("--ee-log"),
            log_path.as_os_str().to_os_string(),
        ];
        let (exe_arg, parsed_ee) = parse_cli_paths(&args).unwrap();
        assert!(exe_arg.is_none());
        assert_eq!(parsed_ee.as_deref(), Some(log_path.as_path()));

        let _ = std::fs::remove_file(log_path);
    }

    #[test]
    fn missing_name_and_currencies_report_incomplete_profile() {
        let mut raw = complete_raw_payload();
        let map = raw.as_object_mut().unwrap();
        map.remove("DisplayName");
        map.remove("PlayerLevel");
        map.remove("RegularCredits");
        map.remove("PremiumCredits");
        map.remove("FusionPoints");

        let (enriched, source) = unwrap_and_enrich_display_name(&raw, None);
        assert_eq!(source, "missing");
        let cat = collection::catalog().unwrap();
        let snapshot = inventory_data::from_value(
            &enriched,
            &cat,
            None,
            "warframe-api-helper",
            &chrono::Utc::now().to_rfc3339(),
        )
        .unwrap();
        let summary = summarize_player_profile(&snapshot, source, false, false);
        assert_eq!(summary["hasDisplayName"], false);
        assert_eq!(summary["displayNameSource"], "missing");
        assert_eq!(summary["hasMasteryRank"], false);
        assert_eq!(summary["currenciesPresent"]["platinum"], false);
        assert_eq!(summary["currenciesPresent"]["credits"], false);
        assert_eq!(summary["currenciesPresent"]["endo"], false);
        assert_eq!(summary["currenciesPresent"]["ducats"], true);
        assert_eq!(summary["profileComplete"], false);
    }

    #[test]
    fn wrapped_inventory_json_envelope_preserves_account_and_profile() {
        let inner = complete_raw_payload();
        let envelope = json!({
            "AccountId": "507f1f77bcf86cd799439011",
            "InventoryJSON": inner.to_string(),
        });
        let (enriched, source) = unwrap_and_enrich_display_name(&envelope, None);
        assert_eq!(source, "api");
        let cat = collection::catalog().unwrap();
        let snapshot = inventory_data::from_value(
            &enriched,
            &cat,
            None,
            "warframe-api-helper",
            &chrono::Utc::now().to_rfc3339(),
        )
        .unwrap();
        assert!(snapshot
            .account_scope
            .as_ref()
            .is_some_and(|s| s.starts_with("acct-v1-")));
        assert_eq!(acquisition_decision_code(&snapshot), "accept");
        let summary = summarize_player_profile(&snapshot, source, false, false);
        assert_eq!(summary["profileComplete"], true);
    }
}

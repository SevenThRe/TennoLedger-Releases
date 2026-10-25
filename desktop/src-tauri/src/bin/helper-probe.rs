//! Opt-in helper diagnostic. Never prints raw account data or helper stdout.
#![allow(dead_code)]
#[path = "../account_scope.rs"]
mod account_scope;
#[path = "../account_mastery.rs"]
mod account_mastery;
#[path = "../collection.rs"]
mod collection;
#[path = "../helper_inventory.rs"]
mod helper_inventory;
#[path = "../inventory_data.rs"]
mod inventory_data;
#[path = "../riven_inventory.rs"]
mod riven_inventory;
#[path = "../resource_queue_diagnostic.rs"]
mod resource_queue_diagnostic;
#[path = "../archon_diagnostic.rs"]
mod archon_diagnostic;
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args_os().skip(1).collect();
    let twice = args.iter().any(|a| a == "--twice");
    let compatibility = args.iter().any(|a| a == "--compatibility");
    let exe = args
        .iter()
        .find(|a| !a.to_string_lossy().starts_with("--"))
        .map(std::path::PathBuf::from)
        .or_else(helper_inventory::resolve_executable)
        .ok_or("helper missing")?;
    let pid = helper_inventory::game_pid().ok_or("game-not-running")?;
    let catalog = collection::catalog()?;
    let mut client = helper_inventory::Client::new();
    for pass in 1..=if twice { 2 } else { 1 } {
        let start = std::time::Instant::now();
        let raw = if compatibility && pass == 1 {
            client.recover_compatibility(pid, || false)?
        } else {
            client.refresh(&exe, pid, || false)?
        };
        let snapshot = inventory_data::from_value(
            &raw,
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
            serde_json::json!({"status":"inventory-retrieved","accountBound":snapshot.account_scope.as_ref().is_some_and(|s|s.starts_with("acct-v1-")),"pass":pass,"source":snapshot.source,"capturedAt":snapshot.captured_at,"complete":snapshot.complete,"countEntries":snapshot.counts.len(),"rankEntries":snapshot.ranks.len(),"pendingRecipesKnown":snapshot.pending_recipes.is_some(),"pendingRecipeKinds":snapshot.pending_recipes.as_ref().map(|rows|rows.len()),"pendingRecipeJobs":snapshot.pending_recipes.as_ref().map(|rows|rows.values().sum::<u64>()),"elapsedMs":start.elapsed().as_millis(),"transport":client.transport(),"sessionRetained":client.has_session()})
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

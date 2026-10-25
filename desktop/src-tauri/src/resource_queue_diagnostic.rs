//! Aggregate-only diagnostic for captured crafting queues. Only matched public catalog identities are returned, never raw account payloads.
use crate::collection::Snapshot;
use serde_json::{json, Value};
use std::collections::BTreeSet;

pub fn summarize(snapshot: &Snapshot) -> Result<Value, String> {
    let index: Value = serde_json::from_str(include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/../public/resource-index.json"))).map_err(|_| "resource-index-invalid")?;
    let serialized = serde_json::to_value(snapshot).map_err(|_| "snapshot-serialize-failed")?;
    let restored: Snapshot = serde_json::from_value(serialized.clone()).map_err(|_| "snapshot-deserialize-failed")?;
    let roundtrip = restored.pending_recipes == snapshot.pending_recipes
        && serialized.get("pendingRecipes") == Some(&serde_json::to_value(&snapshot.pending_recipes).map_err(|_| "queue-serialize-failed")?);
    let Some(queue) = snapshot.pending_recipes.as_ref() else {
        return Ok(json!({"known":false,"roundtrip":roundtrip}));
    };
    let blueprints: BTreeSet<&str> = index["blueprintIds"].as_array().ok_or("blueprint-index-invalid")?.iter().filter_map(Value::as_str).collect();
    let recipes = index["recipes"].as_object().ok_or("recipe-index-invalid")?;
    let public_catalog: Value=serde_json::from_str(include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/../public/catalog.json"))).map_err(|_|"catalog-invalid")?;
    let mut unresolved_labels=Vec::new();
    let mut resolved = 0usize;
    let mut unresolved = 0usize;
    let mut output_units = 0u64;
    let mut reusable_jobs = 0u64;
    for (id, jobs) in queue {
        let mut matches: Vec<_> = recipes.values().filter_map(|recipe| {
            if !blueprints.contains(id.as_str()) { return None; }
            let part = recipe["parts"].as_array()?.iter().find(|part| part["itemId"].as_str() == Some(id.as_str()))?;
            Some((recipe,part))
        }).collect();
        if matches.is_empty() {
            if let Some(mapping)=index["pendingRecipeOutputs"].get(id) {matches.push((mapping,mapping));}
        }
        if matches.len()!=1 {
            unresolved+=1;
            let label=public_catalog["items"].as_array().and_then(|rows|rows.iter().find(|row|row["id"].as_str()==Some(id.as_str()))).and_then(|row|row["name"].as_str()).unwrap_or("Not in public catalog");
            let owners: Vec<_>=public_catalog["items"].as_array().into_iter().flatten().filter(|row|row["recipe"]["parts"].as_array().is_some_and(|parts|parts.iter().any(|part|part["itemId"].as_str()==Some(id.as_str())))).filter_map(|row|row["name"].as_str()).collect();
            let catalog_id=public_catalog["items"].as_array().and_then(|rows|rows.iter().find(|row|row["id"].as_str()==Some(id.as_str()))).and_then(|row|row["id"].as_str());
            unresolved_labels.push(json!({"catalogName":label,"catalogId":catalog_id,"catalogOwners":owners,"matchingRecipes":matches.len()}));
            continue;
        }
        let (recipe,part)=matches[0];
        let amount=recipe["output"].as_u64().and_then(|n| n.checked_mul(*jobs)).filter(|n|*n>0);
        let Some(total)=amount.and_then(|n|output_units.checked_add(n)) else {unresolved+=1;continue;};
        output_units=total;
        resolved+=1;
        if part["reusable"].as_bool()==Some(true) {reusable_jobs+=jobs;}
    }
    Ok(json!({"known":true,"roundtrip":roundtrip,"blueprintKinds":queue.len(),"resolvedKinds":resolved,"unresolvedKinds":unresolved,"unresolvedCatalogLabels":unresolved_labels,"outputUnits":output_units,"reusableBlueprintJobs":reusable_jobs}))
}

#[cfg(test)]
#[path="../inventory_data.rs"] mod inventory_data;
#[path="../riven_inventory.rs"] mod riven_inventory;
#[path = "../account_mastery.rs"] mod account_mastery;
// Explicit developer fixture exporter; never reads the user's application database.
#[path = "../collection.rs"]
mod collection;
#[path = "../workshop.rs"]
mod workshop;
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args().collect();
    if args.len() != 4 {
        return Err("usage: workshop-fixture SNAPSHOT ITEM_ID OUTPUT_DIR".into());
    }
    let c = collection::catalog()?;
    let s = collection::parse(&std::fs::read_to_string(&args[1])?)?;
    let p = workshop::build(&c, &s, &args[2], 1)?;
    let output = std::path::Path::new(&args[3]);
    std::fs::create_dir_all(output)?;
    std::fs::write(
        output.join("workshop-tree.json"),
        serde_json::to_string_pretty(&p)?,
    )?;
    let mut readiness = std::collections::BTreeMap::new();
    for i in &c.items {
        if i.recipe.is_some() {
            readiness.insert(
                i.id.clone(),
                collection::plan(&c, &s, &i.id, 1)?.materials_ready,
            );
        }
    }
    std::fs::write(
        output.join("workshop-readiness.json"),
        serde_json::to_string(&readiness)?,
    )?;
    Ok(())
}

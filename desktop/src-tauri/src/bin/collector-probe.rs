//! Read-only diagnostics: no database writes, raw JSON, account identifiers or memory dumps.
#![allow(dead_code)]
#[path="../riven_inventory.rs"] mod riven_inventory;
#[path = "../account_mastery.rs"] mod account_mastery;
#[path="../collection.rs"] mod collection;
#[path="../inventory_data.rs"] mod inventory_data;
#[path="../memory_inventory.rs"] mod memory_inventory;
fn main()->Result<(),Box<dyn std::error::Error>> {
    let args:Vec<_>=std::env::args().collect();
    let seconds=args.windows(2).find(|a|a[0]=="--seconds").and_then(|a|a[1].parse::<u64>().ok()).unwrap_or(30).clamp(1,300);
    let mut scanner=memory_inventory::Scanner::new();
    let catalog=collection::catalog()?;
    let mut last_digest=None;let mut changes=0u32;
    let deadline=std::time::Instant::now()+std::time::Duration::from_secs(seconds);
    loop {
        match scanner.poll(){
            Ok(Some(v))=>{
                match inventory_data::from_value(&v,&catalog,None,"game-memory",&chrono::Utc::now().to_rfc3339()) {
                    Ok(s)=>{
                        use std::hash::{Hash,Hasher};let mut hash=std::collections::hash_map::DefaultHasher::new();s.counts.hash(&mut hash);s.ranks.hash(&mut hash);s.credits.hash(&mut hash);let digest=hash.finish();
                        if last_digest.is_some_and(|old|old!=digest){changes+=1;}last_digest=Some(digest);
                        println!("{}",serde_json::json!({"status":"candidate-found","source":s.source,"capturedAt":s.captured_at,"complete":s.complete,"countEntries":s.counts.len(),"rankEntries":s.ranks.len(),"contentDigest":format!("{digest:016x}"),"changes":changes,"scan":scanner.stats}));
                    },Err(reason)=>println!("{}",serde_json::json!({"status":"normalization-rejected","reason":reason,"scan":scanner.stats}))
                }
            },
            Ok(None)=>println!("{}",serde_json::json!({"status":scanner.status,"scan":scanner.stats})),
            Err(_)=>println!("{}",serde_json::json!({"status":"scan-error","scan":scanner.stats}))
        }
        if scanner.pid()==0 || std::time::Instant::now()>=deadline {break;}
        std::thread::sleep(std::time::Duration::from_millis(500));
    }
    Ok(())
}

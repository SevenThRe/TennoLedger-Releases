use crate::{collection,store};

// Caller holds AppState's database mutex across this read/modify/write.
pub fn set(db:&store::Store,id:&str,enabled:bool)->Result<collection::Snapshot,String>{
    let mut current=db.load_collection()?.ok_or("尚未读取库存，无法保存收藏")?;
    if enabled {current.favorites.insert(id.to_owned());} else {current.favorites.remove(id);}
    db.save_collection(&current)?;
    Ok(current)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn favorites_preserve_latest_inventory_and_are_idempotent(){
        let db=store::Store::open(std::path::Path::new(":memory:")).unwrap();
        let mut latest=collection::Snapshot{schema_version:1,captured_at:"2026-10-24T00:00:00Z".into(),source:"game-memory".into(),complete:false,..Default::default()};
        latest.counts.insert("fresh-item".into(),17);
        latest.ranks.insert("fresh-item".into(),22);
        latest.credits=Some(9876);
        latest.favorites.insert("other".into());
        db.save_collection(&latest).unwrap();
        set(&db,"favorite",true).unwrap();set(&db,"favorite",true).unwrap();
        let saved=db.load_collection().unwrap().unwrap();
        let mut expected=latest.clone();expected.favorites.insert("favorite".into());
        assert_eq!(serde_json::to_value(saved).unwrap(),serde_json::to_value(expected).unwrap());
        set(&db,"favorite",false).unwrap();set(&db,"favorite",false).unwrap();
        assert_eq!(serde_json::to_value(db.load_collection().unwrap().unwrap()).unwrap(),serde_json::to_value(latest).unwrap());
    }
    #[test]
    fn no_snapshot_does_not_create_fictitious_inventory(){
        let db=store::Store::open(std::path::Path::new(":memory:")).unwrap();
        assert!(set(&db,"favorite",true).is_err());
        assert!(db.load_collection().unwrap().is_none());
    }
}

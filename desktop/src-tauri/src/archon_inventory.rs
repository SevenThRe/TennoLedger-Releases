use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShardSlot {
    pub color: String,
    pub upgrade_type: String,
}
impl ShardSlot {
    pub fn installed(&self) -> bool {
        (!self.color.trim().is_empty() && self.color != "ACC_NONE")
            || !self.upgrade_type.trim().is_empty()
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShardFrame {
    pub item_id: String,
    pub instance_id: String,
    /// None means the slot field was absent or malformed, never five empty slots.
    pub slots: Option<Vec<Option<ShardSlot>>>,
}

pub fn validate(frames: &[ShardFrame]) -> Result<(), String> {
    let mut instances = BTreeSet::new();
    if frames.len() > 10000 {
        return Err("源力石战甲列表过长".into());
    }
    for frame in frames {
        if !frame.item_id.starts_with("/Lotus/") || frame.item_id.len() > 512
            || frame.instance_id.is_empty() || frame.instance_id.len() > 600
            || !instances.insert(&frame.instance_id)
        {
            return Err("源力石战甲标识无效或重复".into());
        }
        if let Some(slots) = &frame.slots {
            if slots.len() != 5 || slots.iter().flatten().any(|s| s.color.len() > 128 || s.upgrade_type.len() > 512) {
                return Err("源力石槽位数据无效".into());
            }
        }
    }
    Ok(())
}

pub fn parse(suits: &Value) -> Option<Vec<ShardFrame>> {
    let mut copies = BTreeMap::<String, usize>::new();
    let mut frames = Vec::new();
    for suit in suits.as_array()? {
        let item_id = suit["ItemType"].as_str()?.to_owned();
        let copy = copies.entry(item_id.clone()).or_default();
        *copy += 1;
        let instance_id = suit["ItemId"]["$oid"].as_str()
            .or_else(|| suit["ItemId"]["oid"].as_str())
            .or_else(|| suit["ItemId"].as_str())
            .filter(|s| !s.is_empty()).map(str::to_owned)
            .unwrap_or_else(|| format!("{}:{}", item_id, copy));
        let slots = suit["ArchonCrystalUpgrades"].as_array().and_then(|rows| {
            if rows.len() > 5 { return None; }
            let mut slots = Vec::new();
            for row in rows {
                if row.is_null() { slots.push(None); continue; }
                let object = row.as_object()?;
                let text = |key: &str| -> Option<String> {
                    match object.get(key) {
                        None | Some(Value::Null) => Some(String::new()),
                        Some(Value::String(s)) => Some(s.clone()),
                        _ => None,
                    }
                };
                slots.push(Some(ShardSlot { color: text("Color")?, upgrade_type: text("UpgradeType")? }));
            }
            slots.resize_with(5, || None);
            Some(slots)
        });
        frames.push(ShardFrame { item_id, instance_id, slots });
    }
    validate(&frames).ok()?;
    Some(frames)
}

pub fn equipped_types(frames: &[ShardFrame]) -> Option<BTreeSet<String>> {
    // Legacy item-level filter is only complete when every instance was captured.
    if frames.iter().any(|f| f.slots.is_none()) { return None; }
    Some(frames.iter().filter(|f| f.slots.as_ref().unwrap().iter().flatten().any(ShardSlot::installed))
        .map(|f| f.item_id.clone()).collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn empty_slots_are_not_equipped_and_copies_keep_separate_ids() {
        let frames = parse(&json!([
            {"ItemType":"/Lotus/A","ArchonCrystalUpgrades":[null,{}, {"Color":"ACC_NONE"}]},
            {"ItemType":"/Lotus/A","ArchonCrystalUpgrades":[{"Color":"ACC_RED_MYTHIC","UpgradeType":"/Lotus/Effect"}]}
        ])).unwrap();
        assert_ne!(frames[0].instance_id, frames[1].instance_id);
        assert_eq!(frames[0].slots.as_ref().unwrap().len(), 5);
        assert_eq!(equipped_types(&frames).unwrap().len(), 1);
        assert!(equipped_types(&frames[..1]).unwrap().is_empty());
        assert_eq!(frames[1].slots.as_ref().unwrap()[0].as_ref().unwrap().color, "ACC_RED_MYTHIC");
    }
    #[test]
    fn missing_and_malformed_slots_stay_unknown() {
        for field in [Value::Null, json!(false), json!([42]), json!([{"Color":42}]), json!([null,null,null,null,null,null])] {
            let frames = parse(&json!([{"ItemType":"/Lotus/A","ArchonCrystalUpgrades":field}])).unwrap();
            assert!(frames[0].slots.is_none());
            assert!(equipped_types(&frames).is_none());
        }
    }
    #[test]
    fn identities_and_slot_positions_survive_serialization() {
        let frames = parse(&json!([{"ItemType":"/Lotus/A","ItemId":{"$oid":"instance"},"ArchonCrystalUpgrades":[null,{"UpgradeType":"/Lotus/UnknownEffect"}]}])).unwrap();
        let saved = serde_json::to_value(&frames).unwrap();
        assert_eq!(saved[0]["instanceId"],"instance");
        assert!(saved[0]["slots"][0].is_null());
        assert_eq!(saved[0]["slots"][1]["upgradeType"],"/Lotus/UnknownEffect");
        let restored: Vec<ShardFrame> = serde_json::from_value(saved).unwrap();
        assert_eq!(equipped_types(&restored).unwrap().len(),1);
    }
    #[test]
    fn duplicate_instance_ids_do_not_silently_merge() {
        assert!(parse(&json!([{"ItemType":"/Lotus/A","ItemId":"same"},{"ItemType":"/Lotus/A","ItemId":"same"}])).is_none());
    }
}

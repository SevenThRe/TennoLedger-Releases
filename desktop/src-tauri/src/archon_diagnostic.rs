//! Aggregate-only capture evidence; no account or instance identifiers are emitted.
use crate::collection::Snapshot;
use serde_json::{json, Value};

pub fn summarize(snapshot: &Snapshot) -> Result<Value, String> {
    let encoded = serde_json::to_value(snapshot).map_err(|_| "snapshot-encode")?;
    let restored: Snapshot = serde_json::from_value(encoded.clone()).map_err(|_| "snapshot-decode")?;
    let round_trip = encoded.get("archonShardFrames") == serde_json::to_value(&restored).map_err(|_| "snapshot-reencode")?.get("archonShardFrames");
    let frames = snapshot.archon_shard_frames.as_deref();
    let known = frames.map(|rows| rows.iter().filter(|f| f.slots.is_some()).count());
    let mut installed = 0usize;
    let mut tau = 0usize;
    let mut empty = 0usize;
    let mut unknown_colors = 0usize;
    let mut unknown_effects = 0usize;
    let effects: Value = serde_json::from_str(include_str!("../../public/shard-effects.json")).map_err(|_| "effect-catalog")?;
    for frame in frames.unwrap_or_default() {
        for slot in frame.slots.as_deref().unwrap_or_default() {
            if let Some(slot) = slot.as_ref().filter(|s| s.installed()) {
                installed += 1;
                tau += usize::from(slot.color.ends_with("_MYTHIC"));
                unknown_colors += usize::from(!["ACC_RED", "ACC_YELLOW", "ACC_BLUE", "ACC_GREEN", "ACC_ORANGE", "ACC_PURPLE"].contains(&slot.color.trim_end_matches("_MYTHIC")));
                unknown_effects += usize::from(effects["effects"].get(&slot.upgrade_type).and_then(Value::as_str).is_none());
            } else { empty += 1; }
        }
    }
    Ok(json!({"rosterKnown":frames.is_some(),"frameInstances":frames.map(|r|r.len()),"knownSlotFrames":known,"unknownSlotFrames":frames.map(|r|r.len()-known.unwrap_or(0)),"observedInstalledSlots":installed,"observedTauSlots":tau,"observedEmptySlots":empty,"unknownColors":unknown_colors,"unknownEffects":unknown_effects,"snapshotRoundTrip":round_trip}))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn archon_diagnostic_retains_unknown_and_does_not_emit_ids() {
        let catalog = crate::collection::catalog().unwrap();
        let snapshot = crate::inventory_data::from_value(&json!({"LastInventorySync":{"$oid":"650000000000000000000000"},"MiscItems":[],"XPInfo":[],"LongGuns":[],"Pistols":[],"Melee":[],"PlayerLevel":12,"RegularCredits":8000,"Suits":[
            {"ItemType":"/Lotus/TestFrame","ItemId":"private-instance","ArchonCrystalUpgrades":[{"Color":"ACC_RED_MYTHIC","UpgradeType":"unknown-effect"},null]},
            {"ItemType":"/Lotus/TestFrame","ItemId":"private-second"}
        ]}), &catalog, None, "test", "2026-10-24T00:00:00Z").unwrap();
        let result = summarize(&snapshot).unwrap();
        assert_eq!(result["frameInstances"],2);
        assert_eq!(result["unknownSlotFrames"],1);
        assert_eq!(result["observedInstalledSlots"],1);
        assert_eq!(result["observedEmptySlots"],4);
        assert_eq!(result["unknownEffects"],1);
        assert_eq!(result["snapshotRoundTrip"],true);
        assert!(!result.to_string().contains("private"));
        assert!(!result.to_string().contains("/Lotus/"));
    }
}

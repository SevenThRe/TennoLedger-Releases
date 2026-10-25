//! Account mastery from historical XP ledger and the versioned offline node/rank table.
use crate::collection::{MasteryAccount, MasteryProgress};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};
#[derive(Clone, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MasteryCoverage {
    pub equipment_records: u32,
    pub unknown_equipment_records: u32,
    pub unknown_mission_records: u32,
    pub source_sha256: String,
    pub complete: bool,
    pub known_xp: u64,
    #[serde(default)]
    pub unknown_mission_ids: Vec<String>,
    #[serde(default)]
    pub unknown_equipment_ids: Vec<String>,
}
const TABLE: &str = include_str!("../../public/mastery-account-sources.json");
fn n(v: &Value) -> Option<u64> {
    v.as_u64().or_else(|| v.as_str()?.parse().ok())
}
fn rank(xp: u64, per: u64, cap: u64) -> u64 {
    // Integer comparisons avoid floating-point boundary rounding.
    (0..=cap)
        .take_while(|r| r * r * (if per == 200 { 1000 } else { 500 }) <= xp)
        .last()
        .unwrap_or(0)
}
pub fn complete(value: &Value, account: &mut MasteryAccount) {
    let table: Value = serde_json::from_str(TABLE).expect("bundled mastery rules");
    let mut ledger = BTreeMap::<String, u64>::new();
    let mut known = value["XPInfo"].is_array();
    let mut unknown_equipment = 0;
    let mut unknown_missions = 0;
    let mut unknown_mission_ids = BTreeSet::new();
    let mut unknown_equipment_ids = BTreeSet::new();
    for row in value["XPInfo"].as_array().into_iter().flatten() {
        match (row["ItemType"].as_str(), n(&row["XP"])) {
            (Some(id), Some(xp)) => {
                ledger
                    .entry(id.into())
                    .and_modify(|n| *n = (*n).max(xp))
                    .or_insert(xp);
            }
            _ => known = false,
        }
    }
    // Plexus lives in owned harnesses, not reliably in XPInfo. Merge by type,
    // taking the maximum, so duplicate owned copies never grant double mastery.
    let mut plexus = BTreeSet::new();
    if let Some(rows) = value["CrewShipHarnesses"].as_array() {
        for row in rows {
            if let (Some(id), Some(xp)) = (row["ItemType"].as_str(), n(&row["XP"])) {
                plexus.insert(id.to_owned());
                ledger
                    .entry(id.into())
                    .and_modify(|n| *n = (*n).max(xp))
                    .or_insert(xp);
            } else {
                known = false;
            }
        }
    } else {
        known = false;
    }
    let mut equipment_xp = 0;
    for (id, xp) in &ledger {
        if *xp == 0 {
            continue;
        }
        let rule = &table["equipment"][id];
        let fields = if plexus.contains(id) {
            Some((200, 30))
        } else {
            n(&rule["xpPerRank"]).zip(n(&rule["maxRank"]))
        };
        if let Some((per, cap)) = fields {
            equipment_xp += rank(*xp, per, cap) * per;
        } else {
            known = false;
            unknown_equipment += 1;
            unknown_equipment_ids.insert(id.clone());
        }
    }
    let mut node_xp = 0;
    let mut normal = BTreeSet::new();
    let mut steel = BTreeSet::new();
    let mut junctions = BTreeSet::new();
    let mut steel_junctions = BTreeSet::new();
    let mut missions_known = true;
    if let Some(rows) = value["Missions"].as_array() {
        for row in rows {
            let Some(tag) = row["Tag"].as_str() else {
                missions_known = false;
                unknown_missions += 1;
                continue;
            };
            let (Some(completes), Some(tier)) = (
                Some(n(&row["Completes"]).unwrap_or(0)),
                Some(n(&row["Tier"]).unwrap_or(0)),
            ) else {
                missions_known = false;
                unknown_missions += 1;
                continue;
            };
            if tag.ends_with("Junction") && tag.contains("To") {
                if completes > 0 {
                    junctions.insert(tag);
                }
                if completes == 2 || (completes >= 1 && tier >= 1) {
                    steel_junctions.insert(tag);
                }
            } else if n(&table["nodeXp"][tag]).unwrap_or(0) > 0 {
                // AlecaFrame counts recorded positive-XP mission entries. The
                // second steel-path contribution depends on Tier, not Completes.
                normal.insert(tag);
                if tier > 0 {
                    steel.insert(tag);
                }
            } else if !table["knownNodes"]
                .as_array()
                .unwrap()
                .iter()
                .any(|v| v.as_str() == Some(tag))
            {
                // Original GetCompletionXP uses nodeXP.GetOrDefault(Tag):
                // unmapped mission tags contribute zero, not an unknown total.
                unknown_missions += 1;
                unknown_mission_ids.insert(tag.to_owned());
            }
        }
        for tag in normal.iter().chain(steel.iter()) {
            node_xp += n(&table["nodeXp"][*tag]).unwrap();
        }
        node_xp += 1000 * (junctions.len() + steel_junctions.len()) as u64;
        {
            // These counters are projections onto the bundled 168-node catalogue.
            // Unmapped mission records remain visible in coverage and contribute zero.
            let progress = |current: usize, max: u32| {
                Some(MasteryProgress {
                    current: current as u32,
                    max,
                })
            };
            let max = n(&table["normalNodeCount"]).unwrap() as u32;
            account.star_normal = progress(normal.len(), max);
            account.star_steel = progress(steel.len(), max);
            account.junctions = progress(junctions.len(), 13);
            account.steel_junctions = progress(steel_junctions.len(), 13);
        }
    } else {
        missions_known = false;
    }
    account.total_xp = if known && missions_known {
        account
            .railjack
            .as_ref()
            .zip(account.duviri.as_ref())
            .map(|(rail, duviri)| {
                equipment_xp + node_xp + 1500 * (rail.current + duviri.current) as u64
            })
    } else {
        None
    };
    account.coverage = Some(MasteryCoverage {
        unknown_mission_ids: unknown_mission_ids.into_iter().collect(),
        unknown_equipment_ids: unknown_equipment_ids.into_iter().collect(),
        equipment_records: ledger.len() as u32,
        unknown_equipment_records: unknown_equipment,
        unknown_mission_records: unknown_missions,
        source_sha256: table["sourceSha256"].as_str().unwrap().into(),
        known_xp: equipment_xp
            + node_xp
            + 1500
                * (account.railjack.as_ref().map(|p| p.current).unwrap_or(0)
                    + account.duviri.as_ref().map(|p| p.current).unwrap_or(0))
                    as u64,
        complete: account.total_xp.is_some(),
    });
}
#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    fn account() -> MasteryAccount {
        MasteryAccount {
            railjack: Some(MasteryProgress {
                current: 1,
                max: 50,
            }),
            duviri: Some(MasteryProgress {
                current: 2,
                max: 40,
            }),
            ..Default::default()
        }
    }
    #[test]
    fn boundaries() {
        assert_eq!(rank(899999, 200, 30), 29);
        assert_eq!(rank(1600000, 200, 40), 40);
        assert_eq!(rank(800000, 100, 40), 40);
    }
    #[test]
    fn empty_is_complete_only_with_all_sections() {
        let mut a = account();
        complete(
            &json!({"XPInfo":[],"Missions":[],"CrewShipHarnesses":[]}),
            &mut a,
        );
        assert_eq!(a.total_xp, Some(4500));
        assert_eq!(a.star_normal.unwrap().max, 168);
    }
    #[test]
    fn unknown_never_becomes_zero() {
        let mut a = account();
        complete(
            &json!({"XPInfo":[{"ItemType":"/Lotus/Unknown","XP":1000}],"Missions":[],"CrewShipHarnesses":[]}),
            &mut a,
        );
        assert!(a.total_xp.is_none());
    }
    #[test]
    fn missing_tier_defaults_like_csharp() {
        let mut a = account();
        complete(
            &json!({"XPInfo":[],"CrewShipHarnesses":[],"Missions":[{"Tag":"SolNode4","Completes":1}]}),
            &mut a,
        );
        assert_eq!(a.total_xp, Some(4551));
        assert_eq!(a.star_steel.unwrap().current, 0);
    }
    #[test]
    fn unmapped_mission_uses_original_zero_xp_lookup() {
        let mut a = account();
        complete(
            &json!({"XPInfo":[],"CrewShipHarnesses":[],"Missions":[{"Tag":"SolNode4"},{"Tag":"FutureNode"}]}),
            &mut a,
        );
        assert_eq!(a.total_xp, Some(4551));
        assert_eq!(a.star_normal.unwrap().current, 1);
        assert_eq!(a.coverage.unwrap().unknown_mission_records, 1);
    }
    #[test]
    fn steel_and_junction_deduplicate() {
        let mut a = account();
        complete(
            &json!({"XPInfo":[],"CrewShipHarnesses":[],"Missions":[{"Tag":"SolNode4","Completes":1,"Tier":1},{"Tag":"SolNode4","Completes":1,"Tier":1},{"Tag":"EarthToVenusJunction","Completes":2,"Tier":0}]}),
            &mut a,
        );
        assert_eq!(a.total_xp, Some(4500 + 102 + 2000));
        assert_eq!(a.steel_junctions.unwrap().current, 1);
    }
    #[test]
    fn missing_xp_ledger_is_not_complete() {
        let mut a = account();
        complete(&json!({"Missions":[],"CrewShipHarnesses":[]}), &mut a);
        assert!(a.total_xp.is_none());
    }
    #[test]
    fn junction_mastery_does_not_require_node_xp_entry() {
        let mut a = account();
        complete(&json!({"XPInfo":[],"CrewShipHarnesses":[],"Missions":[
            {"Tag":"NewPlanetToOtherPlanetJunction","Completes":2}
        ]}), &mut a);
        assert_eq!(a.total_xp, Some(6500));
        assert_eq!(a.junctions.unwrap().current, 1);
        assert_eq!(a.steel_junctions.unwrap().current, 1);
    }

    #[test]
    fn kdrive_decks_grant_six_thousand_at_rank_thirty() {
        let table: Value = serde_json::from_str(TABLE).unwrap();
        let decks: Vec<_> = table["equipment"].as_object().unwrap().iter()
            .filter(|(id, _)| id.contains("Hoverboard") && id.ends_with("Deck")).collect();
        assert!(!decks.is_empty());
        for (id, rule) in decks {
            assert_eq!(rule["xpPerRank"], 200);
            let mut a = account();
            complete(&json!({"XPInfo":[{"ItemType":id,"XP":900000}],"Missions":[],"CrewShipHarnesses":[]}), &mut a);
            assert_eq!(a.total_xp, Some(10500));
        }
    }

}

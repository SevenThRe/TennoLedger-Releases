#[path = "loose_mod_inventory.rs"]
pub mod loose_mod_inventory;
#[path = "archon_inventory.rs"]
pub mod archon_inventory;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
#[path = "vendor_data.rs"]
pub mod vendor_data;
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Part {
    pub item_id: String,
    pub quantity: u64,
    #[serde(default)]
    pub reusable: bool,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct Recipe {
    pub output: u64,
    pub credits: u64,
    pub seconds: u64,
    pub parts: Vec<Part>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Item {
    pub id: String,
    pub name: String,
    pub zh: String,
    pub category: String,
    pub prime: bool,
    pub mastery_req: u32,
    pub max_rank: u32,
    pub xp_per_rank: u32,
    pub vaulted: Option<bool>,
    pub recipe: Option<Recipe>,
}
#[derive(Serialize, Deserialize)]
pub struct Catalog {
    pub items: Vec<Item>,
}
#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerProfile {
    pub name: Option<String>,
    pub platinum: Option<u64>,
    pub endo: Option<u64>,
    pub ducats: Option<u64>,
}
#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyndicateStanding {
    pub tag: String,
    pub rank: Option<i32>,
    pub standing: Option<i64>,
}
#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StandingSnapshot {
    pub captured_at: String,
    pub affiliations: Vec<SyndicateStanding>,
    pub daily_remaining: BTreeMap<String, u64>,
}
#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VendorPrice { pub item_id: String, pub quantity: u64 }
#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VendorOffer {
    pub item_id: String,
    pub expiry: String,
    pub quantity: u64,
    pub prices: Vec<VendorPrice>,
    pub purchase_limit: Option<u64>,
    pub element: Option<String>,
    pub bonus_percent: Option<f64>,
}
#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VendorSnapshot {
    pub id: String,
    pub captured_at: String,
    pub expiry: Option<String>,
    pub offers: Vec<VendorOffer>,
    pub error: Option<String>,
}
#[derive(Clone, Default, Serialize, Deserialize)]
pub struct MasteryProgress {
    pub current: u32,
    pub max: u32,
}
#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MasteryAccount {
    #[serde(default)]
    pub coverage: Option<crate::account_mastery::MasteryCoverage>,
    pub total_xp: Option<u64>,
    #[serde(default)]
    pub ranks_complete: bool,
    pub star_normal: Option<MasteryProgress>,
    pub star_steel: Option<MasteryProgress>,
    pub junctions: Option<MasteryProgress>,
    pub steel_junctions: Option<MasteryProgress>,
    pub railjack: Option<MasteryProgress>,
    pub duviri: Option<MasteryProgress>,
}
#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    #[serde(default, skip_serializing_if="Option::is_none")]
    pub account_scope: Option<String>,
    /// Blueprint IDs for in-progress and finished-but-unclaimed crafts; None means unknown.
    #[serde(default)]
    pub pending_recipes: Option<BTreeMap<String, u64>>,
    #[serde(default)]
    pub standing: Option<StandingSnapshot>,
    #[serde(default)]
    pub vendors: Option<Vec<VendorSnapshot>>,
    /// None: older/incomplete capture. Null per item: fingerprint could not be decoded.
    #[serde(default)]
    pub upgrade_counts_by_rank: Option<BTreeMap<String, Option<BTreeMap<u32, u64>>>>,
    #[serde(default)]
    pub loose_unranked_mods: Option<loose_mod_inventory::LooseMods>,
    #[serde(default)]
    pub unranked_equipment_counts: Option<BTreeMap<String,Option<u64>>>,
    #[serde(default)]
    pub rivens: Option<Vec<crate::riven_inventory::OwnedRiven>>,
    pub schema_version: u32,
    pub captured_at: String,
    pub source: String,
    pub complete: bool,
    /// Missing owned categories, retained so optional gaps are never treated as zero.
    #[serde(default)]
    pub missing_owned_groups: Vec<String>,
    pub mastery_rank: Option<u32>,
    pub credits: Option<u64>,
    #[serde(default)]
    pub player_profile: Option<PlayerProfile>,
    #[serde(default)]
    pub mastery_account: Option<MasteryAccount>,
    pub counts: BTreeMap<String, u64>,
    pub ranks: BTreeMap<String, u32>,
    #[serde(default)]
    pub favorites: BTreeSet<String>,
    #[serde(default)]
    pub prime_resurgence: Option<BTreeSet<String>>,
    #[serde(default)]
    pub helminth: Option<BTreeSet<String>>,
    #[serde(default)]
    pub archon_shards: Option<BTreeSet<String>>,
    #[serde(default)]
    pub archon_shard_frames: Option<Vec<archon_inventory::ShardFrame>>,
    #[serde(default)]
    pub incarnon: Option<BTreeSet<String>>,
}
impl Snapshot {
    pub fn inventory_available(&self) -> bool {
        self.complete || self.missing_owned_groups == ["Hoverboards"]
    }
}
pub fn catalog() -> Result<Catalog, String> {
    serde_json::from_str(include_str!("../../public/catalog.json")).map_err(|e| e.to_string())
}
pub fn parse(input: &str) -> Result<Snapshot, String> {
    if input.len() > 10 * 1024 * 1024 {
        return Err("库存文件超过 10 MiB".into());
    }
    let s: Snapshot = serde_json::from_str(input).map_err(|e| e.to_string())?;
    validate(&s, &catalog()?)?;
    Ok(s)
}
pub fn validate(s: &Snapshot, c: &Catalog) -> Result<(), String> {
    if s.account_scope.as_deref().is_some_and(|scope|!crate::account_scope::valid(scope)){return Err("账户作用域无效".into());}
    if let Some(frames) = &s.archon_shard_frames { archon_inventory::validate(frames)?; }
    if s.pending_recipes.as_ref().is_some_and(|rows| rows.len() > 10000 || rows.iter().any(|(id, count)| !id.starts_with("/Lotus/") || id.len() > 512 || *count == 0 || *count > 10000)) {
        return Err("制造队列数据无效".into());
    }
    if let Some(standing) = &s.standing {
        if chrono::DateTime::parse_from_rfc3339(&standing.captured_at).is_err()
            || standing.affiliations.len() > 256 || standing.daily_remaining.len() > 32
            || standing.affiliations.iter().any(|a| a.tag.is_empty() || a.tag.len() > 128 || !a.tag.bytes().all(|b|b.is_ascii_alphanumeric()||b==b'_') || a.rank.is_some_and(|r| !(-2..=10000).contains(&r)) || a.standing.is_some_and(|n| !(-1_000_000..=1_000_000_000).contains(&n)))
            || standing.daily_remaining.iter().any(|(k,n)| !k.starts_with("DailyAffiliation") || k.len()>64 || *n>1_000_000) { return Err("集团声望数据无效".into()); }
    }
    if let Some(vendors) = &s.vendors {
        if vendors.len()>3 || vendors.iter().any(|v| !matches!(v.id.as_str(),"tenet"|"coda"|"teshin") || chrono::DateTime::parse_from_rfc3339(&v.captured_at).is_err() || v.expiry.as_ref().is_some_and(|d|chrono::DateTime::parse_from_rfc3339(d).is_err()) || v.offers.len()>128 || v.offers.iter().any(|o| !o.item_id.starts_with("/Lotus/") || o.item_id.len()>512 || chrono::DateTime::parse_from_rfc3339(&o.expiry).is_err() || o.quantity>1_000_000 || o.prices.len()>8 || o.prices.iter().any(|p|!p.item_id.starts_with("/Lotus/")||p.item_id.len()>512||p.quantity>1_000_000) || o.bonus_percent.is_some_and(|p|!p.is_finite()|| !(0.0..=100.0).contains(&p)))) { return Err("商店轮换数据无效".into()); }
    }
    if let Some(r) = &s.rivens {
        crate::riven_inventory::validate(r)?;
    }
    if s.schema_version != 1
        || s.source.trim().is_empty()
        || chrono::DateTime::parse_from_rfc3339(&s.captured_at).is_err()
    {
        return Err("库存版本、来源或时间无效".into());
    }
    if s.counts.values().any(|n| *n > 1_000_000_000)
        || s.ranks.values().any(|n| *n > 100)
        || s.mastery_rank.is_some_and(|n| n > 100)
    {
        return Err("库存数量或等级无效".into());
    }
    if s.credits.is_some_and(|n| n > 1_000_000_000_000) {
        return Err("现金数值无效".into());
    }
    if let Some(items)=&s.unranked_equipment_counts {if items.len()>100000||items.iter().any(|(id,n)|!id.starts_with("/Lotus/")||id.len()>512||n.is_some_and(|n|n>1_000_000_000)){return Err("未升级装备实例数量无效".into());}}
    if let Some(items) = &s.loose_unranked_mods { loose_mod_inventory::validate(items)?; }
    if let Some(items) = &s.upgrade_counts_by_rank {
        for (id, ranks) in items {
            if !id.starts_with("/Lotus/") || id.len() > 512
                || ranks.as_ref().is_some_and(|r| r.iter().any(|(rank, count)| *rank > 100 || *count > 1_000_000_000)) {
                return Err("模组分级库存无效".into());
            }
        }
    }
    if let Some(p) = &s.player_profile {
        if p.name.as_ref().is_some_and(|n| {
            n.trim().is_empty() || n.chars().count() > 128 || n.chars().any(char::is_control)
        }) || [p.platinum, p.endo, p.ducats]
            .into_iter()
            .flatten()
            .any(|n| n > 1_000_000_000_000)
        {
            return Err("玩家资料数值无效".into());
        }
    }
    if let Some(a) = &s.mastery_account {
        if a.total_xp.is_some_and(|n| n > 1_000_000_000)
            || [
                &a.star_normal,
                &a.star_steel,
                &a.junctions,
                &a.steel_junctions,
                &a.railjack,
                &a.duviri,
            ]
            .into_iter()
            .flatten()
            .any(|p| p.max == 0 || p.max > 1_000_000 || p.current > p.max)
            || a.railjack.as_ref().is_some_and(|p| p.max != 50)
            || a.duviri.as_ref().is_some_and(|p| p.max != 40)
        {
            return Err("账户精通进度无效".into());
        }
    }
    let map: BTreeMap<_, _> = c.items.iter().map(|i| (i.id.as_str(), i)).collect();
    for (id, r) in &s.ranks {
        if let Some(i) = map.get(id.as_str()) {
            if *r > i.max_rank {
                return Err(format!("精通等级超出上限：{id}"));
            }
        }
    }
    Ok(())
}
pub fn count(s: &Snapshot, id: &str) -> Option<u64> {
    s.counts
        .get(id)
        .copied()
        .or(if s.complete { Some(0) } else { None })
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Need {
    pub item_id: String,
    pub needed: u64,
    pub owned: Option<u64>,
    pub missing: Option<u64>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Plan {
    pub needs: Vec<Need>,
    pub credits: u64,
    pub credits_known: bool,
    pub enough_mastery: Option<bool>,
    pub ready: Option<bool>,
    pub materials_ready: Option<bool>,
}
pub fn plan(c: &Catalog, s: &Snapshot, id: &str, quantity: u64) -> Result<Plan, String> {
    if quantity == 0 || quantity > 1000 {
        return Err("制造数量必须为 1–1000".into());
    }
    let i = c.items.iter().find(|i| i.id == id).ok_or("物品不存在")?;
    let r = i.recipe.as_ref().ok_or("没有制造配方")?;
    if r.output == 0 {
        return Err("配方产量无效".into());
    }
    let batches = quantity.div_ceil(r.output);
    let mut amounts = BTreeMap::<String, u64>::new();
    for p in &r.parts {
        let n = if p.reusable {
            p.quantity
        } else {
            p.quantity.checked_mul(batches).ok_or("配方数量溢出")?
        };
        let v = amounts.entry(p.item_id.clone()).or_default();
        *v = if p.reusable {
            (*v).max(n)
        } else {
            v.checked_add(n).ok_or("配方数量溢出")?
        };
    }
    let needs: Vec<_> = amounts
        .into_iter()
        .map(|(item_id, needed)| {
            let owned = count(s, &item_id);
            Need {
                item_id,
                needed,
                owned,
                missing: owned.map(|v| needed.saturating_sub(v)),
            }
        })
        .collect();
    let credits = r.credits.checked_mul(batches).ok_or("现金溢出")?;
    let enough_mastery = s.mastery_rank.map(|m| m >= i.mastery_req);
    let credit_ok = s.credits.map(|n| n >= credits);
    let ready = if needs.iter().any(|n| n.missing.is_some_and(|n| n > 0))
        || enough_mastery == Some(false)
        || credit_ok == Some(false)
    {
        Some(false)
    } else if needs.iter().all(|n| n.missing == Some(0))
        && enough_mastery == Some(true)
        && credit_ok == Some(true)
    {
        Some(true)
    } else {
        None
    };
    let materials_ready = if needs.iter().any(|n| n.missing.is_some_and(|v| v > 0)) {
        Some(false)
    } else if needs.iter().all(|n| n.missing == Some(0)) {
        Some(true)
    } else {
        None
    };
    Ok(Plan {
        needs,
        credits,
        credits_known: s.credits.is_some(),
        enough_mastery,
        ready,
        materials_ready,
    })
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn legacy_snapshot_does_not_claim_complete_mastery() {
        let s = parse(r#"{"schemaVersion":1,"capturedAt":"2026-10-23T00:00:00Z","source":"legacy","complete":true,"masteryRank":12,"credits":8000,"counts":{},"ranks":{}}"#).unwrap();
        assert!(s.complete);
        assert!(s.mastery_account.is_none());
        assert!(s.player_profile.is_none());
        let roundtrip: Snapshot =
            serde_json::from_str(&serde_json::to_string(&s).unwrap()).unwrap();
        assert!(roundtrip.mastery_account.is_none());
    }
    #[test]
    fn account_progress_and_profile_bounds() {
        let mut s = Snapshot {
            schema_version: 1,
            captured_at: "2026-10-23T00:00:00Z".into(),
            source: "test".into(),
            mastery_account: Some(MasteryAccount::default()),
            ..Default::default()
        };
        assert!(validate(&s, &c()).is_ok());
        for (current, max) in [(1, 0), (51, 50), (0, 1_000_001)] {
            s.mastery_account.as_mut().unwrap().star_normal =
                Some(MasteryProgress { current, max });
            assert!(validate(&s, &c()).is_err());
        }
        s.mastery_account = Some(MasteryAccount {
            total_xp: Some(1_000_000_001),
            ..Default::default()
        });
        assert!(validate(&s, &c()).is_err());
        s.mastery_account = None;
        for name in ["", "   ", "Tenno\nname"] {
            s.player_profile = Some(PlayerProfile {
                name: Some(name.into()),
                ..Default::default()
            });
            assert!(validate(&s, &c()).is_err());
        }
    }
    #[test]
    fn snapshot_rejects_invalid_and_preserves_unknown_ids() {
        let mut s = Snapshot {
            schema_version: 1,
            captured_at: "2026-10-23T00:00:00Z".into(),
            source: "test".into(),
            ..Default::default()
        };
        s.counts.insert("future-item".into(), 2);
        assert!(validate(&s, &c()).is_ok());
        s.ranks.insert("a".into(), 31);
        assert!(validate(&s, &c()).is_err());
        s.ranks.clear();
        s.schema_version = 2;
        assert!(validate(&s, &c()).is_err());
    }
    fn c() -> Catalog {
        Catalog {
            items: vec![Item {
                id: "a".into(),
                name: "A".into(),
                zh: "甲".into(),
                category: "weapon".into(),
                prime: false,
                mastery_req: 2,
                max_rank: 30,
                xp_per_rank: 100,
                vaulted: None,
                recipe: Some(Recipe {
                    output: 2,
                    credits: 10,
                    seconds: 60,
                    parts: vec![
                        Part {
                            item_id: "x".into(),
                            quantity: 3,
                            reusable: false,
                        },
                        Part {
                            item_id: "x".into(),
                            quantity: 2,
                            reusable: false,
                        },
                    ],
                }),
            }],
        }
    }
    #[test]
    fn partial_is_unknown() {
        let s = Snapshot::default();
        assert_eq!(count(&s, "x"), None);
        assert_eq!(plan(&c(), &s, "a", 1).unwrap().ready, None);
    }
    #[test]
    fn batches_and_shared_components() {
        let mut s = Snapshot {
            complete: true,
            credits: Some(20),
            mastery_rank: Some(2),
            ..Default::default()
        };
        s.counts.insert("x".into(), 10);
        let p = plan(&c(), &s, "a", 3).unwrap();
        assert_eq!(p.needs[0].needed, 10);
        assert_eq!(p.credits, 20);
        assert_eq!(p.ready, Some(true));
    }
    #[test]
    fn gates_do_not_consume() {
        let s = Snapshot {
            complete: true,
            credits: Some(0),
            mastery_rank: Some(0),
            ..Default::default()
        };
        assert_eq!(plan(&c(), &s, "a", 1).unwrap().ready, Some(false));
        assert!(s.counts.is_empty());
        assert!(plan(&c(), &s, "a", 0).is_err());
    }
    #[test]
    fn materials_ready_is_independent_of_rank_and_credits() {
        let mut s = Snapshot {
            complete: true,
            credits: Some(0),
            mastery_rank: Some(0),
            ..Default::default()
        };
        s.counts.insert("x".into(), 5);
        let p = plan(&c(), &s, "a", 1).unwrap();
        assert_eq!(p.materials_ready, Some(true));
        assert_eq!(p.ready, Some(false));
    }
    #[test]
    fn reusable_direct_parts_are_not_multiplied_by_batches() {
        let mut c = c();
        c.items[0].recipe.as_mut().unwrap().parts = vec![Part {
            item_id: "bp".into(),
            quantity: 1,
            reusable: true,
        }];
        let mut s = Snapshot {
            complete: true,
            ..Default::default()
        };
        s.counts.insert("bp".into(), 1);
        let p = plan(&c, &s, "a", 10).unwrap();
        assert_eq!(p.needs[0].needed, 1);
        assert_eq!(p.materials_ready, Some(true));
    }
    #[test]
    fn bundled_catalog_has_real_recipes() {
        let c = catalog().unwrap();
        assert!(c.items.len() > 1000);
        assert!(c
            .items
            .iter()
            .any(|i| i.recipe.is_some() && i.name == "Ash"));
    }
}

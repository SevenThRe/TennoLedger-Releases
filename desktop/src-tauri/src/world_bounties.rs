use super::{date, iso, Notice};
use chrono::DateTime;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};
use std::sync::OnceLock;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BountyReward {
    pub item_id: String,
    pub zh: String,
    pub en: String,
    pub quantity: u64,
    pub rarity: String,
    pub chance: f64,
    pub final_chance: Option<f64>,
    pub category: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BountyJob {
    pub id: String,
    pub syndicate: String,
    pub job_type: String,
    pub title_zh: String,
    pub title_en: String,
    pub tier_key: String,
    pub tier_index: u32,
    pub tier_label_zh: String,
    pub tier_label_en: String,
    pub min_level: u32,
    pub max_level: u32,
    pub mastery_req: u32,
    pub standing_stages: Vec<u32>,
    pub standing_total: u32,
    pub reward_deck: String,
    pub rotation: Option<String>,
    pub is_steel_path: bool,
    pub is_narmer: bool,
    pub is_vault: bool,
    pub is_endless: bool,
    pub node_id: Option<String>,
    pub node_zh: Option<String>,
    pub node_en: Option<String>,
    pub mission_type: Option<String>,
    pub challenge_id: Option<String>,
    pub challenge_zh: Option<String>,
    pub challenge_en: Option<String>,
    pub ally_zh: Option<String>,
    pub ally_en: Option<String>,
    pub activation: String,
    pub expiry: String,
    pub rewards: Vec<BountyReward>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BountySyndicate {
    pub tag: String,
    pub name_zh: String,
    pub name_en: String,
    pub hub_zh: String,
    pub hub_en: String,
    pub rotates_rewards: bool,
    pub rotation: Option<String>,
    pub vault_rotation: Option<String>,
    pub activation: String,
    pub expiry: String,
    pub jobs: Vec<BountyJob>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct BountySubscription {
    pub id: String,
    pub enabled: bool,
    pub syndicate: String,
    pub tier_key: String,
    pub rarity: String,
    pub item_id: Option<String>,
    pub item_name_zh: Option<String>,
    pub item_name_en: Option<String>,
    pub mission_type: Option<String>,
    pub challenge_id: Option<String>,
    pub created_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct BountyPreferences {
    pub enabled: bool,
    pub sound_enabled: bool,
    pub show_in_events: bool,
    pub subscriptions: Vec<BountySubscription>,
}

impl Default for BountyPreferences {
    fn default() -> Self {
        Self {
            enabled: true,
            sound_enabled: true,
            show_in_events: true,
            subscriptions: vec![],
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CatalogSyndicate {
    tag: String,
    name_zh: String,
    name_en: String,
    hub_zh: String,
    hub_en: String,
    rotates_rewards: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CatalogDeck {
    tier_key: String,
    tier_index: u32,
    tier_label_zh: String,
    tier_label_en: String,
    min_level: u32,
    max_level: u32,
    standing_stages: Vec<u32>,
    rotation: Option<String>,
    is_steel_path: bool,
    is_narmer: bool,
    is_vault: bool,
    is_endless: bool,
    rewards: Vec<BountyReward>,
}

#[derive(Deserialize)]
struct CatalogPair {
    zh: String,
    en: String,
}

#[derive(Deserialize)]
struct CatalogFile {
    syndicates: Vec<CatalogSyndicate>,
    decks: BTreeMap<String, CatalogDeck>,
    jobs: BTreeMap<String, CatalogPair>,
    challenges: BTreeMap<String, CatalogPair>,
    allies: BTreeMap<String, CatalogPair>,
}

fn catalog() -> &'static CatalogFile {
    static CATALOG: OnceLock<CatalogFile> = OnceLock::new();
    CATALOG.get_or_init(|| {
        serde_json::from_str(include_str!("../../public/bounty-catalog.json"))
            .expect("embedded bounty-catalog.json must be valid")
    })
}

const FIXED_SYNDICATE_DECKS: &[(&str, &[&str])] = &[
    (
        "ZarimanSyndicate",
        &[
            "/Lotus/Types/Game/MissionDecks/ZarimanJobMissionRewards/TierATableRewards",
            "/Lotus/Types/Game/MissionDecks/ZarimanJobMissionRewards/TierBTableRewards",
            "/Lotus/Types/Game/MissionDecks/ZarimanJobMissionRewards/TierCTableARewards",
            "/Lotus/Types/Game/MissionDecks/ZarimanJobMissionRewards/TierDTableRewards",
            "/Lotus/Types/Game/MissionDecks/ZarimanJobMissionRewards/TierETableRewards",
        ],
    ),
    (
        "EntratiLabSyndicate",
        &[
            "/Lotus/Types/Game/MissionDecks/EntratiLabJobMissionReward/TierATableRewards",
            "/Lotus/Types/Game/MissionDecks/EntratiLabJobMissionReward/TierBTableRewards",
            "/Lotus/Types/Game/MissionDecks/EntratiLabJobMissionReward/TierCTableRewards",
            "/Lotus/Types/Game/MissionDecks/EntratiLabJobMissionReward/TierDTableRewards",
            "/Lotus/Types/Game/MissionDecks/EntratiLabJobMissionReward/TierETableRewards",
        ],
    ),
    (
        "HexSyndicate",
        &[
            "/Lotus/Types/Game/MissionDecks/1999MissionRewards/TierABountyRewards",
            "/Lotus/Types/Game/MissionDecks/1999MissionRewards/TierBBountyRewards",
            "/Lotus/Types/Game/MissionDecks/1999MissionRewards/TierCBountyRewards",
            "/Lotus/Types/Game/MissionDecks/1999MissionRewards/TierDBountyRewards",
            "/Lotus/Types/Game/MissionDecks/1999MissionRewards/TierEBountyRewards",
            "/Lotus/Types/Game/MissionDecks/1999MissionRewards/TierFBountyRewards",
            "/Lotus/Types/Game/MissionDecks/1999MissionRewards/InfestedLichBountyRewards",
        ],
    ),
];

fn vault_title(tier_key: &str) -> (String, String) {
    match tier_key {
        "vault1" => ("隔离库赏金 I".into(), "Isolation Vault Tier 1".into()),
        "vault2" => ("隔离库赏金 II".into(), "Isolation Vault Tier 2".into()),
        "vault3" => ("隔离库赏金 III".into(), "Isolation Vault Tier 3".into()),
        _ => ("隔离库赏金".into(), "Isolation Vault".into()),
    }
}

fn parse_open_world_syndicate(
    tag: &str,
    sm: &Value,
    cat: &CatalogFile,
    act_ts: i64,
    exp_ts: i64,
) -> Option<BountySyndicate> {
    let syn_meta = cat.syndicates.iter().find(|s| s.tag == tag)?;
    let raw_jobs = sm["Jobs"].as_array()?;
    let mut jobs = Vec::with_capacity(raw_jobs.len());
    let mut used_ids = BTreeSet::new();
    let mut main_rotation: Option<String> = None;
    let mut vault_rotation: Option<String> = None;

    for (idx, raw_job) in raw_jobs.iter().enumerate() {
        let deck_path = raw_job["rewards"].as_str().unwrap_or("");
        let deck = cat.decks.get(deck_path);
        let min_level = raw_job["minEnemyLevel"]
            .as_u64()
            .map(|v| v as u32)
            .unwrap_or_else(|| deck.map_or(0, |d| d.min_level));
        let max_level = raw_job["maxEnemyLevel"]
            .as_u64()
            .map(|v| v as u32)
            .unwrap_or_else(|| deck.map_or(0, |d| d.max_level));
        let mastery_req = raw_job["masteryReq"].as_u64().unwrap_or(0) as u32;
        let standing_stages: Vec<u32> = raw_job["xpAmounts"]
            .as_array()
            .map(|arr| arr.iter().filter_map(|v| v.as_u64().map(|n| n as u32)).collect())
            .filter(|v: &Vec<u32>| !v.is_empty())
            .unwrap_or_else(|| deck.map_or_else(Vec::new, |d| d.standing_stages.clone()));
        let standing_total: u32 = standing_stages.iter().sum();

        let is_steel_path = min_level >= 100 || deck.is_some_and(|d| d.is_steel_path);
        let is_vault = raw_job["isVault"].as_bool().unwrap_or(false) || deck.is_some_and(|d| d.is_vault);
        let is_narmer = deck.is_some_and(|d| d.is_narmer);
        let is_endless = raw_job["endless"].as_bool().unwrap_or(false) || deck.is_some_and(|d| d.is_endless);

        let (tier_key, tier_index, tier_label_zh, tier_label_en) = if is_steel_path && !deck.is_some_and(|d| d.tier_key == "plagueStarSp") {
            ("steelPath".to_owned(), 6, "钢铁之路".to_owned(), "Steel Path".to_owned())
        } else if let Some(d) = deck {
            (
                d.tier_key.clone(),
                d.tier_index,
                d.tier_label_zh.clone(),
                d.tier_label_en.clone(),
            )
        } else {
            (
                format!("job{}", idx + 1),
                (idx + 1) as u32,
                format!("{}级赏金", idx + 1),
                format!("Tier {} Bounty", idx + 1),
            )
        };

        let job_type = raw_job["jobType"].as_str().unwrap_or("").to_owned();
        let (title_zh, title_en) = if let Some(pair) = cat.jobs.get(&job_type) {
            (pair.zh.clone(), pair.en.clone())
        } else if is_vault {
            vault_title(&tier_key)
        } else if !job_type.is_empty() {
            let leaf = job_type.rsplit('/').next().unwrap_or(&job_type).to_owned();
            (leaf.clone(), leaf)
        } else {
            (tier_label_zh.clone(), tier_label_en.clone())
        };

        let rotation = deck.and_then(|d| d.rotation.clone());
        if main_rotation.is_none() && !is_vault && !is_narmer {
            if let Some(ref rot) = rotation {
                main_rotation = Some(rot.clone());
            }
        }
        if vault_rotation.is_none() && is_vault {
            if let Some(ref rot) = rotation {
                vault_rotation = Some(rot.clone());
            }
        }

        let mut id = format!("{tag}:{tier_key}:{act_ts}");
        if !used_ids.insert(id.clone()) {
            id = format!("{tag}:{tier_key}:{act_ts}:{idx}");
            used_ids.insert(id.clone());
        }

        jobs.push(BountyJob {
            id,
            syndicate: tag.to_owned(),
            job_type,
            title_zh,
            title_en,
            tier_key,
            tier_index,
            tier_label_zh,
            tier_label_en,
            min_level,
            max_level,
            mastery_req,
            standing_stages,
            standing_total,
            reward_deck: deck_path.to_owned(),
            rotation,
            is_steel_path,
            is_narmer,
            is_vault,
            is_endless,
            node_id: None,
            node_zh: None,
            node_en: None,
            mission_type: None,
            challenge_id: None,
            challenge_zh: None,
            challenge_en: None,
            ally_zh: None,
            ally_en: None,
            activation: iso(act_ts),
            expiry: iso(exp_ts),
            rewards: deck.map_or_else(Vec::new, |d| d.rewards.clone()),
        });
    }

    jobs.sort_by_key(|j| (j.tier_index, j.min_level));

    Some(BountySyndicate {
        tag: tag.to_owned(),
        name_zh: syn_meta.name_zh.clone(),
        name_en: syn_meta.name_en.clone(),
        hub_zh: syn_meta.hub_zh.clone(),
        hub_en: syn_meta.hub_en.clone(),
        rotates_rewards: syn_meta.rotates_rewards,
        rotation: main_rotation,
        vault_rotation,
        activation: iso(act_ts),
        expiry: iso(exp_ts),
        jobs,
    })
}

fn parse_modern_syndicate(
    tag: &str,
    decks: &[&str],
    cat: &CatalogFile,
    bounty_cycle: Option<&Value>,
    nodes: &BTreeMap<String, Value>,
    act_ts: i64,
    exp_ts: i64,
    now: i64,
) -> Option<BountySyndicate> {
    let syn_meta = cat.syndicates.iter().find(|s| s.tag == tag)?;
    let cycle_valid = bounty_cycle.is_some_and(|bc| {
        let cycle_exp = bc["expiry"].as_i64().map(|ms| ms / 1000).unwrap_or(0);
        // Accept cycle entries covering the active window (exact/nearby expiry or still active).
        cycle_exp > now || cycle_exp.abs_diff(exp_ts) <= 300
    });
    let cycle_rows = if cycle_valid {
        bounty_cycle
            .and_then(|bc| bc["bounties"][tag].as_array())
    } else {
        None
    };

    let mut jobs = Vec::with_capacity(decks.len());
    for (idx, deck_path) in decks.iter().enumerate() {
        let Some(deck) = cat.decks.get(*deck_path) else {
            continue;
        };
        let cycle_entry = cycle_rows.and_then(|rows| rows.get(idx));
        let node_id = cycle_entry
            .and_then(|row| row["node"].as_str())
            .map(str::to_owned);
        let node_meta = node_id.as_deref().and_then(|nid| nodes.get(nid));
        let node_zh = node_meta
            .and_then(|m| m["zh"].as_str().or_else(|| m["name"].as_str()))
            .map(str::to_owned);
        let node_en = node_meta
            .and_then(|m| m["name"].as_str())
            .map(str::to_owned);
        let mission_type = node_meta
            .and_then(|m| m["missionType"].as_str())
            .filter(|m| !m.is_empty() && *m != "Unknown")
            .map(str::to_owned);

        let challenge_id = cycle_entry
            .and_then(|row| row["challenge"].as_str())
            .map(str::to_owned);
        let challenge_pair = challenge_id
            .as_deref()
            .and_then(|cid| cat.challenges.get(cid));
        let challenge_zh = challenge_pair
            .map(|p| p.zh.clone())
            .or_else(|| challenge_id.as_deref().map(|cid| cid.rsplit('/').next().unwrap_or(cid).to_owned()));
        let challenge_en = challenge_pair
            .map(|p| p.en.clone())
            .or_else(|| challenge_id.as_deref().map(|cid| cid.rsplit('/').next().unwrap_or(cid).to_owned()));

        let ally_pair = cycle_entry
            .and_then(|row| row["ally"].as_str())
            .and_then(|aid| cat.allies.get(aid));
        let ally_zh = ally_pair.map(|p| p.zh.clone());
        let ally_en = ally_pair.map(|p| p.en.clone());

        let title_zh = node_zh.clone().unwrap_or_else(|| deck.tier_label_zh.clone());
        let title_en = node_en.clone().unwrap_or_else(|| deck.tier_label_en.clone());
        let standing_total: u32 = deck.standing_stages.iter().sum();

        jobs.push(BountyJob {
            id: format!("{tag}:{}:{act_ts}", deck.tier_key),
            syndicate: tag.to_owned(),
            job_type: (*deck_path).to_owned(),
            title_zh,
            title_en,
            tier_key: deck.tier_key.clone(),
            tier_index: deck.tier_index,
            tier_label_zh: deck.tier_label_zh.clone(),
            tier_label_en: deck.tier_label_en.clone(),
            min_level: deck.min_level,
            max_level: deck.max_level,
            mastery_req: 0,
            standing_stages: deck.standing_stages.clone(),
            standing_total,
            reward_deck: (*deck_path).to_owned(),
            rotation: None,
            is_steel_path: deck.is_steel_path,
            is_narmer: deck.is_narmer,
            is_vault: deck.is_vault,
            is_endless: deck.is_endless,
            node_id,
            node_zh,
            node_en,
            mission_type,
            challenge_id,
            challenge_zh,
            challenge_en,
            ally_zh,
            ally_en,
            activation: iso(act_ts),
            expiry: iso(exp_ts),
            rewards: deck.rewards.clone(),
        });
    }

    Some(BountySyndicate {
        tag: tag.to_owned(),
        name_zh: syn_meta.name_zh.clone(),
        name_en: syn_meta.name_en.clone(),
        hub_zh: syn_meta.hub_zh.clone(),
        hub_en: syn_meta.hub_en.clone(),
        rotates_rewards: syn_meta.rotates_rewards,
        rotation: None,
        vault_rotation: None,
        activation: iso(act_ts),
        expiry: iso(exp_ts),
        jobs,
    })
}

pub fn parse(
    raw_world_state: &Value,
    bounty_cycle: Option<&Value>,
    nodes: &BTreeMap<String, Value>,
    now: i64,
) -> Vec<BountySyndicate> {
    let cat = catalog();
    let Some(missions) = raw_world_state["SyndicateMissions"].as_array() else {
        return vec![];
    };
    let mut by_tag: BTreeMap<&str, &Value> = BTreeMap::new();
    for entry in missions {
        if let Some(tag) = entry["Tag"].as_str() {
            by_tag.insert(tag, entry);
        }
    }

    let mut result = Vec::new();
    for tag in ["CetusSyndicate", "SolarisSyndicate", "EntratiSyndicate"] {
        let Some(sm) = by_tag.get(tag).copied() else {
            continue;
        };
        let (Some(act), Some(exp)) = (date(&sm["Activation"]), date(&sm["Expiry"])) else {
            continue;
        };
        if exp <= now {
            continue;
        }
        if let Some(syn) = parse_open_world_syndicate(tag, sm, cat, act, exp) {
            result.push(syn);
        }
    }

    for (tag, decks) in FIXED_SYNDICATE_DECKS {
        let (act, exp) = if let Some(sm) = by_tag.get(tag).copied() {
            let (Some(a), Some(e)) = (date(&sm["Activation"]), date(&sm["Expiry"])) else {
                continue;
            };
            if e <= now {
                continue;
            }
            (a, e)
        } else {
            continue;
        };
        if let Some(syn) = parse_modern_syndicate(tag, decks, cat, bounty_cycle, nodes, act, exp, now) {
            result.push(syn);
        }
    }

    result
}

const VALID_SYNDICATES: &[&str] = &[
    "all",
    "CetusSyndicate",
    "SolarisSyndicate",
    "EntratiSyndicate",
    "ZarimanSyndicate",
    "EntratiLabSyndicate",
    "HexSyndicate",
];

const VALID_TIERS: &[&str] = &[
    "all",
    "tier1",
    "tier2",
    "tier3",
    "tier4",
    "tier5",
    "tier6",
    "steelPath",
    "narmer",
    "vault1",
    "vault2",
    "vault3",
    "ghoul1",
    "ghoul2",
    "plagueStar",
    "plagueStarSp",
    "lich",
];

const VALID_RARITIES: &[&str] = &["all", "common", "uncommon", "rare"];

fn invalid_opt_str(value: Option<&str>, max_len: usize) -> bool {
    value.is_some_and(|s| s.is_empty() || s.len() > max_len || s.chars().any(char::is_control))
}

pub fn validate(prefs: &BountyPreferences) -> Result<(), String> {
    if prefs.subscriptions.len() > 100 {
        return Err("赏金订阅数量不能超过 100 条".into());
    }
    let mut seen_ids = BTreeSet::new();
    for sub in &prefs.subscriptions {
        if sub.id.is_empty()
            || sub.id.len() > 64
            || sub.id.contains(':')
            || sub.id.chars().any(char::is_control)
            || !seen_ids.insert(sub.id.as_str())
        {
            return Err("赏金订阅标识无效或重复".into());
        }
        if !VALID_SYNDICATES.contains(&sub.syndicate.as_str()) {
            return Err("赏金订阅的平原/集团无效".into());
        }
        if !VALID_TIERS.contains(&sub.tier_key.as_str()) {
            return Err("赏金订阅的等级无效".into());
        }
        if !VALID_RARITIES.contains(&sub.rarity.as_str()) {
            return Err("赏金订阅的稀有度无效".into());
        }
        if invalid_opt_str(sub.item_id.as_deref(), 512)
            || invalid_opt_str(sub.item_name_zh.as_deref(), 256)
            || invalid_opt_str(sub.item_name_en.as_deref(), 256)
            || invalid_opt_str(sub.mission_type.as_deref(), 128)
            || invalid_opt_str(sub.challenge_id.as_deref(), 512)
        {
            return Err("赏金订阅筛选字段无效".into());
        }
        if DateTime::parse_from_rfc3339(&sub.created_at).is_err() {
            return Err("赏金订阅创建时间无效".into());
        }
    }
    Ok(())
}

pub fn matches_job<'a>(
    sub: &BountySubscription,
    job: &'a BountyJob,
) -> Option<Vec<&'a BountyReward>> {
    if !sub.enabled {
        return None;
    }
    if sub.syndicate != "all" && sub.syndicate != job.syndicate {
        return None;
    }
    if sub.tier_key != "all" && sub.tier_key != job.tier_key {
        return None;
    }
    if let Some(ref mission) = sub.mission_type {
        if job.mission_type.as_deref() != Some(mission.as_str()) {
            return None;
        }
    }
    if let Some(ref challenge) = sub.challenge_id {
        if job.challenge_id.as_deref() != Some(challenge.as_str()) {
            return None;
        }
    }
    if sub.item_id.is_none() && sub.rarity == "all" {
        return Some(vec![]);
    }
    let matched: Vec<&BountyReward> = job
        .rewards
        .iter()
        .filter(|reward| {
            (sub.rarity == "all" || reward.rarity == sub.rarity)
                && sub
                    .item_id
                    .as_deref()
                    .is_none_or(|target_id| reward.item_id == target_id)
        })
        .collect();
    if matched.is_empty() {
        None
    } else {
        Some(matched)
    }
}

fn rarity_zh(rarity: &str) -> &'static str {
    match rarity {
        "common" => "铜奖励",
        "uncommon" => "银奖励",
        "rare" => "金奖励",
        _ => "奖励",
    }
}

pub fn due_notices(
    bounties: &[BountySyndicate],
    prefs: &BountyPreferences,
    now: i64,
) -> Vec<(String, Notice, bool)> {
    let mut results = Vec::new();
    for syndicate in bounties {
        for job in &syndicate.jobs {
            let (Ok(act_dt), Ok(exp_dt)) = (
                DateTime::parse_from_rfc3339(&job.activation),
                DateTime::parse_from_rfc3339(&job.expiry),
            ) else {
                continue;
            };
            let act_ts = act_dt.timestamp();
            let exp_ts = exp_dt.timestamp();
            if act_ts > now || exp_ts <= now {
                continue;
            }
            for sub in &prefs.subscriptions {
                let Some(matched_rewards) = matches_job(sub, job) else {
                    continue;
                };
                let created_ts = DateTime::parse_from_rfc3339(&sub.created_at)
                    .map(|dt| dt.timestamp())
                    .unwrap_or(i64::MAX);
                let seen_key = format!("bounty:{}:{}:{}", sub.id, job.id, act_ts);
                let should_emit = prefs.enabled && act_ts > created_ts;

                let reward_summary = if let Some(first) = matched_rewards.first() {
                    let count_suffix = if matched_rewards.len() > 1 {
                        format!(" 等 {} 项", matched_rewards.len())
                    } else {
                        String::new()
                    };
                    format!("命中【{}】{}{}", rarity_zh(&first.rarity), first.zh, count_suffix)
                } else {
                    format!("命中追踪任务：{}", job.title_zh)
                };

                let rot_label = job
                    .rotation
                    .as_deref()
                    .map(|r| format!("表 {r} · "))
                    .unwrap_or_default();
                let level_label = if job.min_level > 0 {
                    format!("（Lv {}-{}）", job.min_level, job.max_level)
                } else {
                    String::new()
                };

                let notice = Notice {
                    id: seen_key.clone(),
                    title: format!("赏金轮换提醒 · {} {}", syndicate.hub_zh, job.tier_label_zh),
                    body: format!("{reward_summary} · {rot_label}{}{level_label}", job.title_zh),
                    created_at: iso(now),
                    kind: "bounty".into(),
                    delivery_error: None,
                    system_state: None,
                };
                results.push((seen_key, notice, should_emit));
            }
        }
    }
    results
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn sample_bounty_cycle(expiry_ms: i64) -> Value {
        json!({
            "expiry": expiry_ms,
            "rot": "B",
            "vaultRot": "A",
            "zarimanFaction": "FC_GRINEER",
            "bounties": {
                "ZarimanSyndicate": [
                    {"node": "SolNode231", "challenge": "/Lotus/Types/Challenges/Zariman/ZarimanUseVoidRiftsEasyChallenge"},
                    {"node": "SolNode232", "challenge": "/Lotus/Types/Challenges/Zariman/ZarimanSurvivalAbove50EasyChallenge"},
                    {"node": "SolNode230", "challenge": "/Lotus/Types/Challenges/Zariman/ZarimanCorruptionCollectLargeOrbsChallenge"},
                    {"node": "SolNode233", "challenge": "/Lotus/Types/Challenges/Zariman/ZarimanAssassinateUseAllTurretsChallenge"},
                    {"node": "SolNode235", "challenge": "/Lotus/Types/Challenges/Zariman/ZarimanExterminateNoPowersChallenge"}
                ],
                "EntratiLabSyndicate": [
                    {"node": "SolNode719", "challenge": "/Lotus/Types/Challenges/EntratiLab/EntratiLabDestroyDecorationChallenge"},
                    {"node": "SolNode718", "challenge": "/Lotus/Types/Challenges/EntratiLab/EntratiLabActivateLohkSurgeEasyChallenge"},
                    {"node": "SolNode721", "challenge": "/Lotus/Types/Challenges/EntratiLab/EntratiLabDefeatDoppelgangerChallenge"},
                    {"node": "SolNode716", "challenge": "/Lotus/Types/Challenges/EntratiLab/EntratiLabLootCratesChallenge"},
                    {"node": "SolNode717", "challenge": "/Lotus/Types/Challenges/EntratiLab/EntratiLabKillVoidRigEasyChallenge"}
                ],
                "HexSyndicate": [
                    {"node": "SolNode858", "challenge": "/Lotus/Types/Challenges/Vania/VaniaAbilityKillEasy", "ally": "/Lotus/Types/Gameplay/1999Wf/ProtoframeAllies/ArthurAllyAgent"},
                    {"node": "SolNode854", "challenge": "/Lotus/Types/Challenges/Vania/VaniaExplodingInfested", "ally": "/Lotus/Types/Gameplay/1999Wf/ProtoframeAllies/AoiAllyAgent"},
                    {"node": "SolNode856", "challenge": "/Lotus/Types/Challenges/Vania/VaniaDestroyPropsNormal", "ally": "/Lotus/Types/Gameplay/1999Wf/ProtoframeAllies/LettieAllyAgent"},
                    {"node": "SolNode850", "challenge": "/Lotus/Types/Challenges/Vania/VaniaSafeCracker", "ally": "/Lotus/Types/Gameplay/1999Wf/ProtoframeAllies/AmirAllyAgent"},
                    {"node": "SolNode852", "challenge": "/Lotus/Types/Challenges/Vania/VaniaHighKillVeryHard", "ally": "/Lotus/Types/Gameplay/1999Wf/ProtoframeAllies/QuincyAllyAgent"},
                    {"node": "SolNode853", "challenge": "/Lotus/Types/Challenges/Vania/VaniaInfestedCrossfire", "ally": "/Lotus/Types/Gameplay/1999Wf/ProtoframeAllies/EleanorAllyAgent"},
                    {"node": "SolNode852", "challenge": "/Lotus/Types/Challenges/Vania/Lich/LichVaniaHighKill"}
                ]
            }
        })
    }

    #[test]
    fn parses_all_six_hubs_and_classifies_bronze_silver_gold_rewards() {
        let raw: Value =
            serde_json::from_str(include_str!("../../tests/fixtures/world-api.json")).unwrap();
        let now = raw["Time"].as_i64().unwrap();
        let nodes = super::super::nodes();
        let cycle = sample_bounty_cycle((now + 3600) * 1000);
        let parsed = parse(&raw, Some(&cycle), &nodes, now);

        let tags: Vec<&str> = parsed.iter().map(|s| s.tag.as_str()).collect();
        assert_eq!(
            tags,
            vec![
                "CetusSyndicate",
                "SolarisSyndicate",
                "EntratiSyndicate",
                "ZarimanSyndicate",
                "EntratiLabSyndicate",
                "HexSyndicate"
            ]
        );

        let cetus = &parsed[0];
        let tier2 = cetus.jobs.iter().find(|j| j.tier_key == "tier2").unwrap();
        assert_eq!(tier2.rotation.as_deref(), Some("A"));
        assert!(tier2
            .rewards
            .iter()
            .any(|r| r.rarity == "uncommon" && r.en == "Charged Chamber" && r.zh == "蓄力装填"));
        assert!(tier2
            .rewards
            .iter()
            .any(|r| r.rarity == "common" && r.en == "Steel Fiber"));
        assert!(tier2
            .rewards
            .iter()
            .any(|r| r.rarity == "rare" && r.en == "Control Module"));

        let deimos = &parsed[2];
        assert!(deimos.jobs.iter().any(|j| j.tier_key == "vault1" && j.is_vault));

        let hex = &parsed[5];
        assert_eq!(hex.jobs.len(), 7);
        assert_eq!(hex.jobs[0].ally_en.as_deref(), Some("Arthur"));
        assert_eq!(hex.jobs[6].tier_key, "lich");
    }

    #[test]
    fn subscription_matches_exact_rotation_and_suppresses_creation_window() {
        let now = 1792742956;
        let nodes = super::super::nodes();
        let raw_a: Value =
            serde_json::from_str(include_str!("../../tests/fixtures/world-api.json")).unwrap();
        let mut raw_b = raw_a.clone();
        for sm in raw_b["SyndicateMissions"].as_array_mut().unwrap() {
            if sm["Tag"] == "CetusSyndicate" {
                sm["Activation"] = json!({"$date": {"$numberLong": ((now + 100) * 1000).to_string()}});
                sm["Expiry"] = json!({"$date": {"$numberLong": ((now + 9100) * 1000).to_string()}});
                sm["Jobs"][1]["rewards"] =
                    json!("/Lotus/Types/Game/MissionDecks/EidolonJobMissionRewards/TierBTableBRewards");
            }
        }

        let sub = BountySubscription {
            id: "sub-charged".into(),
            enabled: true,
            syndicate: "CetusSyndicate".into(),
            tier_key: "tier2".into(),
            rarity: "uncommon".into(),
            item_id: Some("/Lotus/Upgrades/Mods/Rifle/SniperReloadDamageMod".into()),
            item_name_zh: Some("蓄力装填".into()),
            item_name_en: Some("Charged Chamber".into()),
            mission_type: None,
            challenge_id: None,
            created_at: iso(now),
        };
        let prefs = BountyPreferences {
            enabled: true,
            sound_enabled: true,
            show_in_events: true,
            subscriptions: vec![sub],
        };

        // Active Table A started BEFORE subscription creation -> should NOT emit immediately.
        let syn_a = parse(&raw_a, None, &nodes, now);
        let due_initial = due_notices(&syn_a, &prefs, now);
        assert_eq!(due_initial.len(), 1);
        assert!(!due_initial[0].2);

        // Next rotation Table B does NOT contain Charged Chamber -> 0 matches.
        let syn_b = parse(&raw_b, None, &nodes, now + 100);
        assert!(due_notices(&syn_b, &prefs, now + 100).is_empty());

        // Later rotation back to Table A starting AFTER created_at -> emits!
        let mut raw_a2 = raw_a;
        for sm in raw_a2["SyndicateMissions"].as_array_mut().unwrap() {
            if sm["Tag"] == "CetusSyndicate" {
                sm["Activation"] = json!({"$date": {"$numberLong": ((now + 10000) * 1000).to_string()}});
                sm["Expiry"] = json!({"$date": {"$numberLong": ((now + 19000) * 1000).to_string()}});
            }
        }
        let syn_a2 = parse(&raw_a2, None, &nodes, now + 10000);
        let due_rotated = due_notices(&syn_a2, &prefs, now + 10000);
        assert_eq!(due_rotated.len(), 1);
        assert!(due_rotated[0].2);
        assert!(due_rotated[0].1.body.contains("蓄力装填"));
        assert!(due_rotated[0].1.title.contains("夜灵平野"));
    }

    #[test]
    fn validates_and_rejects_malformed_bounty_preferences() {
        let valid = BountyPreferences {
            enabled: true,
            sound_enabled: true,
            show_in_events: true,
            subscriptions: vec![BountySubscription {
                id: "s1".into(),
                enabled: true,
                syndicate: "CetusSyndicate".into(),
                tier_key: "tier2".into(),
                rarity: "uncommon".into(),
                item_id: Some("/Lotus/Upgrades/Mods/Rifle/SniperReloadDamageMod".into()),
                item_name_zh: Some("蓄力装填".into()),
                item_name_en: Some("Charged Chamber".into()),
                mission_type: None,
                challenge_id: None,
                created_at: iso(1792742956),
            }],
        };
        assert!(validate(&valid).is_ok());

        let mut bad_syn = valid.clone();
        bad_syn.subscriptions[0].syndicate = "EvilSyndicate".into();
        assert!(validate(&bad_syn).is_err());

        let mut bad_rarity = valid.clone();
        bad_rarity.subscriptions[0].rarity = "mythic".into();
        assert!(validate(&bad_rarity).is_err());

        let mut bad_date = valid.clone();
        bad_date.subscriptions[0].created_at = "not-a-date".into();
        assert!(validate(&bad_date).is_err());
    }
}

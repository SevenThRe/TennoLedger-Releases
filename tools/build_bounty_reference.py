"""Build desktop/public/bounty-catalog.json from browse.wf warframe-public-export-plus."""
from __future__ import annotations

import hashlib
import json
import re
import urllib.request
from pathlib import Path

BASE_URL = "https://browse.wf/warframe-public-export-plus/"
USER_AGENT = "MyFrame/0.1.9 bounty-catalog-builder"
ROOT = Path(__file__).resolve().parents[1]
OUTPUT_PATH = ROOT / "desktop" / "public" / "bounty-catalog.json"
SOURCE_INFO_PATH = ROOT / "desktop" / "public" / "world-source-info.json"

SYNDICATES = [
    {
        "tag": "CetusSyndicate",
        "nameZh": "希图斯",
        "nameEn": "Ostrons",
        "hubZh": "夜灵平野",
        "hubEn": "Plains of Eidolon",
        "planetZh": "地球",
        "planetEn": "Earth",
        "rotatesRewards": True,
        "hasVaultRot": False,
    },
    {
        "tag": "SolarisSyndicate",
        "nameZh": "索拉里斯联盟",
        "nameEn": "Solaris United",
        "hubZh": "奥布山谷",
        "hubEn": "Orb Vallis",
        "planetZh": "金星",
        "planetEn": "Venus",
        "rotatesRewards": True,
        "hasVaultRot": False,
    },
    {
        "tag": "EntratiSyndicate",
        "nameZh": "英择谛",
        "nameEn": "Entrati",
        "hubZh": "魔胎之境",
        "hubEn": "Cambion Drift",
        "planetZh": "火卫二",
        "planetEn": "Deimos",
        "rotatesRewards": True,
        "hasVaultRot": True,
    },
    {
        "tag": "ZarimanSyndicate",
        "nameZh": "坚守者",
        "nameEn": "The Holdfasts",
        "hubZh": "扎里曼十零号",
        "hubEn": "Zariman Ten Zero",
        "planetZh": "扎里曼",
        "planetEn": "Zariman",
        "rotatesRewards": False,
        "hasVaultRot": False,
    },
    {
        "tag": "EntratiLabSyndicate",
        "nameZh": "科维兽",
        "nameEn": "Cavia",
        "hubZh": "解剖圣所",
        "hubEn": "Sanctum Anatomica",
        "planetZh": "英择谛实验室",
        "planetEn": "Entrati Labs",
        "rotatesRewards": False,
        "hasVaultRot": False,
    },
    {
        "tag": "HexSyndicate",
        "nameZh": "六人组",
        "nameEn": "The Hex",
        "hubZh": "霍瓦尼亚 1999",
        "hubEn": "Höllvania 1999",
        "planetZh": "霍瓦尼亚",
        "planetEn": "Hollvania",
        "rotatesRewards": False,
        "hasVaultRot": False,
    },
]

CREDIT_AMOUNTS = {
    "1500Credits": 1500,
    "2000Credits": 2000,
    "2500Credits": 2500,
    "3000Credits": 3000,
    "4000Credits": 4000,
    "5000Credits": 5000,
    "10000Credits": 10000,
    "TableACreditsCommon": 15000,
    "TableACreditsUncommon": 30000,
    "TableBCreditsCommon": 20000,
    "TableBCreditsUncommon": 35000,
    "TableCCreditsCommon": 25000,
    "TableCCreditsUncommon": 40000,
    "TableDCreditsCommon": 30000,
    "TableDCreditsUncommon": 45000,
    "TableECreditsCommon": 35000,
    "TableECreditsUncommon": 50000,
}

ERA_ZH = {
    "Lith": "古纪",
    "Meso": "前纪",
    "Neo": "中纪",
    "Axi": "后纪",
    "Requiem": "安魂",
}

ALLIES = {
    "/Lotus/Types/Gameplay/1999Wf/ProtoframeAllies/ArthurAllyAgent": {"zh": "亚瑟", "en": "Arthur"},
    "/Lotus/Types/Gameplay/1999Wf/ProtoframeAllies/AoiAllyAgent": {"zh": "碧", "en": "Aoi"},
    "/Lotus/Types/Gameplay/1999Wf/ProtoframeAllies/LettieAllyAgent": {"zh": "莱蒂", "en": "Lettie"},
    "/Lotus/Types/Gameplay/1999Wf/ProtoframeAllies/AmirAllyAgent": {"zh": "阿米尔", "en": "Amir"},
    "/Lotus/Types/Gameplay/1999Wf/ProtoframeAllies/QuincyAllyAgent": {"zh": "昆西", "en": "Quincy"},
    "/Lotus/Types/Gameplay/1999Wf/ProtoframeAllies/EleanorAllyAgent": {"zh": "埃莉诺", "en": "Eleanor"},
}

BOUNTY_DECK_PREFIXES = (
    "/Lotus/Types/Game/MissionDecks/EidolonJobMissionRewards/",
    "/Lotus/Types/Game/MissionDecks/VenusJobMissionRewards/",
    "/Lotus/Types/Game/MissionDecks/DeimosMissionRewards/",
    "/Lotus/Types/Game/MissionDecks/ZarimanJobMissionRewards/",
    "/Lotus/Types/Game/MissionDecks/EntratiLabJobMissionReward/",
    "/Lotus/Types/Game/MissionDecks/1999MissionRewards/Tier",
    "/Lotus/Types/Game/MissionDecks/1999MissionRewards/InfestedLichBountyRewards",
)

TIER_LABELS = {
    "tier1": ("1级赏金", "Tier 1 Bounty"),
    "tier2": ("2级赏金", "Tier 2 Bounty"),
    "tier3": ("3级赏金", "Tier 3 Bounty"),
    "tier4": ("4级赏金", "Tier 4 Bounty"),
    "tier5": ("5级赏金", "Tier 5 Bounty"),
    "tier6": ("6级赏金", "Tier 6 Bounty"),
    "steelPath": ("钢铁之路", "Steel Path"),
    "narmer": ("合一众赏金", "Narmer Bounty"),
    "vault1": ("隔离库 1级", "Isolation Vault T1"),
    "vault2": ("隔离库 2级", "Isolation Vault T2"),
    "vault3": ("隔离库 3级", "Isolation Vault T3"),
    "ghoul1": ("尸鬼净化 1级", "Ghoul Purge T1"),
    "ghoul2": ("尸鬼净化 2级", "Ghoul Purge T2"),
    "plagueStar": ("瘟疫之星", "Plague Star"),
    "plagueStarSp": ("瘟疫之星（钢铁）", "Plague Star (Steel Path)"),
    "lich": ("科技细胞终结者", "Technocyte Coda"),
}

TIER_LEVELS = {
    ("CetusSyndicate", "tier1"): (5, 15, [380, 380, 380]),
    ("CetusSyndicate", "tier2"): (10, 30, [580, 580, 580]),
    ("CetusSyndicate", "tier3"): (20, 40, [640, 640, 640, 940]),
    ("CetusSyndicate", "tier4"): (30, 50, [620, 620, 620, 620, 1210]),
    ("CetusSyndicate", "tier5"): (40, 60, [690, 690, 690, 690, 1360]),
    ("CetusSyndicate", "narmer"): (50, 70, [830, 830, 830, 830, 1640]),
    ("CetusSyndicate", "ghoul1"): (15, 25, [550, 550, 550, 550]),
    ("CetusSyndicate", "ghoul2"): (40, 50, [750, 750, 750, 750]),
    ("CetusSyndicate", "plagueStar"): (15, 25, [1000]),
    ("CetusSyndicate", "plagueStarSp"): (100, 100, [3000]),
    ("SolarisSyndicate", "tier1"): (5, 15, [480, 480, 480]),
    ("SolarisSyndicate", "tier2"): (10, 30, [580, 580, 580]),
    ("SolarisSyndicate", "tier3"): (20, 40, [590, 590, 590, 870]),
    ("SolarisSyndicate", "tier4"): (30, 50, [570, 570, 570, 570, 1120]),
    ("SolarisSyndicate", "tier5"): (40, 60, [700, 700, 700, 700, 1380]),
    ("EntratiSyndicate", "tier1"): (5, 15, [4, 4, 4]),
    ("EntratiSyndicate", "tier2"): (15, 25, [10, 10, 10]),
    ("EntratiSyndicate", "tier3"): (25, 30, [14, 14, 14]),
    ("EntratiSyndicate", "tier4"): (30, 40, [17, 17, 17, 26]),
    ("EntratiSyndicate", "tier5"): (40, 60, [21, 21, 21, 21, 42]),
    ("EntratiSyndicate", "vault1"): (30, 40, [2, 2, 2, 4]),
    ("EntratiSyndicate", "vault2"): (40, 50, [4, 4, 4, 5]),
    ("EntratiSyndicate", "vault3"): (50, 60, [5, 5, 5, 7]),
    ("ZarimanSyndicate", "tier1"): (50, 55, [2]),
    ("ZarimanSyndicate", "tier2"): (60, 65, [3]),
    ("ZarimanSyndicate", "tier3"): (70, 75, [4]),
    ("ZarimanSyndicate", "tier4"): (90, 95, [6]),
    ("ZarimanSyndicate", "tier5"): (110, 115, [8]),
    ("EntratiLabSyndicate", "tier1"): (55, 60, [1500]),
    ("EntratiLabSyndicate", "tier2"): (65, 70, [2500]),
    ("EntratiLabSyndicate", "tier3"): (75, 80, [3750]),
    ("EntratiLabSyndicate", "tier4"): (95, 100, [5000]),
    ("EntratiLabSyndicate", "tier5"): (115, 120, [7500]),
    ("HexSyndicate", "tier1"): (65, 70, [1500]),
    ("HexSyndicate", "tier2"): (75, 80, [2500]),
    ("HexSyndicate", "tier3"): (85, 90, [3750]),
    ("HexSyndicate", "tier4"): (95, 100, [5000]),
    ("HexSyndicate", "tier5"): (105, 110, [6250]),
    ("HexSyndicate", "tier6"): (115, 120, [7500]),
    ("HexSyndicate", "lich"): (115, 120, [7500]),
}


def fetch_json(filename: str) -> dict:
    req = urllib.request.Request(BASE_URL + filename, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def build_name_index() -> tuple[dict, dict, dict, dict, dict]:
    dict_zh = fetch_json("dict.zh.json")
    dict_en = fetch_json("dict.en.json")
    fusion_bundles = fetch_json("ExportFusionBundles.json")
    name_keys: dict[str, object] = {}

    for fname in [
        "ExportResources.json",
        "ExportUpgrades.json",
        "ExportRecipes.json",
        "ExportRelics.json",
        "ExportArcanes.json",
        "ExportGear.json",
        "ExportCustoms.json",
        "ExportWeapons.json",
        "ExportWarframes.json",
        "ExportSentinels.json",
        "ExportKeys.json",
    ]:
        data = fetch_json(fname)
        for k, v in data.items():
            if not isinstance(v, dict):
                continue
            if "name" in v:
                name_keys[k] = v["name"]
            elif "resultType" in v:
                name_keys[k] = ("RECIPE", v["resultType"])
            elif "era" in v and "category" in v:
                name_keys[k] = ("RELIC", v["era"], v["category"])

    return dict_zh, dict_en, fusion_bundles, name_keys, {
        "bounties": fetch_json("ExportBounties.json"),
        "challenges": fetch_json("ExportChallenges.json"),
    }


def resolve_item(store_type: str, count: int, dict_zh: dict, dict_en: dict, fusion_bundles: dict, name_keys: dict) -> dict:
    norm = store_type.replace("/Lotus/StoreItems/", "/Lotus/")

    if norm in fusion_bundles:
        endo_each = int(fusion_bundles[norm].get("fusionPoints", 0))
        if endo_each > 0:
            total = endo_each * count
            return {
                "itemId": f"@endo:{total}",
                "zh": f"{total:,} 内融核心",
                "en": f"{total:,} Endo",
                "quantity": total,
                "category": "endo",
            }

    leaf = norm.rsplit("/", 1)[-1]
    if leaf in CREDIT_AMOUNTS:
        total = CREDIT_AMOUNTS[leaf] * count
        return {
            "itemId": f"@credits:{total}",
            "zh": f"{total:,} 现金",
            "en": f"{total:,} Credits",
            "quantity": total,
            "category": "credits",
        }

    if norm == "/Lotus/Types/Lore/Fragments/GrineerGhoulFragments/GhoulFragmentRewards":
        return {
            "itemId": norm,
            "zh": "尸鬼加密日志片段",
            "en": "Encrypted Journal Fragment",
            "quantity": count,
            "category": "lore",
        }

    if norm == "/Lotus/Types/Items/MiscItems/SchismKey":
        return {
            "itemId": norm,
            "zh": "阿耶精华",
            "en": "Aya",
            "quantity": count,
            "category": "aya",
        }

    entry = name_keys.get(norm) or name_keys.get(store_type)
    if isinstance(entry, tuple):
        if entry[0] == "RELIC":
            era, cat = entry[1], entry[2]
            era_zh = ERA_ZH.get(era, era)
            return {
                "itemId": norm,
                "zh": f"{era_zh} {cat} 遗物",
                "en": f"{era} {cat} Relic",
                "quantity": count,
                "category": "relic",
            }
        if entry[0] == "RECIPE":
            res_key = name_keys.get(entry[1])
            if isinstance(res_key, str):
                en = dict_en.get(res_key, res_key)
                zh = dict_zh.get(res_key, en)
                return {
                    "itemId": norm,
                    "zh": f"{zh} 蓝图",
                    "en": f"{en} Blueprint",
                    "quantity": count,
                    "category": "blueprint",
                }

    if isinstance(entry, str):
        en = dict_en.get(entry, entry)
        zh = dict_zh.get(entry, en)
        cat = "mod" if "/Upgrades/Mods/" in norm else "item"
        return {
            "itemId": norm,
            "zh": zh,
            "en": en,
            "quantity": count,
            "category": cat,
        }

    raise ValueError(f"Unresolved bounty reward item: {store_type}")


def classify_deck_meta(deck_id: str) -> dict:
    leaf = deck_id.rsplit("/", 1)[-1]
    rot_match = re.search(r"Table([ABC])Rewards$", leaf)
    rotation = rot_match.group(1) if rot_match else None

    applicable = []
    if "/EidolonJobMissionRewards/" in deck_id:
        syndicate = "CetusSyndicate"
        if leaf.startswith("NarmerTable"):
            tier_key = "narmer"
            tier_index = 7
            is_narmer, is_vault, is_endless, is_event = True, False, False, False
            applicable = ["CetusSyndicate", "SolarisSyndicate"]
        elif leaf.startswith("GhoulBountyTable"):
            ghoul_rot = "A" if leaf.endswith("TableARewards") else "B"
            tier_key = "ghoul1" if ghoul_rot == "A" else "ghoul2"
            tier_index = 8 if ghoul_rot == "A" else 9
            rotation = None
            is_narmer, is_vault, is_endless, is_event = False, False, False, True
        elif leaf == "PlagueStarTableRewards":
            tier_key = "plagueStar"
            tier_index = 10
            is_narmer, is_vault, is_endless, is_event = False, False, False, True
        elif leaf == "PlagueStarTableSteelPathRewards":
            tier_key = "plagueStarSp"
            tier_index = 11
            is_narmer, is_vault, is_endless, is_event = False, False, False, True
        else:
            m = re.match(r"^Tier([ABCDE])Table([ABC])Rewards$", leaf)
            assert m, f"Unexpected Eidolon deck {deck_id}"
            idx = "ABCDE".index(m.group(1)) + 1
            tier_key = f"tier{idx}"
            tier_index = idx
            is_narmer, is_vault, is_endless, is_event = False, False, False, False
    elif "/VenusJobMissionRewards/" in deck_id:
        syndicate = "SolarisSyndicate"
        m = re.match(r"^VenusTier([ABCDE])Table([ABC])Rewards$", leaf)
        assert m, f"Unexpected Venus deck {deck_id}"
        idx = "ABCDE".index(m.group(1)) + 1
        tier_key = f"tier{idx}"
        tier_index = idx
        is_narmer, is_vault, is_endless, is_event = False, False, False, False
    elif "/DeimosMissionRewards/" in deck_id:
        syndicate = "EntratiSyndicate"
        is_narmer, is_event = False, False
        if leaf.startswith("VaultBountyTier"):
            m = re.match(r"^VaultBountyTier([ABC])Table([ABC])Rewards$", leaf)
            assert m, f"Unexpected Vault deck {deck_id}"
            idx = "ABC".index(m.group(1)) + 1
            tier_key = f"vault{idx}"
            tier_index = 6 + idx
            is_vault, is_endless = True, False
        else:
            m = re.match(r"^Tier([ABCDE])Table([ABC])Rewards$", leaf)
            assert m, f"Unexpected Deimos deck {deck_id}"
            letter = m.group(1)
            # DE swaps TierB (endless tier 3) and TierC (tier 2) in DeimosMissionRewards
            deimos_map = {"A": ("tier1", 1, False), "C": ("tier2", 2, False), "B": ("tier3", 3, True), "D": ("tier4", 4, False), "E": ("tier5", 5, False)}
            tier_key, tier_index, is_endless = deimos_map[letter]
            is_vault = False
    elif "/ZarimanJobMissionRewards/" in deck_id:
        syndicate = "ZarimanSyndicate"
        m = re.match(r"^Tier([ABCDE])Table", leaf)
        assert m, f"Unexpected Zariman deck {deck_id}"
        idx = "ABCDE".index(m.group(1)) + 1
        tier_key = f"tier{idx}"
        tier_index = idx
        rotation = None
        is_narmer, is_vault, is_endless, is_event = False, False, False, False
    elif "/EntratiLabJobMissionReward/" in deck_id:
        syndicate = "EntratiLabSyndicate"
        m = re.match(r"^Tier([ABCDE])Table", leaf)
        assert m, f"Unexpected EntratiLab deck {deck_id}"
        idx = "ABCDE".index(m.group(1)) + 1
        tier_key = f"tier{idx}"
        tier_index = idx
        rotation = None
        is_narmer, is_vault, is_endless, is_event = False, False, False, False
    elif "/1999MissionRewards/" in deck_id:
        syndicate = "HexSyndicate"
        rotation = None
        is_narmer, is_vault, is_endless, is_event = False, False, False, False
        if leaf == "InfestedLichBountyRewards":
            tier_key = "lich"
            tier_index = 7
        else:
            m = re.match(r"^Tier([ABCDEF])BountyRewards$", leaf)
            assert m, f"Unexpected 1999 deck {deck_id}"
            idx = "ABCDEF".index(m.group(1)) + 1
            tier_key = f"tier{idx}"
            tier_index = idx
    else:
        raise ValueError(f"Unhandled bounty deck: {deck_id}")

    if not applicable:
        applicable = [syndicate]

    label_zh, label_en = TIER_LABELS[tier_key]
    min_lv, max_lv, standing = TIER_LEVELS.get((syndicate, tier_key), (0, 0, []))
    return {
        "syndicate": syndicate,
        "applicableSyndicates": applicable,
        "tierKey": tier_key,
        "tierIndex": tier_index,
        "tierLabelZh": label_zh,
        "tierLabelEn": label_en,
        "minLevel": min_lv,
        "maxLevel": max_lv,
        "standingStages": standing,
        "rotation": rotation,
        "isSteelPath": tier_key == "plagueStarSp",
        "isNarmer": is_narmer,
        "isVault": is_vault,
        "isEndless": is_endless,
        "isEvent": is_event,
    }


def extract_rewards(deck_id: str, stages: list, dict_zh: dict, dict_en: dict, fusion_bundles: dict, name_keys: dict) -> list[dict]:
    if len(stages) == 4:
        s0, s1, s2, s3 = stages
        n0, n1, n2 = len(s0), len(s1), len(s2)
        if len(s3) != n2 - n0:
            raise ValueError(f"Unexpected 4-stage final count in {deck_id}: {[len(x) for x in stages]}")
        rows = []
        for idx, d in enumerate(s2):
            if idx < n0:
                rarity = "common"
                chance = round(float(s0[idx]["probability"]) * 100.0, 2)
                final_chance = None
            elif idx < n1:
                rarity = "uncommon"
                chance = round(float(s1[idx]["probability"]) * 100.0, 2)
                final_chance = round(float(s3[idx - n0]["probability"]) * 100.0, 2)
            else:
                rarity = "rare"
                chance = round(float(s2[idx]["probability"]) * 100.0, 2)
                final_chance = round(float(s3[idx - n0]["probability"]) * 100.0, 2)
            resolved = resolve_item(d["type"], int(d.get("itemCount", 1)), dict_zh, dict_en, fusion_bundles, name_keys)
            resolved["rarity"] = rarity
            resolved["chance"] = chance
            resolved["finalChance"] = final_chance
            rows.append(resolved)
        return rows

    if len(stages) != 1:
        raise ValueError(f"Unexpected stage count {len(stages)} in {deck_id}")

    entries = stages[0]
    if deck_id.endswith("InfestedLichBountyRewards"):
        return [
            {
                **resolve_item(d["type"], int(d.get("itemCount", 1)), dict_zh, dict_en, fusion_bundles, name_keys),
                "rarity": "common",
                "chance": round(float(d["probability"]) * 100.0, 2),
                "finalChance": None,
            }
            for d in entries
        ]

    # For single-stage Zariman / EntratiLab / 1999 decks:
    # Items strictly after SchismKey (Aya) are Rare (gold);
    # Uncommon (silver) begins at the first item whose normalized name/type leaves the opening Common block:
    # - 1999 TierD/E have 5 opening items (Endo/3xLens/DogTag), TierF has 3 opening items (Endo/2xCommonRes)
    # - Zariman/EntratiLab TierC/D/E with Greater Lenses have 3-4 opening items, TierA/B have 3 opening items
    schism_idx = next((i for i, d in enumerate(entries) if d["type"].endswith("/SchismKey")), None)
    if schism_idx is None:
        raise ValueError(f"Expected SchismKey anchor in single-stage deck {deck_id}")

    uncommon_start = None
    for idx in range(1, schism_idx):
        leaf = entries[idx]["type"].rsplit("/", 1)[-1]
        if (
            idx >= 2
            and (
                leaf.endswith("CreditsUncommon")
                or leaf == "UncommonFusionBundle"
                or leaf == "RareFusionBundle"
                or "MiscItem" in leaf
                or "ResourceUncommon" in leaf
                or "ResourceRare" in leaf
                or leaf == "EntratiLabDogTagUncommon"
            )
        ):
            # In Zariman/Cavia TierE or 1999 TierD, DogTag is the last Common item before Rare/Uncommon Endo
            if idx == 3 and entries[idx]["type"].rsplit("/", 1)[-1] == "EntratiLabDogTagUncommon" and "TierC" in deck_id:
                continue
            uncommon_start = idx
            break
    if uncommon_start is None:
        uncommon_start = max(1, schism_idx - 2)

    rows = []
    for idx, d in enumerate(entries):
        if idx < uncommon_start:
            rarity = "common"
        elif idx <= schism_idx:
            rarity = "uncommon"
        else:
            rarity = "rare"
        resolved = resolve_item(d["type"], int(d.get("itemCount", 1)), dict_zh, dict_en, fusion_bundles, name_keys)
        resolved["rarity"] = rarity
        resolved["chance"] = round(float(d["probability"]) * 100.0, 2)
        resolved["finalChance"] = None
        rows.append(resolved)
    return rows


def main() -> None:
    dict_zh, dict_en, fusion_bundles, name_keys, extra = build_name_index()
    export_rewards = fetch_json("ExportRewards.json")

    decks = {}
    for deck_id in sorted(export_rewards.keys()):
        if not any(deck_id.startswith(prefix) for prefix in BOUNTY_DECK_PREFIXES):
            continue
        meta = classify_deck_meta(deck_id)
        rewards = extract_rewards(deck_id, export_rewards[deck_id], dict_zh, dict_en, fusion_bundles, name_keys)
        decks[deck_id] = {**meta, "rewards": rewards}

    jobs = {}
    for job_id, job in sorted(extra["bounties"].items()):
        name_key = job.get("name", "")
        en = dict_en.get(name_key, job_id.rsplit("/", 1)[-1])
        zh = dict_zh.get(name_key, en)
        jobs[job_id] = {"zh": zh, "en": en}

    challenges = {}
    for ch_id, ch in sorted(extra["challenges"].items()):
        if not any(tag in ch_id for tag in ("/Zariman/", "/EntratiLab/", "/Vania/")):
            continue
        name_key = ch.get("name", "")
        desc_key = ch.get("description", "")
        required = ch.get("requiredCount")
        en = dict_en.get(name_key, ch_id.rsplit("/", 1)[-1])
        zh = dict_zh.get(name_key, en)
        desc_en = dict_en.get(desc_key, "")
        desc_zh = dict_zh.get(desc_key, desc_en)
        if required is not None:
            for val_str in (str(required),):
                en = en.replace("|COUNT|", val_str)
                zh = zh.replace("|COUNT|", val_str)
                desc_en = desc_en.replace("|COUNT|", val_str)
                desc_zh = desc_zh.replace("|COUNT|", val_str)
        challenges[ch_id] = {"zh": zh, "en": en, "descZh": desc_zh, "descEn": desc_en}

    payload = {
        "schemaVersion": 1,
        "syndicates": SYNDICATES,
        "decks": decks,
        "jobs": jobs,
        "challenges": challenges,
        "allies": ALLIES,
    }
    serialized = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    OUTPUT_PATH.write_text(serialized, encoding="utf-8")

    # Update world-source-info.json metadata
    if SOURCE_INFO_PATH.is_file():
        info = json.loads(SOURCE_INFO_PATH.read_text(encoding="utf-8"))
        info.setdefault("sources", {})["bountyCycle"] = "https://oracle.browse.wf/bounty-cycle"
        info["sources"]["bountyCatalog"] = "https://browse.wf/warframe-public-export-plus/"
        raw_bytes = OUTPUT_PATH.read_bytes()
        info.setdefault("files", {})["bounty-catalog.json"] = {
            "sha256": hashlib.sha256(raw_bytes).hexdigest(),
            "bytes": len(raw_bytes),
        }
        SOURCE_INFO_PATH.write_text(json.dumps(info, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"Generated {OUTPUT_PATH}: {len(decks)} decks, {len(jobs)} jobs, {len(challenges)} challenges ({len(serialized)} bytes)")
    # Print 1-stage splits for visual sanity check
    for k, d in sorted(decks.items()):
        if d["syndicate"] in ("ZarimanSyndicate", "EntratiLabSyndicate", "HexSyndicate"):
            by_r = {r: [f"{x['zh']}({x['chance']}%)" for x in d["rewards"] if x["rarity"] == r] for r in ("common", "uncommon", "rare")}
            print(f"  {d['syndicate']} {d['tierKey']}: C={len(by_r['common'])} U={len(by_r['uncommon'])} R={len(by_r['rare'])} | rare={by_r['rare']}")


if __name__ == "__main__":
    main()

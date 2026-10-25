import type {RivenChallenge} from './rivenModel.ts';

// Human translations of the bundled AlecaFrame challenge templates, not official export strings.
const challenges:Record<string,[string,string]> = {
 RandomizedKill:['Kill |COUNT| Enemies','击杀 |COUNT| 名敌人'],
 RandomizedHeadshot:['Kill |COUNT| Enemies with Headshots','爆头击杀 |COUNT| 名敌人'],
 RandomizedKillSentients:['Get the killing blow on |COUNT| Sentients','对 |COUNT| 名 Sentient 完成最后一击'],
 RandomizedFinisherKill:['Kill |COUNT| Enemies with Finishers','使用处决击杀 |COUNT| 名敌人'],
 RandomizedStyleKill:['Kill |COUNT| Enemies while Sliding','滑行时击杀 |COUNT| 名敌人'],
 HighExterminationUndetected:['Complete an Extermination mission with level 30 or higher enemies without being detected','在未被发现的情况下完成敌人等级不低于 30 级的歼灭任务'],
 HighPerfectDefense:['Complete a Defense mission with level 30 or higher enemies with the defense objective taking no damage','完成敌人等级不低于 30 级的防御任务，且防御目标不受到伤害'],
 HighSurvivalPacifist:['Complete a Survival mission with level 30 or higher enemies without killing anyone','在不击杀任何敌人的情况下完成敌人等级不低于 30 级的生存任务'],
 HighSoloInterceptionHobbled:['Complete a Solo Interception mission with level 30 or higher enemies and a Hobbled Dragon Key equipped','装备蹒跚龙钥，单人完成敌人等级不低于 30 级的拦截任务'],
 RandomizedFindRareMedallions:['Pick up |COUNT| Syndicate Medallions','拾取 |COUNT| 个集团奖章'],
 RandomizedFindCaches:['Find |COUNT| Caches','找到 |COUNT| 个储藏舱'],
 RandomizedHeadshotGlide:['Get |COUNT| Headshot kills in a single Aim Glide','在一次瞄准滑翔中爆头击杀 |COUNT| 名敌人'],
 RandomizedWallClingKillstreak:['Get |COUNT| kills in a row while Wall Dashing or Wall Latching without touching the floor','在攀墙或附墙期间连续击杀 |COUNT| 名敌人，且不接触地面'],
 SustainMeleeComboThree:['Sustain a 6x Melee Combo Multiplier for 30s','保持 6 倍近战连击倍率 30 秒'],
 LimitedSynthesis:['Synthesize a Simaris target without using Traps or Abilities while having a Hobbled Dragon Key equipped','装备蹒跚龙钥，在不使用陷阱或技能的情况下完成 Simaris 目标结合扫描'],
 RandomizedKillFallingPilots:['Kill |COUNT| Dargyn Pilots before they hit the ground','在落地前击杀 |COUNT| 名轻型艇驾驶员'],
 RandomizedHeadshotUnawareBallistas:['Kill |COUNT| unalerted Tusk Ballistas with a Headshot','爆头击杀 |COUNT| 名未警觉的 Tusk 弩炮手'],
 RandomizedSkiffArcher:['Destroy |COUNT| Dargyns in flight using a bow','使用弓摧毁 |COUNT| 艘飞行中的轻型艇'],
 RandomizedLongRangeSniper:['Kill |COUNT| Enemies with Headshots from at least 75m away','在至少 75 米外爆头击杀 |COUNT| 名敌人'],
 RandomizedFlyingHeadshotSeries:['Land |COUNT| consecutive headshots while in Archwing in the Plains of Eidolon','在夜灵平野使用 Archwing 时连续爆头 |COUNT| 次'],
 RandomizedAntiAntiAir:['Destroy |COUNT| Vruush Turrets while in Archwing without dying or becoming downed','使用 Archwing 摧毁 |COUNT| 座 Vruush 炮塔，且不死亡或倒地'],
 RandomizedFisherman:['Catch |COUNT| fish without missing a throw','捕获 |COUNT| 条鱼，且每次投掷都命中'],
 RandomizedKillPassengers:['Kill |COUNT| Enemies that are on a Dropship','击杀 |COUNT| 名运输艇上的敌人'],
 PlainsTimedVariety:['Catch one fish, mine one gem or metal, and kill one enemy in 30 seconds','在 30 秒内捕获一条鱼、采集一颗宝石或金属并击杀一名敌人'],
};
const conditions:Record<string,string> = {
 'without taking damage':'不受到伤害',
 'without dying or becoming downed':'不死亡或倒地',
 'without being disrupted by a <DT_MAGNETIC>Magnetic Damage':'不受到磁力伤害干扰',
 'without getting afflicted by a Status Effect':'不受到异常状态影响',
 'without an ally becoming downed':'没有队友倒地',
 'with an Extinguished Dragon Key equipped':'装备熄灭龙钥',
 'with a Bleeding Dragon Key equipped':'装备残血龙钥',
 'with a Decaying Dragon Key equipped':'装备腐朽龙钥',
 'with a Hobbled Dragon Key equipped':'装备蹒跚龙钥',
 'without using health consumables':'不使用生命恢复消耗品',
 'without using shield-restoring consumables':'不使用护盾恢复消耗品',
 'without using ammo consumables':'不使用弹药恢复消耗品',
 'without using energy consumables':'不使用能量恢复消耗品',
 'in one day':'在一天内完成',
 'while undetected':'在未被发现时',
 'while sliding':'在滑行时',
 'while Aim Glide':'在瞄准滑翔时',
 'without raising any alarms':'不触发任何警报',
 'without failing a mission':'不发生任务失败',
 ', while alone or in Solo Mode':'独自一人或处于单人模式',
 'while invisible':'在隐身时',
 'with an active pet present':'携带存活的宠物',
 'with an active sentinel present':'携带存活的守护',
 'without using ciphers':'不使用破解器',
 'without using air support':'不使用空中支援',
};

export function rivenChallengeText(c:RivenChallenge,language='zh-CN') {
 const original={group:c.group,description:c.description};
 if(!language.startsWith('zh'))return original;
 const pair=challenges[c.id.replace(/^\/Lotus\/Types\/Challenges\//,'')];
 if(!pair)return original;
 const count=c.required==null?'—':String(c.required),base=pair[0].replace('|COUNT|',count);
 // Translate only the exact known template. Preserve changed or unknown conditions in full.
 const suffix=c.description===base?'':c.description.startsWith(base+' ')?c.description.slice(base.length+1):null;
 if(suffix==null||(suffix&&!Object.hasOwn(conditions,suffix)))return original;
 return {group:pair[1].replace(/\s*\|COUNT\|\s*[名个艘座条次颗]?/,''),description:pair[1].replace('|COUNT|',count)+(suffix?'，'+conditions[suffix]:'')};
}

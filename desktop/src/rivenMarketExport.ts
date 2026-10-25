import type {Riven} from './rivenModel.ts';
// Riven.market identifiers verified 2026-10-23 against
// https://riven.market/_modules/riven/warframeData.js
// Use semantic IDs: several current WFM prefix/suffix pairs collide.
export const rivenMarketStats:Record<string,string> = {
  "punch_through": "Punch",
  "slash_damage": "Slash",
  "impact_damage": "Impact",
  "toxin_damage": "Toxin",
  "status_duration": "StatusD",
  "ammo_maximum": "Ammo",
  "recoil": "Recoil",
  "zoom": "Zoom",
  "channeling_damage": "InitC",
  "channeling_efficiency": "ComboEfficiency",
  "critical_chance": "CritChance",
  "critical_damage": "CritDmg",
  "base_damage_/_melee_damage": "Damage",
  "heat_damage": "Heat",
  "multishot": "Multi",
  "reload_speed": "Reload",
  "range": "Range",
  "damage_vs_corpus": "Corpus",
  "damage_vs_grineer": "Grineer",
  "puncture_damage": "Puncture",
  "damage_vs_infested": "Infested",
  "electric_damage": "Electric",
  "finisher_damage": "Finisher",
  "fire_rate_/_attack_speed": "Speed",
  "projectile_speed": "Flight",
  "magazine_capacity": "Magazine",
  "status_chance": "StatusC",
  "cold_damage": "Cold",
  "combo_duration": "Combo",
  "critical_chance_on_slide_attack": "Slide",
  "chance_to_gain_extra_combo_count": "ComboGainExtra",
  "chance_to_gain_combo_count": "ComboGainLost",
  "ammo_efficiency": "AmmoEfficiency",
  "blast": "BlastDamage",
  "corrosive": "CorrosiveDamage",
  "damage_to_orokin": "Orokin",
  "damage_to_scaldra": "Scaldra",
  "damage_to_techrot": "Techrot",
  "gas": "GasDamage",
  "heavy_attack_wind_up_speed": "HeavyAttackWindUpSpeed",
  "magazine_reloaded_s_when_holstered": "ReloadWhileHolstered",
  "magnetic": "MagneticDamage",
  "melee_damage_on_heavy_attack": "MeleeDamageOnHeavyAttack",
  "parry_angle": "ParryAngle",
  "radiation": "RadiationDamage",
  "slam_attack_damage": "SlamAttackDamage",
  "status_damage": "StatusDamage",
  "viral": "ViralDamage",
  "weak_point_critical_chance": "WeakpointCriticalChance",
  "weak_point_damage": "WeakpointDamage",
  "weapon_recoil": "Recoil"
};


export function rivenMarketImport(r:Riven,weaponName:string){
 if(r.veiled||!weaponName.trim()||!r.attributes.length)throw Error('紫卡数据不完整，无法导出');
 const Positives:Record<string,string>={},Negatives:Record<string,string>={};
 for(const a of r.attributes){
  const key=Object.hasOwn(rivenMarketStats,a.slug)?rivenMarketStats[a.slug]:undefined;
  if(!key||!Number.isFinite(a.value))throw Error('Riven.market 尚不支持词条：'+a.name);
  const target=a.positive?Positives:Negatives;
  if(key in target)throw Error('重复的紫卡词条：'+a.name);
  target[key]=String(Math.abs(a.value));
 }
 return {weaponData:weaponName.trim().replaceAll(' ','_'),Rank:r.rank,MR:r.masteryLevel,Rolls:r.rerolls,name:null,Positives,Negatives};
}
export function rivenMarketExportUrl(r:Riven,weaponName:string){
 const bytes=new TextEncoder().encode(JSON.stringify(rivenMarketImport(r,weaponName)));
 const encoded=btoa(Array.from(bytes,b=>String.fromCharCode(b)).join(''));
 return 'https://riven.market/sell?import='+encodeURIComponent(encoded);
}

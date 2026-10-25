import {shardEffectNamesZh,shardEffectDescriptionsZh} from './shardEffectsZh.ts';
const prefix='/Lotus/Upgrades/Invigorations/ArchonCrystalUpgrades/ArchonCrystalUpgrade';
const damageNames:Record<string,string>={BLAST:'Blast',EXPLOSION:'Blast',CORROSIVE:'Corrosive',ELECTRICITY:'Electricity',FIRE:'Heat',HEAT:'Heat',FREEZE:'Cold',GAS:'Gas',IMPACT:'Impact',MAGNETIC:'Magnetic',POISON:'Toxin',TOXIN:'Toxin',PUNCTURE:'Puncture',RADIATION:'Radiation',RADIANT:'Void',SENTIENT:'Tau',SLASH:'Slash',VIRAL:'Viral',VOID:'Void',TAU:'Tau',TRUE:'True damage'};
/** Normalize catalog text using the corrections verified in the 3.0.4 reference. */
export function shardEffectDescription(id:string,raw:unknown,en=true):string|null{
 if(typeof raw!=='string'||!raw.trim())return null;
 let text=raw;
 const effect=id.startsWith(prefix)?id.slice(prefix.length):'';
 if(!en)return shardEffectDescriptionsZh[effect]??null;
 if(/^WarframeToxinHeal(?:Mythic)?$/.test(effect))text=text.replace('Health on damaging enemies with <DT_TOXIN>','Health whenever enemies take damage from a <DT_TOXIN> Status Effect');
 if(effect==='WarframeCritDamageBoostMythic')text=text.replace(/^\+37%(?=\s)/,'+37.5%');
 if(/^WarframeBlastProc(?:Mythic)?$/.test(effect))text=text.replaceAll('Shields on inflicting <DT_BLAST>','Shields per enemy killed with <DT_BLAST> Damage');
 if(/^WarframeElectricDamage(?:Mythic)?$/.test(effect))text=text.replaceAll('per extra Shard','per additional Crimson, Azure, or Violet shard');
 text=text.replace(/<DT_([A-Z_]+)>/g,(token,key:string)=>damageNames[key]??token);
 const replacements=[['Ab. DMG','Ability damage'],['Ab DMG','Ability damage'],['with by ','affected by '],['crit DMG','critical damage'],['Crit DMG','critical damage'],['Crit Chance','critical chance'],['crit %','critical chance'],['status %','status chance'],['Corrosion Status max stacks','maximum Corrosive stacks'],['Energy max','maximum energy'],['Regen','Health/s'],['Cast speed','casting speed'],['Spawn energy','starting energy'],['Orb health','Health orb effectiveness'],['Orb energy','Energy orb effectiveness']];
 for(const [from,to] of replacements)text=text.replaceAll(from,to);
 return text.trim();
}

export const shardEffectDefinitions=[
 {
  "color": "red",
  "id": "WarframeAbilityStrength",
  "name": "Ability strength"
 },
 {
  "color": "red",
  "id": "WarframeAbilityDuration",
  "name": "Ability duration"
 },
 {
  "color": "red",
  "id": "MeleeCritDamage",
  "name": "Melee critical damage"
 },
 {
  "color": "red",
  "id": "PrimaryStatusChance",
  "name": "Primary status chance"
 },
 {
  "color": "red",
  "id": "SecondaryCritChance",
  "name": "Secondary critical chance"
 },
 {
  "color": "yellow",
  "id": "WarframeCastingSpeed",
  "name": "Casting speed"
 },
 {
  "color": "yellow",
  "id": "WarframeParkourVelocity",
  "name": "Parkour velocity"
 },
 {
  "color": "yellow",
  "id": "WarframeStartingEnergy",
  "name": "Starting energy"
 },
 {
  "color": "yellow",
  "id": "WarframeGlobeEffectHealth",
  "name": "Health orb effectiveness"
 },
 {
  "color": "yellow",
  "id": "WarframeGlobeEffectEnergy",
  "name": "Energy orb effectiveness"
 },
 {
  "color": "blue",
  "id": "WarframeHealthMax",
  "name": "Health"
 },
 {
  "color": "blue",
  "id": "WarframeShieldMax",
  "name": "Shields"
 },
 {
  "color": "blue",
  "id": "WarframeArmourMax",
  "name": "Armor"
 },
 {
  "color": "blue",
  "id": "WarframeEnergyMax",
  "name": "Maximum energy"
 },
 {
  "color": "blue",
  "id": "WarframeRegen",
  "name": "Health regeneration"
 },
 {
  "color": "green",
  "id": "WarframeToxinDamage",
  "name": "Toxin status damage"
 },
 {
  "color": "green",
  "id": "WarframeToxinHeal",
  "name": "Healing from Toxin"
 },
 {
  "color": "green",
  "id": "WarframeCorrosiveDamageBoost",
  "name": "Ability damage, Corrosive"
 },
 {
  "color": "green",
  "id": "WarframeCorrosiveStack",
  "name": "Maximum Corrosive stacks"
 },
 {
  "color": "orange",
  "id": "WarframeHPBoostFromImpact",
  "name": "Health from Blast kills"
 },
 {
  "color": "orange",
  "id": "WarframeBlastProc",
  "name": "Shields from Blast kills"
 },
 {
  "color": "orange",
  "id": "WeaponCritBoostFromHeat",
  "name": "Secondary critical chance, Heat"
 },
 {
  "color": "orange",
  "id": "WarframeRadiationDamageBoost",
  "name": "Ability damage, Radiation"
 },
 {
  "color": "purple",
  "id": "WarframeElectricDamageBoost",
  "name": "Ability damage, Electricity"
 },
 {
  "color": "purple",
  "id": "WarframeElectricDamage",
  "name": "Primary Electricity damage"
 },
 {
  "color": "purple",
  "id": "WarframeCritDamageBoost",
  "name": "Melee critical damage, energy"
 },
 {
  "color": "purple",
  "id": "Equilibrium",
  "name": "Health & energy conversion"
 }
] as const;
export function shardEffectSummary(slots:readonly {installed:boolean;effectId:string}[],unknown='Unrecognized effect',en=true){
 const groups=new Map<string,number>();
 for(const slot of slots){
  if(!slot.installed)continue;
  const definition=shardEffectDefinitions.find(effect=>prefix+effect.id===slot.effectId.replace(/Mythic$/, ''));
  const name=definition?shardEffectName(definition,en):unknown;
  groups.set(name,(groups.get(name)??0)+1);
 }
 return [...groups].map(([name,amount])=>({name,amount}));
}

export function shardEffectName(definition:{id:string;name:string},en:boolean){return en?definition.name:shardEffectNamesZh[definition.id]??'未知效果';}

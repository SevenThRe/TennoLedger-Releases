import type {ResourceRecipe} from './resourcePlan.ts';

export type OpenWorldZone='eidolon'|'solaris'|'deimos';
export type VeinKind='ore'|'gem';
export type MineralRarity='common'|'uncommon'|'rare'|'eidolon';
export type DrillTier='any'|'sunpoint';
export type MiningVendor='suumbaat'|'smokefinger'|'otak';
export type MiningAltSource='thumper'|'exploiter'|'obelisk'|'iso_vault';

export type RawMineralMeta={
 id:string;
 zone:OpenWorldZone;
 vein:VeinKind;
 rarity:MineralRarity;
 drillTier:DrillTier;
 vendor:MiningVendor;
 altSources:readonly MiningAltSource[];
};

export const OPEN_WORLD_ZONES:readonly OpenWorldZone[]=['eidolon','solaris','deimos'];

export const ZONE_VENDOR:Readonly<Record<OpenWorldZone,MiningVendor>>={
 eidolon:'suumbaat',
 solaris:'smokefinger',
 deimos:'otak',
};

export const MINING_ZONE_LABELS:Readonly<Record<OpenWorldZone,{zh:string;en:string;oreColor:'red'|'yellow'}>>={
 eidolon:{zh:'夜灵平野',en:'Plains of Eidolon',oreColor:'red'},
 solaris:{zh:'奥布山谷',en:'Orb Vallis',oreColor:'red'},
 deimos:{zh:'魔胎之境',en:'Cambion Drift',oreColor:'yellow'},
};

export const MINING_VENDOR_LABELS:Readonly<Record<MiningVendor,{zh:string;en:string}>>={
 suumbaat:{zh:'老头苏巴特',en:'Old Man Suumbaat'},
 smokefinger:{zh:'烟指',en:'Smokefinger'},
 otak:{zh:'奥塔克',en:'Otak'},
};

export const MINING_ALT_SOURCE_LABELS:Readonly<Record<MiningAltSource,{zh:string;en:string}>>={
 thumper:{zh:'重击者',en:'Tusk Thumper'},
 exploiter:{zh:'剥削者圆蛛',en:'Exploiter Orb'},
 obelisk:{zh:'安魂方尖碑',en:'Requiem Obelisk'},
 iso_vault:{zh:'隔离库',en:'Isolation Vault'},
};

const raw=(
 id:string,
 zone:OpenWorldZone,
 vein:VeinKind,
 rarity:MineralRarity,
 drillTier:DrillTier='any',
 altSources:readonly MiningAltSource[]=[]
):RawMineralMeta=>({id,zone,vein,rarity,drillTier,vendor:ZONE_VENDOR[zone],altSources});

export const RAW_MINERALS:readonly RawMineralMeta[]=[
 // Plains of Eidolon (Cetus)
 raw('/Lotus/Types/Items/Gems/Eidolon/CommonOreAItem','eidolon','ore','common','any',['thumper']),
 raw('/Lotus/Types/Items/Gems/Eidolon/CommonOreBItem','eidolon','ore','common'),
 raw('/Lotus/Types/Items/Gems/Eidolon/UncommonOreAItem','eidolon','ore','uncommon','any',['thumper']),
 raw('/Lotus/Types/Items/Gems/Eidolon/RareOreAItem','eidolon','ore','rare','any',['thumper']),
 raw('/Lotus/Types/Items/Gems/Eidolon/CommonGemAItem','eidolon','gem','common','any',['thumper']),
 raw('/Lotus/Types/Items/Gems/Eidolon/CommonGemBItem','eidolon','gem','common','any',['thumper']),
 raw('/Lotus/Types/Items/Gems/Eidolon/UncommonGemAItem','eidolon','gem','uncommon','any',['thumper']),
 raw('/Lotus/Types/Items/Gems/Eidolon/RareGemAItem','eidolon','gem','rare','any',['thumper']),
 raw('/Lotus/Types/Items/Gems/Eidolon/EidolonGemAItem','eidolon','gem','eidolon','sunpoint',['thumper']),
 raw('/Lotus/Types/Items/Gems/Eidolon/EidolonGemBItem','eidolon','gem','eidolon','sunpoint',['thumper']),

 // Orb Vallis (Fortuna / Solaris)
 raw('/Lotus/Types/Items/Gems/Solaris/SolarisCommonOreAItem','solaris','ore','common','any',['exploiter']),
 raw('/Lotus/Types/Items/Gems/Solaris/SolarisCommonOreBItem','solaris','ore','common','any',['exploiter']),
 raw('/Lotus/Types/Items/Gems/Solaris/SolarisUncommonOreItem','solaris','ore','uncommon','any',['exploiter']),
 raw('/Lotus/Types/Items/Gems/Solaris/SolarisRareOreAItem','solaris','ore','rare','any',['exploiter']),
 raw('/Lotus/Types/Items/Gems/Solaris/SolarisCommonGemAItem','solaris','gem','common','any',['exploiter']),
 raw('/Lotus/Types/Items/Gems/Solaris/SolarisCommonGemBItem','solaris','gem','common','any',['exploiter']),
 raw('/Lotus/Types/Items/Gems/Solaris/SolarisUncommonGemAItem','solaris','gem','uncommon','any',['exploiter']),
 raw('/Lotus/Types/Items/Gems/Solaris/SolarisRareGemAItem','solaris','gem','rare','any',['exploiter']),
 raw('/Lotus/Types/Items/Gems/Solaris/SolarisEidolonGemAItem','solaris','gem','eidolon','sunpoint',['exploiter']),
 raw('/Lotus/Types/Items/Gems/Solaris/SolarisEidolonGemBItem','solaris','gem','eidolon','sunpoint',['exploiter']),

 // Cambion Drift (Deimos)
 raw('/Lotus/Types/Items/Gems/Deimos/DeimosCommonOreAItem','deimos','ore','common','any',['obelisk','iso_vault']),
 raw('/Lotus/Types/Items/Gems/Deimos/DeimosCommonOreBItem','deimos','ore','common','any',['obelisk','iso_vault']),
 raw('/Lotus/Types/Items/Gems/Deimos/DeimosUncommonOreAItem','deimos','ore','uncommon','any',['obelisk','iso_vault']),
 raw('/Lotus/Types/Items/Gems/Deimos/DeimosRareOreAItem','deimos','ore','rare','any',['obelisk','iso_vault']),
 raw('/Lotus/Types/Items/Gems/Deimos/DeimosCommonGemAItem','deimos','gem','common','any',['obelisk','iso_vault']),
 raw('/Lotus/Types/Items/Gems/Deimos/DeimosCommonGemBItem','deimos','gem','common','any',['obelisk','iso_vault']),
 raw('/Lotus/Types/Items/Gems/Deimos/DeimosUncommonGemAItem','deimos','gem','uncommon','any',['obelisk','iso_vault']),
 raw('/Lotus/Types/Items/Gems/Deimos/DeimosRareGemAItem','deimos','gem','rare','any',['obelisk','iso_vault']),
 raw('/Lotus/Types/Items/Gems/Deimos/DeimosEidolonGemAItem','deimos','gem','eidolon','sunpoint',['obelisk','iso_vault']),
 raw('/Lotus/Types/Items/Gems/Deimos/DeimosEidolonGemBItem','deimos','gem','eidolon','sunpoint',['obelisk','iso_vault']),
];

export const RAW_MINERAL_BY_ID:ReadonlyMap<string,RawMineralMeta>=new Map(RAW_MINERALS.map(m=>[m.id,m]));

export function isRawMineral(id:string):boolean{
 return RAW_MINERAL_BY_ID.has(id);
}

export function isRefinedMineral(id:string,recipes:Readonly<Record<string,ResourceRecipe>>):boolean{
 return id.startsWith('/Lotus/Types/Items/Gems/')&&!RAW_MINERAL_BY_ID.has(id)&&Object.hasOwn(recipes,id);
}

export function refinedMineralIds(recipes:Readonly<Record<string,ResourceRecipe>>):Set<string>{
 const ids=new Set<string>();
 for(const id of Object.keys(recipes))if(isRefinedMineral(id,recipes))ids.add(id);
 return ids;
}

export function mineralZoneFromId(id:string):OpenWorldZone|null{
 const rawMeta=RAW_MINERAL_BY_ID.get(id);
 if(rawMeta)return rawMeta.zone;
 if(id.includes('/Gems/Eidolon/')||id.includes('/EidolonRecipes/'))return 'eidolon';
 if(id.includes('/Gems/Solaris/')||id.includes('/SolarisRecipes/'))return 'solaris';
 if(id.includes('/Gems/Deimos/')||id.includes('/DeimosRecipes/'))return 'deimos';
 return null;
}

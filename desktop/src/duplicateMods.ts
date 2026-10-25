export type DuplicateModInput={id:string;category:string;rarity:string;maximumRank:number;favorite:boolean;owned:number|null;looseUnranked:number|null;known:boolean};
/** Estimate only; never execute game inventory changes. */
export function duplicateModEstimate(mod:DuplicateModInput,keepCopies:number,excludeFavorites:boolean){
 if(!Number.isSafeInteger(keepCopies)||keepCopies<1||keepCopies>100)throw Error('Invalid keep-copies limit');
 const endoEach:Record<string,number>={Common:5,Uncommon:10,Rare:15,Legendary:20};
 if(!mod.id.startsWith('/Lotus/Upgrades/Mods/')||mod.id.startsWith('/Lotus/Upgrades/Mods/Randomized/')||mod.id.startsWith('/Lotus/Upgrades/Mods/Railjack/')||['Parazon Mod','Focus Way','Arcane'].includes(mod.category)||!Number.isSafeInteger(mod.maximumRank)||mod.maximumRank<=0||!endoEach[mod.rarity])return {status:'unsupported' as const};
 if(excludeFavorites&&mod.favorite)return {status:'protected' as const};
 if(!mod.known||mod.owned===null||mod.looseUnranked===null||![mod.owned,mod.looseUnranked].every(n=>Number.isSafeInteger(n)&&n>=0&&n<=1e9)||mod.looseUnranked>mod.owned)return {status:'unknown' as const};
 const reserveLoose=Math.max(0,keepCopies-(mod.owned-mod.looseUnranked));
 const duplicates=Math.max(0,mod.looseUnranked-reserveLoose);
 return {status:duplicates?'available' as const:'none' as const,duplicates,kept:mod.owned-duplicates,endoEach:endoEach[mod.rarity],endo:duplicates*endoEach[mod.rarity]};
}

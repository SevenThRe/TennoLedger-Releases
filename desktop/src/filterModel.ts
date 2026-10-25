export type Tri='all'|'yes'|'no';
export type Filters={prime:Tri;mastered:Tri;owned:Tri;vaulted:Tri;ready:Tri;enough:Tri;resurgence:Tri;used:Tri;favorite:Tri;helminth:Tri;shards:Tri;incarnon:Tri};
export const clearFilters=():Filters=>({prime:'all',mastered:'all',owned:'all',vaulted:'all',ready:'all',enough:'all',resurgence:'all',used:'all',favorite:'all',helminth:'all',shards:'all',incarnon:'all'});
export type Facts=Record<keyof Filters,boolean|null>;
export function matches(filters:Filters,facts:Facts){return (Object.keys(filters) as (keyof Filters)[]).every(k=>filters[k]==='all'||facts[k]===(filters[k]==='yes'));}
export function toggle(current:Tri,value:Tri):Tri{return current===value?'all':value;}
export function compactCount(value:number|null){if(value===null)return '—';if(value>=1000000)return `${Math.floor(value/100000)/10}M`;if(value>=1000)return `${Math.floor(value/100)/10}K`;return String(value);}

// Foundry enumerates the equipment catalog before joining account ownership.
// Recipes are an optional action, never a prerequisite for listing equipment.
export function inCollectionPage(item:{maxRank:number;recipe?:unknown},page:string){return page==='foundry'?item.maxRank>0||!!item.recipe:page==='mastery'?item.maxRank>0:true;}
export function inCollectionCategory(item:{category:string;id?:string},category:string){if(category==='modular')return /\/Modular|\/SUModular/.test(item.id??'');return category==='all'||(category==='archwing'?['archwing','archgun','archmelee']:category==='pet'?['pet','sentinel','sentinelweapon']:[category]).includes(item.category);}
export function masteredState(maxRank:number,rank:number|null):boolean|null{return maxRank>0&&rank!==null?rank>=maxRank:null;}

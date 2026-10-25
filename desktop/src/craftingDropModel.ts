import {mergeRelicAliases,relicOwned} from './relicAliases.ts';
import type {Relic,Inventory} from './relicModel.ts';
import type {Sources} from './masteryModel.ts';
import type {MaterialDetails} from './craftingSources.ts';
export type CraftingDrop={location:string;chance:number|null;relic?:Relic;owned?:number|null;vaulted?:boolean};
/** Blueprint -> built-component is an explicit catalog relationship, never a name search. */
export function craftingDrops(id:string,hasRecipe:boolean,details:MaterialDetails,relics:Relic[],sources:Sources|null,inventory:Pick<Inventory,'counts'|'complete'>):CraftingDrop[]{
 if(hasRecipe)return [];
 const counterpart=id.endsWith('Blueprint')?id.replace(/Blueprint$/,'Component'):null;
 const raw=details[id]?.drops??(counterpart?details[counterpart]?.drops:undefined)??[];
 const families=new Map<string,Relic[]>();
 const sourceIds=new Set<string>();
 for(const owner of Object.values(sources?.items??{}))for(const part of owner.parts)if(part.itemId===id)for(const drop of part.drops)sourceIds.add(drop.relicId);
 for(const relic of mergeRelicAliases(relics))if(relic.rewards.some(r=>r.id===id)||(sourceIds.has(relic.id)||(relic.aliases??[]).some(alias=>sourceIds.has(alias)))){
  const group=families.get(relic.base)??[];group.push(relic);families.set(relic.base,group);
 }
 const rows:CraftingDrop[]=[];
 for(const [base,group] of families){
  const intact=group.find(r=>r.refinement==='Intact')??group[0],open=group.find(r=>r.refinement==='Radiant')??intact;
  const direct=intact.rewards.find(r=>r.id===id);
  const source=raw.find(d=>d.location.replace(/\s*\([^)]*\)\s*$/,'').replace(/\s+Relic$/,'').trim()===base&&!/\((?!Intact)/i.test(d.location));
  const counts=group.map(r=>relicOwned(inventory,r));
  rows.push({location:base+' Relic',relic:open,chance:direct?.chance??source?.chance??null,owned:counts.some(n=>n===null)?null:counts.reduce<number>((sum,n)=>sum+(n??0),0),vaulted:intact.vaulted===true});
 }
 for(const drop of raw)if(!/\brelic\b/i.test(drop.location)&&!rows.some(r=>r.location===drop.location&&r.chance===drop.chance))rows.push({location:drop.location,chance:drop.chance});
 return rows.sort((a,b)=>(b.owned??0)-(a.owned??0)||(b.chance??-1)-(a.chance??-1)||a.location.localeCompare(b.location));
}

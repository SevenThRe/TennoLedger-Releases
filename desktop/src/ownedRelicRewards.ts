import type {Relic,Inventory} from './relicModel';
import type {Sources} from './masteryModel';
export type RelicSource={id:string;name:string;era:string;refinement:string;count:number;countComplete?:boolean;chance:number};
export function ownedRelicRewards(relics:Relic[],inventory:Inventory|null,sources?:Sources|null):Map<string,RelicSource[]>{
 const result=new Map<string,RelicSource[]>();
 if(!inventory)return result;
 const built=new Map<string,Set<string>>();
 for(const parent of Object.values(sources?.items??{}))for(const part of parent.parts){
  if(!part.ownedItemId)continue;
  const ids=built.get(part.itemId)??new Set<string>();ids.add(part.ownedItemId);built.set(part.itemId,ids);
 }
 for(const relic of relics){
 const counts=[...new Set([relic.id,...relic.aliases??[]])].map(id=>inventory.counts[id]??(inventory.complete?0:null));
 if(counts.some(n=>n!==null&&(!Number.isSafeInteger(n)||n<0)))continue;
 const countComplete=counts.every(n=>n!==null);
 const count=counts.reduce<number>((total,n)=>total+(n??0),0);
 if(!Number.isSafeInteger(count)||count<=0)continue;
 for(const reward of relic.rewards){if(!Number.isFinite(reward.chance)||reward.chance<=0)continue;for(const id of new Set([reward.id,...built.get(reward.id)??[]])){const rows=result.get(id)??[];if(!rows.some(r=>r.id===relic.id))rows.push({id:relic.id,name:relic.base,era:relic.era,refinement:relic.refinement,count,countComplete,chance:reward.chance});result.set(id,rows);}}}
 for(const rows of result.values())rows.sort((a,b)=>b.chance-a.chance||a.name.localeCompare(b.name));
 return result;
}

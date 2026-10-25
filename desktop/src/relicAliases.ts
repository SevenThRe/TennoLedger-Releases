import type {Relic,Inventory} from './relicModel';
import type {Sources} from './masteryModel';

/** Merge presentation only; raw inventory IDs and their individual counts stay intact. */
export function mergeRelicAliases(rows:readonly Relic[]):Relic[]{
 const groups=new Map<string,Relic>();
 for(const row of rows){
  const key=JSON.stringify([row.base,row.era,row.refinement,row.vaulted,row.marketSlug??null,
   [...row.rewards].sort((a,b)=>a.id.localeCompare(b.id)).map(r=>[r.id,r.name,r.chance,r.ducats??null,r.marketSlug??null])]);
  const old=groups.get(key);
  if(!old){groups.set(key,{...row,aliases:[...new Set([row.id,...row.aliases??[]])]});continue;}
  old.aliases=[...new Set([...old.aliases!,row.id,...row.aliases??[]])];
  old.drops=[...new Map([...(old.drops??[]),...(row.drops??[])].map(d=>[JSON.stringify(d),d])).values()];
 }
 return [...groups.values()];
}

export function relicOwned(snapshot:Pick<Inventory,'counts'|'complete'>|null,relic:Relic):number|null{
 if(!snapshot)return null;
 let total=0;
 for(const id of new Set([relic.id,...relic.aliases??[]])){
  const n=snapshot.counts[id]??(snapshot.complete?0:null);
  if(n===null)return null;
  total+=n;
 }
 return total;
}

export function marketRelicOwned(snapshot:Pick<Inventory,'counts'|'complete'>|null,rows:readonly Relic[],slug:string,subtype?:string):number|null{
 if(!subtype||!['intact','exceptional','flawless','radiant'].includes(subtype))return null;
 const matches=rows.filter(r=>r.marketSlug===slug&&r.refinement.toLowerCase()===subtype);
 if(!matches.length)return null;
 return relicOwned(snapshot,{...matches[0],aliases:[...new Set(matches.flatMap(r=>[r.id,...r.aliases??[]]))]});
}

export function relicAcquisition(rows:readonly Relic[],rewardId:string,inventory:Pick<Inventory,'counts'|'complete'>,sources?:Sources|null){
 const ids=new Set([rewardId]);
 for(const parent of Object.values(sources?.items??{}))for(const part of parent.parts){
  if(part.ownedItemId===rewardId)ids.add(part.itemId);
 }
 return mergeRelicAliases(rows).flatMap(relic=>{
  const reward=relic.rewards.find(r=>ids.has(r.id));
  return reward?[{...relic,chance:reward.chance,count:relicOwned(inventory,relic)}]:[];
 }).sort((a,b)=>(b.count??0)-(a.count??0)||a.base.localeCompare(b.base)||a.chance-b.chance);
}

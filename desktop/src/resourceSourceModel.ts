import type {Relic,Inventory} from './relicModel.ts';
export type ResourceDrop={location:string;chance:number|null;reward?:string;rotation?:string};
export type ResourceSource=ResourceDrop&{relic?:Relic;owned?:number|null};
/** One source per relic family; inventory aliases count once across refinements. */
export function resourceSources(drops:readonly ResourceDrop[],relics:readonly Relic[],rewardIds:ReadonlySet<string>,inventory:Pick<Inventory,'counts'|'complete'>|null):ResourceSource[]{
 const families=new Map<string,Relic[]>();
 for(const relic of relics)if(relic.rewards.some(r=>rewardIds.has(r.id))){const rows=families.get(relic.base)??[];rows.push(relic);families.set(relic.base,rows);}
 const result:ResourceSource[]=[];
 for(const [base,variants] of families){
  const relic=variants.find(r=>r.refinement==='Intact')??variants[0];
  const ids=new Set(variants.flatMap(r=>[r.id,...r.aliases??[]]));
  let owned:number|null=inventory?0:null;
  for(const id of ids){const n=inventory?.counts[id]??(inventory?.complete?0:null);if(n===null||!Number.isSafeInteger(n)||n<0){owned=null;break;}owned!+=n;}
  const chance=relic.refinement==='Intact'?relic.rewards.find(r=>rewardIds.has(r.id))?.chance:null;
  const source=drops.find(d=>d.location.split('(')[0].replace(/\s+Relic\s*$/i,'').trim()===base);
  result.push({reward:source?.reward,location:base+' Relic',chance:typeof chance==='number'&&Number.isFinite(chance)?chance:null,relic,owned});
 }
 const seen=new Set<string>();
 for(const drop of drops){
  if(!drop.location.trim())continue;
  const base=drop.location.split('(')[0].replace(/\s+Relic\s*$/i,'').trim();
  if(families.has(base))continue;
  const chance=typeof drop.chance==='number'&&Number.isFinite(drop.chance)?drop.chance:null,key=JSON.stringify([drop.location,chance,drop.reward??'',drop.rotation??'']);
  if(!seen.has(key)){seen.add(key);result.push({...drop,chance});}
 }
 return result.sort((a,b)=>Number(!!b.relic)-Number(!!a.relic)||(a.relic&&b.relic?(b.owned??-1)-(a.owned??-1)||(b.chance??-1)-(a.chance??-1):0)||a.location.localeCompare(b.location));
}

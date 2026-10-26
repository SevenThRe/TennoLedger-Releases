import type {InventoryViewPreferences} from './inventoryViewModel.ts';
export function inventorySetResultWindow<T>(rows:readonly T[],fullInventoryExperienceEnabled:boolean,showAllMatches:boolean){
 const limited=!fullInventoryExperienceEnabled&&!showAllMatches&&rows.length>100;
 return {items:limited?rows.slice(0,100):rows,limited};
}
export type InventorySet={id:string;slug:string;parentId:string|null;name:string;imageUrl?:string;parts:{itemId:string;quantity:number;slug:string;ducats:number|null;countPolicy?:'count'|'unranked-instance';name?:string|null;imageUrl?:string}[]|null;unverifiedReason:string|null};
export type InventorySetSnapshot={complete:boolean;counts:Record<string,number|null>;unrankedEquipmentCounts?:Record<string,number|null>|null};
export function inventorySetState(set:InventorySet,snapshot:InventorySetSnapshot|null){
 const quantities=new Map<string,{quantity:number;ducats:number|null;countPolicy:'count'|'unranked-instance';name?:string|null;imageUrl?:string}>();
 for(const p of set.parts??[]){
  const policy=p.countPolicy??'count',old=quantities.get(p.itemId),quantity=(old?.quantity??0)+p.quantity;
  if(!p.itemId||!Number.isSafeInteger(p.quantity)||p.quantity<=0||!Number.isSafeInteger(quantity)||!['count','unranked-instance'].includes(policy)||old&&old.countPolicy!==policy)return {parts:[],ready:null,completion:null,ducats:null};
  quantities.set(p.itemId,{quantity,ducats:old&&old.ducats!==p.ducats?null:p.ducats,countPolicy:policy,name:p.name,imageUrl:p.imageUrl});
 }
 const parts=[...quantities].map(([id,p])=>{
  const aggregate=snapshot&&Object.hasOwn(snapshot.counts,id)?snapshot.counts[id]:snapshot?.complete?0:null;
  let n=aggregate;
  if(p.countPolicy==='unranked-instance'){
   const exact=snapshot?.unrankedEquipmentCounts;
   const explicit=snapshot&&Object.hasOwn(snapshot.counts,id);
   // Snapshot.complete covers the required acquisition groups, not every
   // optional sentinel collection. An absent equipment ID is not proven zero.
   n=exact&&Object.hasOwn(exact,id)?exact[id]:explicit&&aggregate===0?0:null;
   // Aggregate ownership and historical mastery do not establish tradability.
   if(n!==null&&explicit&&aggregate!==null&&Number.isSafeInteger(aggregate)&&n>aggregate)n=null;
  }
  return {id,...p,owned:n!==null&&Number.isSafeInteger(n)&&n>=0?n:null};
 });
 const known=!!set.parts?.length&&parts.length>0&&parts.every(p=>p.owned!==null);
 const ready=known?Math.min(...parts.map(p=>Math.floor(p.owned!/p.quantity))):null;
 const completion=known?parts.filter(p=>p.owned!>=p.quantity).length/parts.length:null;
 const ducats=set.parts?.length&&parts.every(p=>p.ducats!==null&&Number.isSafeInteger(p.ducats)&&p.ducats!>=0)?parts.reduce((n,p)=>n+p.quantity*p.ducats!,0):null;
 return {parts,ready:ready!==null&&Number.isSafeInteger(ready)?ready:null,completion,ducats:ducats!==null&&Number.isSafeInteger(ducats)?ducats:null};
}
export type InventorySetRow=ReturnType<typeof inventorySetState>&{set:InventorySet;name:string;price:number|null};
export function compareInventorySets(a:InventorySetRow,b:InventorySetRow,p:InventoryViewPreferences){
 const names=()=>a.name.localeCompare(b.name,undefined,{numeric:true})||a.set.id.localeCompare(b.set.id);
 if(p.order==='name')return (p.descending?1:-1)*a.name.localeCompare(b.name,undefined,{numeric:true})||a.set.id.localeCompare(b.set.id);
 // The original set sorter uses platinum per ducat; part inventory uses the inverse.
 const score=(r:InventorySetRow)=>p.order==='amount'?r.ready:p.order==='complete'?r.completion:p.order==='ducats'?r.ducats:p.order==='ducanator'?r.price!==null&&r.ducats!==null&&r.ducats>0?r.price/r.ducats:null:r.price;
 const av=score(a),bv=score(b);if(av===null||bv===null)return av===bv?names():av===null?1:-1;
 return (p.descending?bv-av:av-bv)||names();
}
export function inventorySetQuotes(sets:readonly InventorySet[],quotes:readonly {slug:string;unitPrice:number|null}[]){
 const result:Record<string,number>={};
 for(const set of sets){const matches=quotes.filter(q=>q.slug===set.slug);const p=matches.length===1?matches[0].unitPrice:null;if(p!==null&&Number.isFinite(p)&&p>0)result[set.slug]=p;}
 return result;
}

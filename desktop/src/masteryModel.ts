export type Tally={current:number;max:number};
// MasteryResponseCategory uses float division then multiplication; summary
// headers multiply before dividing. Math.Round uses ties-to-even in both.
export function masteryPercent(tally:Tally|null|undefined,aggregate=false):number|null{
 if(!tally||!Number.isSafeInteger(tally.current)||!Number.isSafeInteger(tally.max)||tally.current<0||tally.max<=0)return null;
 const value=aggregate?Math.fround(Math.fround(100*tally.current)/Math.fround(tally.max)):Math.fround(100*Math.fround(Math.fround(tally.current)/Math.fround(tally.max)));
 const lower=Math.floor(value),fraction=value-lower;
 return fraction===0.5?(lower%2===0?lower:lower+1):Math.round(value);
}
export type MasteryCoverage={knownXp?:number;unknownMissionIds?:string[];unknownEquipmentIds?:string[];equipmentRecords:number;unknownEquipmentRecords:number;unknownMissionRecords:number;sourceSha256:string;complete:boolean};
export type MasteryAccount={coverage?:MasteryCoverage|null;totalXp?:number|null;ranksComplete?:boolean;starNormal?:Tally|null;starSteel?:Tally|null;junctions?:Tally|null;steelJunctions?:Tally|null;railjack?:Tally|null;duviri?:Tally|null};
export type PlayerProfile={name?:string|null;platinum?:number|null;endo?:number|null;ducats?:number|null};
export type MasterySnapshot={masteryRank:number|null;credits:number|null;complete:boolean;counts:Record<string,number>;ranks:Record<string,number>;favorites:string[];pendingRecipes?:Record<string,number>|null;playerProfile?:PlayerProfile|null;masteryAccount?:MasteryAccount|null};
export type MasteryItem={id:string;name:string;zh:string;category:string;maxRank:number;xpPerRank:number;prime:boolean;masteryReq?:number;image?:string;imageUrl?:string;displayParts?:{itemId:string;quantity:number}[];recipe?:{parts:{itemId:string;quantity:number;reusable?:boolean}[]}};
export type Sources={items:Record<string,{parts:{itemId:string;quantity:number;ownedItemId?:string;drops:{relicId:string;chance:number}[]}[]}>;marketSlugs:Record<string,string>};
export const threshold=(rank:number)=>rank<=30?2500*rank*rank:2250000+147500*(rank-30);
export function progress(s:MasterySnapshot|null){const r=s?.masteryRank,t=s?.masteryAccount?.totalXp;if(r==null||t==null)return null;const needed=threshold(r+1)-threshold(r),current=Math.max(0,t-threshold(r));return {current,needed,percent:Math.min(100,Math.floor(100*current/needed))};}
export const knownRank=(s:MasterySnapshot|null,id:string):number|null=>s?.ranks[id]??(s?.masteryAccount?.ranksComplete?0:null);
export const knownCount=(s:MasterySnapshot|null,id:string):number|null=>s?(s.counts[id]??(s.complete?0:null)):null;
export type MasteryPart={itemId:string;quantity:number;ownedItemId?:string};
// Blueprints and already-built equivalents satisfy the same acquisition requirement.
export function masteryPartCount(s:MasterySnapshot|null,p:MasteryPart):number|null{
 const direct=knownCount(s,p.itemId),built=p.ownedItemId&&p.ownedItemId!==p.itemId?knownCount(s,p.ownedItemId):0;
 const known=(direct??0)+(built??0);
 return known>=p.quantity?known:direct===null||built===null?null:known;
}
export function masteryPartCounts(s:MasterySnapshot|null,parts:readonly MasteryPart[]){
 const used=new Map<string,number>();
 return parts.map(p=>{const key=JSON.stringify([p.itemId,p.ownedItemId]),before=used.get(key)??0;
  used.set(key,before+p.quantity);
  const count=masteryPartCount(s,{...p,quantity:before+p.quantity});
  return count===null?null:Math.max(0,count-before);
 });
}
export function masteryDisplayPartCount(s:MasterySnapshot|null,owner:string,part:MasteryPart,sources:Sources,previous=0){
 const children=sources.items[owner]?.parts.filter(p=>p.ownedItemId===part.itemId&&p.itemId!==part.itemId)??[];
 if(children.length){
  const counts=children.map(p=>masteryPartCount(s,{...p,quantity:part.quantity+previous}));
  if(counts.some(count=>count===null))return null;
  return Math.max(0,Math.min(...counts as number[])-previous);
 }
 const source=sources.items[owner]?.parts.find(p=>p.itemId===part.itemId||p.ownedItemId===part.itemId);
 const count=masteryPartCount(s,source?{...source,quantity:part.quantity+previous}:{...part,quantity:part.quantity+previous});
 return count===null?null:Math.max(0,count-previous);
}
export const potential=(i:MasteryItem,s:MasterySnapshot|null)=>{const r=knownRank(s,i.id);return r===null?null:Math.max(0,i.maxRank-r)*i.xpPerRank;};
export const founderIds=new Set(["/Lotus/Powersuits/Excalibur/ExcaliburPrime","/Lotus/Weapons/Tenno/Pistol/LatoPrime","/Lotus/Weapons/Tenno/Melee/LongSword/SkanaPrime"]);
export function summary(items:MasteryItem[],s:MasterySnapshot|null,hideFounders=false){
 items=items.filter(i=>!hideFounders||!founderIds.has(i.id)||(knownCount(s,i.id)??0)>0);
 const groups=[['warframe','archwing'],['primary','secondary','melee','archgun','archmelee'],['pet','sentinel','sentinelweapon']];
 const content=groups.map(g=>{const list=items.filter(i=>g.includes(i.category)&&i.maxRank>0&&!i.name.startsWith('Kavasa Prime'));return {current:list.filter(i=>(knownRank(s,i.id)??-1)>=i.maxRank).length,max:list.length,known:list.every(i=>knownRank(s,i.id)!==null)};});
 const prime=items.filter(i=>i.prime&&i.maxRank>0&&['warframe','archwing','primary','secondary','melee','archgun','archmelee','pet'].includes(i.category));
 const unlocked=(i:MasteryItem)=>(knownCount(s,i.id)??0)>0||(knownRank(s,i.id)??-1)>=i.maxRank;
 return {content,prime:prime.length&&prime.every(i=>unlocked(i)||(knownCount(s,i.id)!==null&&knownRank(s,i.id)!==null))?Math.floor(100*prime.filter(unlocked).length/prime.length):null};
}
export type Recommendation={item:MasteryItem;xp:number;owned:boolean;ready:boolean;rank:number;missing:{itemId:string;quantity:number}[]|null;probability:number|null;cost:number|null;satisfiedParts?:number|null;masteryBlocked?:boolean|null;pendingInFoundry?:boolean|null};
/** FoundryItemData: owned or queued component bypasses the Easy-mode MR lock.
 * Missing account rank, ownership or queue coverage must never assert a confirmed lock/pass.
 */
export function masteryRequirement(item:MasteryItem,s:MasterySnapshot|null){
 const owned=knownCount(s,item.id),queue=s?.pendingRecipes;
 const componentIds=new Set([item.id,...(item.displayParts??item.recipe?.parts??[]).map(p=>p.itemId)]);
 const pendingInFoundry=queue==null?null:Object.entries(queue).some(([id,n])=>componentIds.has(id)&&Number.isSafeInteger(n)&&n>0);
 const rank=s?.masteryRank,required=item.masteryReq;
 const valid=(n:number|null|undefined):n is number=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0;
 const achieved=valid(rank)&&valid(required)?rank>=required:null;
 const masteryBlocked=owned!==null&&owned>0||pendingInFoundry===true?false:achieved===true?false:owned===null||achieved===null||pendingInFoundry===null?null:true;
 return {masteryBlocked,pendingInFoundry};
}
export function masteryLockState(row:Recommendation,mode:string):'blocked'|'unknown'|null{
 if(mode!=='normal'||row.owned||row.pendingInFoundry===true)return null;
 return row.masteryBlocked===true?'blocked':row.masteryBlocked===null?'unknown':null;
}
export function candidates(items:MasteryItem[],s:MasterySnapshot|null,sources:Sources,quotes:Record<string,number>):Recommendation[]{return items.filter(i=>i.maxRank>0&&!i.name.startsWith('Kavasa Prime')).flatMap(item=>{
 const rank=knownRank(s,item.id),xp=potential(item,s);if(rank===null||xp===null||xp<=0)return [];
 const parts=sources.items[item.id]?.parts??item.recipe?.parts;let missing:Recommendation['missing']=parts?[]:null;
 const counts=masteryPartCounts(s,parts??[]);
 for(const [index,p] of (parts??[]).entries()){const count=counts[index];if(count===null){missing=null;break;}if(count<p.quantity)missing!.push({itemId:p.itemId,quantity:p.quantity-count});}
 let cost:number|null=missing?.length?0:null;
 if(missing?.length)for(const p of missing){if(!(quotes[p.itemId]>0)){cost=null;break;}cost!+=quotes[p.itemId]*p.quantity;}
 let probability:number|null=null;const source=sources.items[item.id];
 if(item.prime&&source&&s){let product=1,known=true;
  const grouped=new Map<string,typeof source.parts[number]>();
  for(const p of source.parts){const key=JSON.stringify([p.itemId,p.ownedItemId]),prior=grouped.get(key);grouped.set(key,{...p,quantity:p.quantity+(prior?.quantity??0)});}
  for(const p of grouped.values()){const count=masteryPartCount(s,p);if(count===null){known=false;break;}if(count>=p.quantity)continue;const chance=copyProbability(p.drops,s,p.quantity-count);if(chance===null){known=false;break;}product*=chance;}if(known&&source.parts.length)probability=product;}
 // Use the same component resolution for readiness and missing parts, including built components.
 const ready=parts!==undefined&&missing!==null&&missing.length===0;
 const satisfiedParts=parts!==undefined&&missing!==null?parts.length-missing.length:null;
 return [{item,xp,ready,satisfiedParts,owned:(knownCount(s,item.id)??0)>0,rank,missing,probability,cost,...masteryRequirement(item,s)}];});}
export function recommend(all:Recommendation[],mode:string,includeForma:boolean){return all.filter(r=>mode==='normal'?(includeForma||r.rank<30)&&(r.owned||r.ready):mode==='relics'?!r.owned&&(r.probability??0)>0:!r.owned&&(r.cost??0)>0).sort((a,b)=>mode==='normal'?Number(b.owned)-Number(a.owned)||(a.owned?0:(a.missing?.length??0)-(b.missing?.length??0))||b.xp-a.xp:mode==='relics'?(b.probability??0)-(a.probability??0)||(a.missing?.length??0)-(b.missing?.length??0):b.xp/b.cost!-a.xp/a.cost!||(a.satisfiedParts??0)-(b.satisfiedParts??0));}
export function previewWidths(base:number,needed:number,favorites:number,hover:number){const remaining=Math.max(0,100-base),fav=Math.min(remaining,100*favorites/needed);return {fav,hover:Math.min(remaining-fav,100*hover/needed)};}

// Marginal completion probability for repeated copies. Shared relic competition across
// different parts is still an approximation, matching the original product boundary.
export function copyProbability(drops:{relicId:string;chance:number}[],s:MasterySnapshot,needed:number):number|null{
 if(needed<=0)return 1;
 if(!Number.isSafeInteger(needed)||needed>1000)return null;
 const rolls=[];let guaranteed=0;
 for(const d of drops){const n=knownCount(s,d.relicId);if(n===null)return null;if(d.chance===1)guaranteed+=n;else if(d.chance>0&&n>0)rolls.push({n,p:d.chance});}
 needed-=guaranteed;if(needed<=0)return 1;
 let dp=Array(needed).fill(0);dp[0]=1;
 for(const {n,p} of rolls){const bin=Array(needed).fill(0);let log=n*Math.log1p(-p);bin[0]=Math.exp(log);for(let k=1;k<needed&&k<=n;k++){log+=Math.log(n-k+1)-Math.log(k)+Math.log(p)-Math.log1p(-p);bin[k]=Math.exp(log);}const next=Array(needed).fill(0);for(let i=0;i<needed;i++)for(let j=0;i+j<needed;j++)next[i+j]+=dp[i]*bin[j];dp=next;}
 return Math.min(1,Math.max(0,1-dp.reduce((a,b)=>a+b,0)));
}

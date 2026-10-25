import type {Relic} from './relicModel';
export function expectedBest(relic:Relic,prices:Record<string,number|null>,players:number):number|null{
 if(!Number.isInteger(players)||players<1||players>4)throw Error('Invalid squad size');
 const rows=relic.rewards.filter(r=>r.chance>0).map(r=>({p:r.chance/100,v:prices[r.id]}));
 if(rows.some(r=>r.v==null||!Number.isFinite(r.v)||r.v<0)||Math.abs(rows.reduce((s,r)=>s+r.p,0)-1)>.001)return null;
 const total=rows.reduce((s,r)=>s+r.p,0);rows.forEach(r=>r.p/=total);
 rows.sort((a,b)=>a.v!-b.v!);let cumulative=0,result=0;
 for(const r of rows){const before=cumulative;cumulative+=r.p;result+=r.v!*(Math.min(1,cumulative)**players-before**players);}return result;
}
export function lowestSell(data:unknown):number|null{
 if(!Array.isArray(data))return null;
 const values=data.filter(r=>r?.type==='sell'&&r.visible===true&&Number.isInteger(r.quantity)&&r.quantity>0&&Number.isInteger(r.perTrade??1)&&(r.perTrade??1)>0&&(r.perTrade??1)<=r.quantity&&['online','ingame'].includes(r.user?.status)&&Number.isFinite(r.platinum)&&r.platinum>0&&(r.rank==null||r.rank===0)).map(r=>r.platinum/(r.perTrade??1));
 return values.length?Math.min(...values):null;
}
import type {MasteryItem,Sources} from './masteryModel';
import type {Inventory} from './relicModel';
export function rewardParents(id:string,catalog:MasteryItem[],sources:Sources|null):MasteryItem[]{return catalog.filter(i=>i.maxRank>0&&(i.id===id||sources?.items[i.id]?.parts.some(p=>p.itemId===id||p.ownedItemId===id)));}
export function rewardRank(snapshot:Inventory|null,id:string):number|null{const rank=snapshot?.ranks?.[id];return rank!==undefined&&Number.isInteger(rank)&&rank>=0?rank:snapshot?.masteryAccount?.ranksComplete===true?0:null;}
export function rewardParentState(parents:MasteryItem[],snapshot:Inventory|null):'mastered'|'owned'|'missing'|'unknown'{
 if(!parents.length||!snapshot)return 'unknown';
 if(parents.some(p=>p.maxRank>0&&(rewardRank(snapshot,p.id)??-1)>=p.maxRank))return 'mastered';
 if(parents.some(p=>(snapshot.counts[p.id]??0)>0))return 'owned';
 if(parents.some(p=>(snapshot.counts[p.id]===undefined&&!snapshot.complete)||rewardRank(snapshot,p.id)===null))return 'unknown';
 return 'missing';
}
export function parseFavorites(raw:string|null):string[]{try{const value:unknown=JSON.parse(raw||'[]');return Array.isArray(value)?[...new Set(value.filter((x):x is string=>typeof x==='string'&&x.length>0))]:[];}catch{return [];}}
export function serializeFavorites(ids:string[]):string{return JSON.stringify([...new Set(ids.filter(x=>x.length>0))]);}

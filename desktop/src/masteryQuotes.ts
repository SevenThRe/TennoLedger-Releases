import type {Recommendation} from './masteryModel';
import type {Quote} from './quoteCache';
import type {MarketRankingRow} from './marketRankingModel';

/** Reference mastery uses priceData.post, not live order-book lowest asks. */
export function batchMasteryQuotes(ids:readonly string[],slugs:Record<string,string>,rows:readonly MarketRankingRow[]){
 const bySlug=new Map(rows.map(row=>[row.slug,row]));
 const canonical=(id:string)=>id.replace(/^\/Lotus\/StoreItems\//,'/Lotus/');
 const byId=new Map(rows.filter(row=>row.gameRef).map(row=>[canonical(row.gameRef!),row]));
 const prices:Record<string,number>={};
 for(const id of ids){
  const row=bySlug.get(slugs[id])??byId.get(canonical(id)),price=row?.unitPrice;
  if(typeof price==='number'&&Number.isSafeInteger(price)&&price>0)prices[id]=price;
 }
 return prices;
}

export function masteryQuoteIds(rows:Recommendation[]){
 return [...new Set(rows.filter(r=>!r.owned&&r.item.prime).flatMap(r=>r.missing?.map(p=>p.itemId)??[]))];
}

export function restoreMasteryQuotes(ids:string[],slugs:Record<string,string>,read:(slug:string)=>Quote|null){
 const prices:Record<string,number>={};
 for(const id of ids){
  if(!slugs[id])continue;
  const q=read(slugs[id]);
  if(q&&!q.stale&&q.price!==null&&Number.isFinite(q.price)&&q.price>0)prices[id]=q.price;
 }
 return prices;
}

export async function loadMasteryQuotes(ids:string[],slugs:Record<string,string>,load:(slug:string)=>Promise<Quote>,current:()=>boolean,update:(prices:Record<string,number>,done:number)=>void){
 const prices:Record<string,number>={};let failed=0,stale=false,done=0;
 for(const id of ids){
  if(!current())return null;
  const slug=slugs[id];
  if(slug){try{const q=await load(slug);if(q.price!==null&&Number.isFinite(q.price)&&q.price>0)prices[id]=q.price;stale ||= q.stale;}catch{failed++;}}
  if(!current())return null;
  update({...prices},++done);
 }
 return {prices,failed,stale};
}

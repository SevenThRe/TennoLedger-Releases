import type {MarketRankingRow} from './marketRankingModel.ts';

export type PriceSnapshot={rows:MarketRankingRow[];fetchedAt:string;platform:'pc';source:string};
export type PriceState={snapshot:PriceSnapshot|null;loading:boolean;error:string};
const key='tennoledger.public-prices.pc.v1',ttl=15*60*1000,maxAge=7*24*60*60*1000;
type Storage={getItem:(key:string)=>string|null;setItem:(key:string,value:string)=>void};
export function parsePriceSnapshot(value:unknown,now:number):PriceSnapshot|null{
 const s=value as PriceSnapshot;
 if(!s||s.platform!=='pc'||typeof s.source!=='string'||typeof s.fetchedAt!=='string'||!Array.isArray(s.rows)||!s.rows.length||s.rows.length>20000)return null;
 const age=now-Date.parse(s.fetchedAt);
 if(!Number.isFinite(age)||age<0||age>maxAge)return null;
 const slugs=new Set<string>();
 for(const row of s.rows){
  if(!row||typeof row.slug!=='string'||!row.slug||slugs.has(row.slug)||!row.i18n||typeof row.i18n!=='object')return null;
  if(row.gameRef!=null&&typeof row.gameRef!=='string')return null;
  for(const n of [row.unitPrice,row.volume,row.totalValue])if(n!==null&&(!Number.isSafeInteger(n)||n!<0))return null;
  slugs.add(row.slug);
 }
 return s;
}
export function createMarketPriceStore(load:()=>Promise<unknown>,storage:Storage,now=Date.now){
 let snapshot:PriceSnapshot|null=null;
 try{snapshot=parsePriceSnapshot(JSON.parse(storage.getItem(key)??'null'),now());}catch{}
 let state:PriceState={snapshot,loading:false,error:''},pending:Promise<PriceSnapshot>|null=null,retryAt=0;
 const listeners=new Set<()=>void>();
 const publish=(next:PriceState)=>{state=next;for(const listener of listeners)listener();};
 function refresh(force=false):Promise<PriceSnapshot>{
  if(pending)return pending;
  if(!force&&state.snapshot&&now()-Date.parse(state.snapshot.fetchedAt)<ttl)return Promise.resolve(state.snapshot);
  if(!force&&now()<retryAt)return state.snapshot?Promise.resolve(state.snapshot):Promise.reject(Error(state.error));
  // Publish only after the flight is installed, so subscriber requests coalesce too.
  pending=Promise.resolve().then(load).then(value=>{
   const next=parsePriceSnapshot(value,now());if(!next)throw Error('批量价格快照无效');
   try{storage.setItem(key,JSON.stringify(next));}catch{/* Memory cache still serves all views. */}
   retryAt=0;publish({snapshot:next,loading:false,error:''});return next;
  }).catch(error=>{retryAt=now()+60000;publish({...state,loading:false,error:String(error)});throw error;}).finally(()=>{pending=null;});
  publish({...state,loading:true,error:''});return pending;
 }
 return {getSnapshot:()=>state,subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};},refresh,
  seed:(value:unknown)=>{const seed=parsePriceSnapshot(value,now());if(seed&&(!state.snapshot||Date.parse(seed.fetchedAt)>Date.parse(state.snapshot.fetchedAt))){publish({...state,snapshot:seed});}},
  read:()=>{if(state.snapshot){void refresh().catch(()=>{});return Promise.resolve(state.snapshot);}return refresh();}};
}

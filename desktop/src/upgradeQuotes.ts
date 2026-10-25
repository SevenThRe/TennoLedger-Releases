import {invoke} from '@tauri-apps/api/core';
import {marketOrderQuotes} from './marketModel.ts';
export type UpgradeOrder=Record<string,any>;
export type UpgradeBook={slug:string;platform:string;orders:UpgradeOrder[];fetchedAt:string};
export type UpgradeBookResponse={data:unknown;fetchedAt:string};
export const upgradePlatforms=['pc','ps4','xbox','switch'] as const;
export function validUpgradeRank(rank:unknown,maxRank?:unknown):rank is number{
 return typeof rank==='number'&&Number.isInteger(rank)&&rank>=0&&rank<=100
  &&(maxRank===undefined||maxRank===null||typeof maxRank==='number'&&Number.isInteger(maxRank)&&rank<=maxRank);
}
export function parseUpgradeOrders(data:unknown):UpgradeOrder[]{
 if(Array.isArray(data))return data.filter(value=>value&&typeof value==='object'&&!Array.isArray(value));
 if(data&&typeof data==='object'&&'sell' in data&&'buy' in data&&Array.isArray(data.sell)&&Array.isArray(data.buy))return parseUpgradeOrders([...data.sell,...data.buy]);
 throw Error('报价响应格式错误 / Invalid order response');
}
export function rankQuotes(orders:UpgradeOrder[],rank:unknown){
 if(!validUpgradeRank(rank))return {sell:null,buy:null};
 // A missing rank is unknown even for rank zero, never a zero-rank quote.
 const exact=marketOrderQuotes(orders.filter(order=>validUpgradeRank(order?.rank)&&order.rank===rank),{rank});
 const price=(type:string)=>{const order=exact.find(row=>row.type===type);return order?order.platinum/(order.perTrade??1):null;};
 return {sell:price('sell'),buy:price('buy')};
}
export function createUpgradeBookCache(load:(slug:string,platform:string)=>Promise<UpgradeBookResponse>,options:{now?:()=>number;wait?:(ms:number)=>Promise<void>;ttl?:number;interval?:number}={}){
 const now=options.now??Date.now,wait=options.wait??(ms=>new Promise(resolve=>setTimeout(resolve,ms)));
 const ttl=options.ttl??60000,interval=options.interval??400;
 const cache=new Map<string,{at:number;book:UpgradeBook}>(),pending=new Map<string,Promise<UpgradeBook>>(),retryAfter=new Map<string,number>();
 let queue=Promise.resolve(),lastStart:number|null=null;
 return (slug:string,platform='pc',force=false):Promise<UpgradeBook>=>{
  if(!/^[a-z0-9_]+$/.test(slug)||!upgradePlatforms.includes(platform as any))return Promise.reject(Error('物品或平台无效'));
  const key=JSON.stringify([platform,slug]),old=cache.get(key);
  const active=pending.get(key);if(active)return active;
  if(!force&&old&&now()-old.at>=0&&now()-old.at<ttl)return Promise.resolve(old.book);
  if((retryAfter.get(key)??0)>now())return Promise.reject(Error('行情稍后重试 / Retry quotes later'));
  const job=queue.then(async()=>{
   const delay=lastStart===null?0:Math.max(0,interval-(now()-lastStart));if(delay)await wait(delay);
   lastStart=now();
   const value=await load(slug,platform);
   if(typeof value.fetchedAt!=='string'||!Number.isFinite(Date.parse(value.fetchedAt)))throw Error('报价缺少有效获取时间');
   const book={slug,platform,orders:parseUpgradeOrders(value.data),fetchedAt:value.fetchedAt};
   // Base freshness on server receipt time, so old backend-cache data does not
   // gain another full lifetime every time a component mounts.
   cache.set(key,{at:Math.min(now(),Date.parse(value.fetchedAt)),book});retryAfter.delete(key);
   if(cache.size>256)cache.delete(cache.keys().next().value!);
   return book;
  }).catch(error=>{retryAfter.set(key,now()+30000);throw error;}).finally(()=>pending.delete(key));
  pending.set(key,job);queue=job.then(()=>{},()=>{});return job;
 };
}
export const loadUpgradeBook=createUpgradeBookCache((slug,platform)=>invoke<UpgradeBookResponse>('market_request',{action:'book',key:slug,platform,token:'',body:{}}));

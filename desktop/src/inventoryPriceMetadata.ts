import type {MarketRankingRow} from './marketRankingModel.ts';
export type PriceMetadata={algorithm?:string;priceFetchedAt?:string;error:string};
export function inventoryPriceMetadata(ids:readonly string[],slugs:Record<string,string>,rows:readonly MarketRankingRow[],error:string):Record<string,PriceMetadata>{
 const canonical=(id:string)=>id.replace(/^\/Lotus\/StoreItems\//,'/Lotus/');
 const byId=new Map(rows.filter(row=>row.gameRef).map(row=>[canonical(row.gameRef!),row]));
 const bySlug=new Map(rows.map(row=>[row.slug,row]));
 return Object.fromEntries(ids.map(id=>{const row=byId.get(canonical(id))??bySlug.get(slugs[id]);return [id,{algorithm:row?.algorithm,priceFetchedAt:row?.priceFetchedAt??undefined,error:error||row?.lastError?'refresh-failed':''}];}));
}
export function referencePriceTitle(meta:PriceMetadata|undefined,en:boolean,now=Date.now()):string{
 const algorithm=meta?.algorithm==='median-online-sell-v1'?(en?'WM PC · median unit price of up to five distinct online sellers':'WM PC · 至多五名不同在线卖家的单位报价中位数'):(en?'Reference algorithm unknown':'参考算法未知');
 const stamp=Date.parse(meta?.priceFetchedAt??''),age=now-stamp;
 const time=Number.isFinite(stamp)&&age>=0?(en?'Collected: ':'采集：')+meta!.priceFetchedAt:(en?'Collection time unknown':'采集时间未知');
 const status=Number.isFinite(age)&&age>86400000?(en?'Expired':'已过期'):Number.isFinite(age)&&age>900000?(en?'Stale reference':'旧参考价'):'';
 return [algorithm,time,status,meta?.error?(en?'Refresh failed':'刷新失败'):''].filter(Boolean).join(' · ');
}


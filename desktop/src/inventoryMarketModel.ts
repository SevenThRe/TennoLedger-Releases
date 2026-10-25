import type {MarketRankingRow} from './marketRankingModel.ts';
/** Exact game identities from the market dictionary cover upgrades and misc goods too. */
export function inventoryMarketSlugs(rows:readonly MarketRankingRow[],fallback:Readonly<Record<string,string>>={}){
 const result:Record<string,string>={...fallback};
 for(const row of rows){if(!row.gameRef||! /^[a-z0-9_]+$/.test(row.slug))continue;result[row.gameRef.replace(/^\/Lotus\/StoreItems\//,'/Lotus/')]=row.slug;}
 return result;
}
export function inventoryDucatRatio(ducats:number|null|undefined,price:number|null|undefined){return typeof ducats==='number'&&Number.isFinite(ducats)&&ducats>0&&typeof price==='number'&&Number.isFinite(price)&&price>0?ducats/price:null;}

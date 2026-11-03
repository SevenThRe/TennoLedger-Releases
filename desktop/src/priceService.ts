import {invoke} from '@tauri-apps/api/core';
import {marketPrices} from './useMarketPrices';
export type {Quote} from './quoteCache';
import type {Quote} from './quoteCache';
export function cachedRewardQuote(slug:string,platform='pc'):Quote|null{
 if(platform!=='pc')return null;
 const row=marketPrices.getSnapshot().snapshot?.rows.find(r=>r.slug===slug);
 if(!row?.priceFetchedAt||row.algorithm!=='median-online-sell-v1')return null;
 const age=Date.now()-Date.parse(row.priceFetchedAt);if(!Number.isFinite(age)||age<0||age>86400000)return null;
 return {price:row.unitPrice,fetchedAt:row.priceFetchedAt,stale:age>900000};
}
// Enqueues a priority refresh and immediately returns the shared SQLite quote.
// It never waits behind authentication or remote order requests.
export async function rewardQuote(slug:string,platform='pc'):Promise<Quote>{
 return invoke<Quote>('market_price_quote',{slug,platform});
}

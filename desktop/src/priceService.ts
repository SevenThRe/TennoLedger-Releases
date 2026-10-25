import {invoke} from '@tauri-apps/api/core';
import {lowestSell} from './relicExtrasModel';
import {createQuoteCache,readFreshQuote} from './quoteCache';
export type {Quote} from './quoteCache';
export const cachedRewardQuote=(slug:string,platform='pc')=>readFreshQuote({getItem:key=>localStorage.getItem(key)},slug,platform);
export const rewardQuote=createQuoteCache(async(slug,platform)=>{
 const value=await invoke<{data:unknown;fetchedAt:string}>('market_request',{action:'book',key:slug,platform,token:'',body:{}});
 return {price:lowestSell(value.data),fetchedAt:value.fetchedAt,stale:false};
},{getItem:key=>localStorage.getItem(key),setItem:(key,value)=>localStorage.setItem(key,value)});

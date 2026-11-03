import {useEffect,useSyncExternalStore} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {native} from './api';
import {createMarketPriceStore} from './marketPriceStore';

export const marketPrices=createMarketPriceStore(async()=>{const value:any=await invoke('market_analytics');if(value.algorithm!=='median-online-sell-v1')throw Error('行情算法版本不匹配');return value;},{
 getItem:()=>null,setItem:()=>{}, // SQLite is the persistent authority; no per-window price database.
});
export const loadMarketPrices=()=>marketPrices.read();
export function useMarketPrices(){
 const state=useSyncExternalStore(marketPrices.subscribe,marketPrices.getSnapshot);
 useEffect(()=>{if(native)void marketPrices.refresh(true).catch(()=>{});},[]);
 return state;
}
export function startMarketPrices(){
 if(!native)return()=>{};
 // Packaged public snapshot makes even the first launch independent of network latency.
 void fetch('/wm-prices.json').then(r=>{if(!r.ok)throw Error(String(r.status));return r.json();}).then(value=>{if(value.algorithm==='median-online-sell-v1')marketPrices.seed(value);}).catch(()=>{});
 const refresh=()=>{void marketPrices.refresh(true).catch(()=>{});};refresh();
 const timer=window.setInterval(refresh,5000);window.addEventListener('focus',refresh);
 return()=>{clearInterval(timer);window.removeEventListener('focus',refresh);};
}

export async function warmMarketPrices(slugs:readonly string[],platform='pc'){if(native&&slugs.length)await invoke('market_price_warm',{slugs:[...new Set(slugs)].slice(0,1000),platform});}

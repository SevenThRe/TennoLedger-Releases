import {useEffect,useSyncExternalStore} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {native} from './api';
import {createMarketPriceStore} from './marketPriceStore';

export const marketPrices=createMarketPriceStore(()=>invoke('market_analytics'),{
 getItem:key=>localStorage.getItem(key),setItem:(key,value)=>localStorage.setItem(key,value),
});
export const loadMarketPrices=()=>marketPrices.read();
export function useMarketPrices(){
 const state=useSyncExternalStore(marketPrices.subscribe,marketPrices.getSnapshot);
 useEffect(()=>{if(native)void marketPrices.refresh().catch(()=>{});},[]);
 return state;
}
export function startMarketPrices(){
 if(!native)return()=>{};
 // Packaged public snapshot makes even the first launch independent of network latency.
 void fetch('/market-prices.json').then(r=>{if(!r.ok)throw Error(String(r.status));return r.json();}).then(marketPrices.seed).catch(()=>{});
 const refresh=()=>{void marketPrices.refresh().catch(()=>{});};refresh();
 const timer=window.setInterval(refresh,60000);window.addEventListener('focus',refresh);
 return()=>{clearInterval(timer);window.removeEventListener('focus',refresh);};
}

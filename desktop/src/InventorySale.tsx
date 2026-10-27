import {useMarketPrices} from './useMarketPrices';
import {inventoryMarketSlugs} from './inventoryMarketModel';
import {endoPrices as itemPrices} from './endoPrices';
import type {MarketRankingRow} from './marketRankingModel';
import {saleAccountResponse} from './saleAccountResponse';
import {createContext,useContext,useEffect,useMemo,useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {native} from './api';
import {useMarketSession} from './MarketAccount';
import {saleAvailability} from './saleAvailability';
import type {DemandSnapshot} from './resourceDemand';
import type {SaleRecipe,CraftReservation} from './saleCrafting';
import type {ListingReservation} from './saleListings';
import type {SaleMarketItem,SaleMarketOrder} from './saleOrderParts';
import './inventorySale.css';
type Safety=CraftReservation&ListingReservation&{owned?:number};
export const InventoryTradeContext=createContext<Readonly<Record<string,string>>>({});
export const InventoryDucatContext=createContext<Readonly<Record<string,number>>>({});
export const InventoryPriceContext=createContext<Readonly<Record<string,number>>>({});
export const InventorySaleContext=createContext<ReadonlyMap<string,Safety>>(new Map());
type Item={id:string;name:string;category:string;maxRank?:number};
type Sources=Parameters<typeof saleAvailability>[3];
export function useInventorySale({enabled,items,snapshot,en}:{enabled:boolean;items:Item[];snapshot:DemandSnapshot|null;en:boolean}){
 const session=useMarketSession();
 const [data,setData]=useState<{recipes:SaleRecipe[];sources:Sources;ducats:Record<string,number>}|null>(null);
 const [account,setAccount]=useState<{key:string;market:SaleMarketItem[];orders:SaleMarketOrder[]}|null>(null);
 const [safeOnly,setSafeOnly]=useState(false);
 const [onlyFavorites,setOnlyFavorites]=useState(false),[revision,setRevision]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const publicPrices=useMarketPrices();
 const [fixtureQuotes,setFixtureQuotes]=useState<{rows:MarketRankingRow[];fetchedAt:string}|null>(null);
 const pricePlatform=session.platform??'pc';
 const quotes=native?publicPrices.snapshot:fixtureQuotes;
 useEffect(()=>{let live=true;if(!native&&import.meta.env.DEV&&new URLSearchParams(location.search).get('qa')==='inventory-parity')void fetch('/qa/inventory-parity-quotes.json').then(r=>r.json()).then(data=>{if(live)setFixtureQuotes(data);});return()=>{live=false;};},[]);
 const tradeSlugs=useMemo(()=>inventoryMarketSlugs(quotes?.rows??[],data?.sources?.marketSlugs??{}),[quotes,data]);
 const prices=useMemo(()=>pricePlatform==='pc'?itemPrices(items.map(i=>i.id),data?.sources?.marketSlugs??{},quotes?.rows??[]):{},[items,data,quotes,pricePlatform]);
 const key=JSON.stringify([session.connected,session.ingameName,session.platform,revision]);
 useEffect(()=>{let live=true;
  const json=async(path:string)=>{const r=await fetch(path);if(!r.ok)throw Error(en?'Crafting catalog unavailable':'制造目录不可用');return r.json();};
  void Promise.all([json('/sale-crafting-index.json'),json('/mastery-sources.json')]).then(([index,sources])=>{if(live)setData({recipes:index.recipes,sources,ducats:index.ducats??{}});}).catch(e=>{if(live)setError(String(e));});
  return()=>{live=false;};
 },[enabled,en]);
 useEffect(()=>{if(!enabled)return;const refresh=()=>setRevision(n=>n+1);window.addEventListener('focus',refresh);window.addEventListener('market-orders-changed',refresh);return()=>{window.removeEventListener('focus',refresh);window.removeEventListener('market-orders-changed',refresh);};},[enabled]);
 useEffect(()=>{
  setAccount(null);setBusy(false);if(!enabled||!native||!session.connected)return;
  let live=true;setBusy(true);setError('');
  const request=(action:string)=>invoke<{data:any}>('market_request',{action,key:'',platform:session.platform??'pc',token:'',body:{}});
  void Promise.all([request('items'),request('mine')]).then(([catalog,result])=>{
   const parsed=saleAccountResponse(catalog.data,result.data);
   if(live)setAccount({key,...parsed});
  }).catch(e=>{if(live)setError(String(e));}).finally(()=>{if(live)setBusy(false);});
  return()=>{live=false;};
 },[enabled,key,revision]);
 const safety=useMemo(()=>{
  if(!enabled)return new Map<string,Safety>();
  const rows=items.filter(i=>i.category==='component'&&!!data?.sources?.marketSlugs[i.id]).map(i=>({id:i.id,owned:snapshot?.counts[i.id]??0}));
  const current=account?.key===key?account:null;
  return new Map(saleAvailability(rows,items,data?.recipes??null,data?.sources??null,snapshot,current?.market??null,current?.orders??null,onlyFavorites).map(r=>[r.id,r]));
 },[enabled,items,snapshot,data,account,key,onlyFavorites]);
 const controls=<div className="inventorySaleControls"><div className="inventorySaleChoices">{[false,true].map(value=><button key={String(value)} aria-pressed={safeOnly===value} onClick={()=>setSafeOnly(value)}>{value?(en?'Safe to list':'可安全挂单'):(en?'All owned parts':'全部已拥有部件')}</button>)}</div><label className="inventoryCraftingReserve"><span>{en?'Keep for crafting':'制造预留'}</span><select aria-label={en?'Keep for crafting':'制造预留'} value={onlyFavorites?'favorites':'unowned'} onChange={e=>setOnlyFavorites(e.target.value==='favorites')}><option value="unowned">{en?'Unowned & unmastered':'未拥有且未精通'}</option><option value="favorites">{en?'Favorites only':'仅收藏'}</option></select></label>{safeOnly&&(!snapshot?.complete||!session.connected||busy)&&<span role="status">{!snapshot?.complete?(en?'Waiting for inventory':'等待库存数据'):!session.connected?(en?'Sign in and sync orders':'请登录并同步订单'):(en?'Verifying orders…':'正在核实卖单…')}</span>}{error&&<button className="inventorySyncRetry" title={error} disabled={!native||busy} onClick={()=>setRevision(n=>n+1)}>{en?'Retry sync':'重新同步'}</button>}</div>;
 return {safety,safeOnly,controls,prices,platform:pricePlatform,tradeSlugs,ducats:data?.ducats??{},priceState:publicPrices,canValue:!!snapshot?.complete&&(!safeOnly||account?.key===key)};
}
export function InventorySaleSummary({id,en}:{id:string;en:boolean}){
 const row=useContext(InventorySaleContext).get(id);if(!row)return null;
 const known=row.safeToSell!==null,listed=row.listedForSale!==null;
 const conflict=known&&listed?Math.max(0,row.listedForSale!-row.safeToSell!):0;
 const title=!known?(en?'Crafting requirements could not be verified':'制造需求尚未核实'):!listed?(en?'Sign in to warframe.market and sync orders':'请登录 warframe.market 并同步订单'):conflict?(en?'Reduce sell orders to protect crafting reserves':'请减少卖单数量，以保留制造所需部件'):(en?'Crafting reserves and existing sell orders have been subtracted':'已扣除制造预留与已有卖单');
 return <div className={'inventorySaleSafety'+(conflict?' conflict':'')} title={title}><div className={'inventoryListable'+(!conflict&&(row.safeToList??0)>0?' spare':'')}><strong>{conflict||(row.safeToList??'—')}</strong><span>{conflict?(en?'Over-listed':'超额挂单'):(en?'More to list':'可再挂单')}</span></div><dl><div><dt>{en?'Already listed':'已挂单'}</dt><dd>{row.listedForSale??'—'}</dd></div><div title={row.neededForItems.join(', ')}><dt>{known?(en?'Keep for crafting':'制造预留'):(en?'Crafting unknown':'制造需求未知')}</dt>{known&&<dd>{row.keepForCrafting}</dd>}</div></dl>{known&&!listed&&<small>{en?'Listings unverified':'卖单未核实'}</small>}</div>;
}

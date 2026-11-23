import TradingCategories from './TradingCategories';
import {useAppPreferences} from './useAppPreferences';
import {useMarketPreferences} from './MarketPreferences';
import MarketIcon from './MarketIcon';
import {marketOrderCategory,orderMissing,canCopyMarketPrice,significantMarketPrice} from './marketWorkspaceModel';
import {saveMarketBook} from './marketPreferencesModel';
import MarketQA from './MarketQA';
import TradeSidebar from './TradeSidebar';
import {openInventoryTrade} from './inventoryTrade';
import TradeFinishPanel from './TradeFinishPanel';
import {inventorySetState,type InventorySet} from './inventorySetsModel';
import {isGroupEndpointUnsupported} from './marketBulkModel';
import MarketBulk from './MarketBulk';
import {searchText} from './searchText';
import {rivenInventoryRefresh as inventoryRefresh} from './rivenInventoryRefresh';
import {MarketActionGate,publishMarketOrder} from './marketActions';
import {
 GROUP_ALL_ORDER_ID,
 MarketOrderQueue,
 applyConfirmedOrderMutation,
 emptyOrderQueueState,
 isOrderSessionAbortError,
 projectOrderState,
 reconcileSelection,
 type OrderMutationBody,
 type OrderMutationKind,
 type OrderMutationTask,
 type OrderQueueContext,
 type OrderQueueState,
 type OrderRowBase,
 type ProjectedOrder,
} from './marketOrderQueueModel';
import {marketRelicOwned} from './relicAliases';
import type {Relic} from './relicModel';
import {marketTradeDefaults,marketExtras,specialNumbers,marketSubtypeLabel,type MarketExtras} from './marketSpecial';
import {useTranslation} from 'react-i18next';
import {useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {native} from './api';
import MarketAccount,{useMarketSession,sessionChanged} from './MarketAccount';
import './market.css';
import {marketGoodPrices,marketSuggestedPrice,marketCatalogResolver,marketTradeQuotes,marketDisplayName,orderOwned,displayOrderOwned,orderQuoteKey,loadOrderQuotes,marketWhisper,orderUnitPrice,ordersValue} from './marketModel';
type Row=Record<string,any>;
type OrderRow=Row&OrderRowBase;
const qa=!native&&import.meta.env.DEV&&new URLSearchParams(location.search).get('qa')==='market';
const icon=(name:string)=>'/reference/ui/'+name+'.png';
function Icon({name}:{name:string}){return <img src={icon(name)} alt=""/>;}
function Artwork({item}:{item?:Row}){const [fallback,setFallback]=useState(false);useEffect(()=>setFallback(false),[item?.id]);const src=fallback?icon(item?.category==='mod'?'mods':'misc'):item?.image||item?.imageUrl||icon('misc');return <img src={src} alt="" onError={()=>setFallback(true)}/>;}
function orders(data:any):OrderRow[]{if(Array.isArray(data))return data;if(data&&Array.isArray(data.sell)&&Array.isArray(data.buy))return [...data.sell,...data.buy];throw Error('订单响应格式变化，请刷新后重试');}
export default function Market({rail,fissures,onContracts}:{rail?:ReactNode;fissures?:ReactNode;onContracts?:()=>void}={}){
 const {i18n}=useTranslation(),en=i18n.language.startsWith('en'),L=(zh:string,eng:string)=>en?eng:zh;
 const [appPreferences]=useAppPreferences();
 const {preferences:marketPreferences}=useMarketPreferences();
 const searchRoot=useRef<HTMLDivElement>(null),searchEnd=useRef<HTMLDivElement>(null);
 const [searchLimit,setSearchLimit]=useState(30);
 const [inventoryLoading,setInventoryLoading]=useState(false),[inventoryError,setInventoryError]=useState('');
 const browseGeneration=useRef(0),priceRevision=useRef(0);
 const actionGate=useRef(new MarketActionGate());
 const [relics,setRelics]=useState<Relic[]>([]);
 const [setContracts,setSetContracts]=useState<InventorySet[]>([]);
 useEffect(()=>{let live=true;void fetch('/inventory-sets.json').then(r=>{if(!r.ok)throw Error();return r.json();}).then(d=>{if(live&&Array.isArray(d.sets))setSetContracts(d.sets);}).catch(()=>{});return()=>{live=false;};},[]);
 useEffect(()=>{let live=true;void fetch('/relic-catalog.json').then(r=>{if(!r.ok)throw Error('遗物目录不可用');return r.json();}).then(d=>{if(live)setRelics(d.items);}).catch(()=>{});return()=>{live=false;};},[]);
 const session=useMarketSession(),[platform,setPlatform]=useState('pc'),[items,setItems]=useState<Row[]>([]),[catalog,setCatalog]=useState<Row[]>([]),[artwork,setArtwork]=useState<Record<string,Row>>({}),[snapshot,setSnapshot]=useState<Row|null>(null),[query,setQuery]=useState(''),[item,setItem]=useState<Row|null>(null),[rows,setRows]=useState<OrderRow[]>([]),[book,setBook]=useState<Row[]>([]),[category,setCategory]=useState('all'),[orderSearch,setOrderSearch]=useState(''),[sort,setSort]=useState('name'),[price,setPrice]=useState<number|''>(''),[quantity,setQuantity]=useState(1),[side,setSide]=useState('sell'),[rank,setRank]=useState(0),[extra,setExtra]=useState<MarketExtras>({}),[sideBusy,setSideBusy]=useState(false),[refreshing,setRefreshing]=useState(false),[message,setRawMessage]=useState(''),[stamp,setStamp]=useState(''),[editing,setEditing]=useState<Row|null>(null),[editPrice,setEditPrice]=useState(1),[editQuantity,setEditQuantity]=useState(1),[lowest,setLowest]=useState<Record<string,number|null|'error'>>({}),[sources,setSources]=useState<Row|null>(null);
 const [accountLoading,setAccountLoading]=useState(false);
 const [filterOpen,setFilterOpen]=useState(false),[visibility,setVisibility]=useState(''),[orderType,setOrderType]=useState(''),[missingOnly,setMissingOnly]=useState(false),[missingNo,setMissingNo]=useState(false),[reverse,setReverse]=useState(true),[newOrderOpen,setNewOrderOpen]=useState(false),[confirmation,setConfirmation]=useState<{id:string;action:'delete'|'fix'}|null>(null);
 const [bulkRunning,setBulkRunning]=useState(false);
 const [queueState,setQueueState]=useState<OrderQueueState>(emptyOrderQueueState);
 const [selectedIds,setSelectedIds]=useState<Set<string>>(()=>new Set()),[lastSelectedId,setLastSelectedId]=useState<string|null>(null),[batchDeleteConfirm,setBatchDeleteConfirm]=useState(false);
 const effectivePlatform=session.platform??platform;
 const context=useMemo(()=>({}),[session.connected,session.accountId,session.sessionGeneration,session.ingameName,effectivePlatform]);
 const activeContext=useRef<object|null>(context),orderRead=useRef(0),catalogRead=useRef(0),aliveRef=useRef(true);
 activeContext.current=context;
 const current=()=>activeContext.current===context;
 const setMessage=(value:string)=>{if(current())setRawMessage(value);};
 const queueContext:OrderQueueContext=useMemo(()=>({
  accountId:session.connected?(session.accountId??''):'',
  platform:effectivePlatform,
  sessionGeneration:session.sessionGeneration??null,
 }),[session.connected,session.accountId,session.sessionGeneration,effectivePlatform]);
 const queueContextRef=useRef(queueContext);queueContextRef.current=queueContext;
 const rowsRef=useRef(rows);rowsRef.current=rows;
 const queueActiveRef=useRef(false);queueActiveRef.current=queueState.active;
 const lowestRef=useRef(lowest);lowestRef.current=lowest;
 const masterCheckRef=useRef<HTMLInputElement>(null),shiftHeldRef=useRef(false);
 useEffect(()=>{activeContext.current=context;return()=>{if(activeContext.current===context)activeContext.current=null;};},[context]);
 async function request(action:string,key='',body:Row={}){if(!current())throw Error(L('市场账号已变化','Market account changed'));if(!native)throw Error(L('请在桌面程序中登录市场','Open the desktop app to sign in'));try{return await invoke<{data:any;fetchedAt:string}>('market_request',{action,key,platform:session.platform??platform,token:'',body});}catch(e){sessionChanged();throw e;}}
 async function scopedRequest(action:string,key='',body:Row={},ctx:OrderQueueContext=queueContextRef.current){
  if(!current())throw Error(L('市场账号已变化','Market account changed'));
  if(!native)throw Error(L('请在桌面程序中登录市场','Open the desktop app to sign in'));
  try{
   if(!ctx.accountId)return await request(action,key,body);
   return await invoke<{data:any;fetchedAt:string}>('market_request_scoped',{
    action,key,platform:ctx.platform,body,
    expectedAccount:ctx.accountId,
    expectedPlatform:ctx.platform,
    expectedGeneration:ctx.sessionGeneration??undefined,
   });
  }catch(e){
   if(isOrderSessionAbortError(e))sessionChanged();
   throw e;
  }
 }
 async function runSide(fn:()=>Promise<void>){if(accountLoading||bulkRunning)return;await actionGate.current.run(async()=>{setSideBusy(true);setMessage('');try{await fn();}catch(e){setMessage(String(e));}finally{setSideBusy(false);}});}
 async function runRefresh(){if(accountLoading||bulkRunning||refreshing)return;setRefreshing(true);setMessage('');try{await refresh();}catch(e){setMessage(String(e));}finally{if(aliveRef.current)setRefreshing(false);}}
 async function refresh(){if(!current())return;const id=++orderRead.current,r=await request('mine');if(current()&&id===orderRead.current){setRows(orders(r.data));setStamp(r.fetchedAt);window.dispatchEvent(new Event('market-orders-changed'));}}
 async function loadItems(){if(!current())return;const id=++catalogRead.current,r=await request('items');if(!current()||id!==catalogRead.current)return;if(!Array.isArray(r.data))throw Error('物品目录格式变化');setItems(r.data);}
 const queueHandlersRef=useRef<{
  execute:(task:OrderMutationTask)=>Promise<unknown>;
  onConfirmed:(task:OrderMutationTask,responseData:unknown)=>void;
  onDrain:()=>Promise<void>;
 }|null>(null);
 queueHandlersRef.current={
  execute:async task=>{
   if(task.kind==='fix'){
    const target=rowsRef.current.find(row=>row.id===task.orderId);
    if(!target)return {quantity:1};
    const fresh=await invoke<Row|null>('load_collection');
    const amount=fresh?bulkOwned(target,fresh):null;
    if(amount===null)throw Error(L('库存或账号无法核实，请刷新后重试','Inventory or account could not be verified; refresh and retry'));
    if(amount===0){
     await scopedRequest('delete',task.orderId,{},task.context);
     return null;
    }
    if(amount<target.quantity){
     const reply=await scopedRequest('update',task.orderId,{quantity:amount},task.context);
     return reply?.data&&typeof reply.data==='object'?reply.data:{quantity:amount};
    }
    return {quantity:target.quantity};
   }
   if(task.kind==='update_group'){
    const visible=task.body.visible;
    if(typeof visible!=='boolean')return null;
    try{
     const reply=await scopedRequest('update_group','all',{visible},task.context);
     return reply?.data??null;
    }catch(e){
     if(!isGroupEndpointUnsupported(e))throw e;
     const targets=rowsRef.current.filter(row=>(row.visible!==false)!==visible);
     for(const target of targets){
      if(!current())throw Error(L('市场账号已变化','Market account changed'));
      await scopedRequest('update',target.id,{visible},task.context);
      if(current())setRows(prev=>prev.map(r=>r.id===target.id?{...r,visible}:r));
     }
     return null;
    }
   }
   const reply=await scopedRequest(task.kind,task.orderId,task.body as Row,task.context);
   return reply?.data??null;
  },
  onConfirmed:(task,responseData)=>{
   if(!current())return;
   setRows(prev=>applyConfirmedOrderMutation(prev,task,responseData));
   window.dispatchEvent(new Event('market-orders-changed'));
  },
  onDrain:async()=>{
   if(!current())return;
   try{await refresh();}catch(e){setMessage(String(e));}
  },
 };
 const orderQueueRef=useRef<MarketOrderQueue|null>(null);
 if(!orderQueueRef.current){
  orderQueueRef.current=new MarketOrderQueue({
   context:()=>queueContextRef.current,
   execute:task=>queueHandlersRef.current!.execute(task),
   onConfirmed:(task,data)=>queueHandlersRef.current!.onConfirmed(task,data),
   onDrain:()=>queueHandlersRef.current!.onDrain(),
   onChange:next=>{if(aliveRef.current)setQueueState(next);},
  });
 }
 useEffect(()=>{aliveRef.current=true;return()=>{aliveRef.current=false;orderQueueRef.current?.reset();};},[]);
 useEffect(()=>{
  let live=true;
  void fetch('/market-artwork.json').then(r=>r.json()).then(d=>{if(live)setArtwork(d);}).catch(()=>{});
  void fetch('/catalog.json').then(r=>r.json()).then(d=>{if(live)setCatalog(d.items);}).catch(e=>{if(live)setMessage('物品目录读取失败：'+String(e));});
  const fixture=qa?fetch('/qa/market.json').then(r=>{if(!r.ok)throw Error('演示库存读取失败');return r.json();}):null;
  if(fixture)void fixture.then(d=>{if(live){setItems(d.items);setRows(d.orders);}}).catch(e=>{if(live)setMessage(String(e));});
  const reader=inventoryRefresh<Row|null>(async()=>native?invoke<Row|null>('load_collection'):(await fixture)?.snapshot??null,setSnapshot,setInventoryLoading,setInventoryError);
  const sync=()=>{void reader.refresh();};
  if(native||qa)sync();
  const off=native?listen('collection-updated',sync):null;
  if(off)void off.catch(e=>{if(live)setInventoryError('库存同步监听失败：'+String(e));});
  return()=>{live=false;reader.dispose();if(off)void off.then(f=>f()).catch(()=>{});};
 },[]);

 useEffect(()=>()=>{browseGeneration.current++;},[session.connected,session.accountId,session.sessionGeneration,session.platform,session.ingameName,platform]);
 useEffect(()=>{
  orderQueueRef.current?.reset();
  setSelectedIds(new Set());setLastSelectedId(null);setBatchDeleteConfirm(false);setConfirmation(null);
  lowestRef.current={};
  setRows([]);setBook([]);setItem(null);setEditing(null);setLowest({});setStamp('');setRawMessage('');
  if(session.platform)setPlatform(session.platform);
  if(!session.connected){setAccountLoading(false);return;}
  const reader=inventoryRefresh(async()=>{
   const [catalog,owned]=await Promise.all([request('items'),request('mine')]);
   if(!Array.isArray(catalog.data))throw Error('物品目录格式变化');
   return {items:catalog.data,rows:orders(owned.data),stamp:owned.fetchedAt};
  },value=>{if(current()){setItems(value.items);setRows(value.rows);setStamp(value.stamp);}},setAccountLoading,error=>{if(error)setMessage(error);});
  void reader.refresh();
  return()=>reader.dispose();
 },[context]);

 useEffect(()=>{const close=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!accountLoading&&!bulkRunning){setEditing(null);setConfirmation(null);setBatchDeleteConfirm(false);}};window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close);},[accountLoading,bulkRunning]);
 useEffect(()=>{let live=true;void fetch('/mastery-sources.json').then(r=>r.json()).then(d=>{if(live)setSources(d);}).catch(()=>{});return()=>{live=false;};},[]);
 const localItem=useMemo(()=>marketCatalogResolver(catalog,sources?.marketSlugs),[catalog,sources]);
 const marketById=useMemo(()=>new Map(items.map(i=>[i.id,i])),[items]);
 const marketName=(i?:Row)=>i?.i18n?.en?.name??i?.name??i?.slug??'未知物品';

 const displayName=(m:Row)=>marketDisplayName(m,localItem(m),i18n.language);
 function info(order:Row):{market:Row;local?:Row;name:string;category:string}{const m=marketById.get(order.itemId)??order.item??{id:order.itemId,name:order.itemId};const local=localItem(m);return {market:m,local:local?{...local,...(artwork[local.id]??artwork[m.slug])}:artwork[m.slug]?{image:artwork[m.slug].image}:m.slug?.includes('riven')?{image:icon('mod_riven')}:undefined,name:displayName(m),category:marketOrderCategory(m,local)};}
 useEffect(()=>{
  if(!native||!session.connected||!items.length||!rows.length||queueState.active||bulkRunning)return;
  const missingRows=rows.filter(r=>!Object.hasOwn(lowestRef.current,orderQuoteKey(r)));
  if(!missingRows.length)return;
  let live=true;
  void loadOrderQuotes(missingRows,order=>(marketById.get(order.itemId)??order.item)?.slug,async slug=>{const r=await invoke<{data:any}>('market_request',{action:'book',key:slug,platform:session.platform??platform,token:'',body:{}});const book=orders(r.data);saveMarketBook(localStorage,slug,session.platform??platform,book);return book;},values=>setLowest(p=>({...p,...values})),()=>live&&!queueActiveRef.current);
  return()=>{live=false;};
 },[rows,items,session.connected,session.platform,platform,queueState.active,bulkRunning]);
 const ownership=(r:Row)=>{if(session.connected&&(!snapshot?.playerProfile?.name||!session.ingameName||snapshot.playerProfile.name.toLowerCase()!==session.ingameName.toLowerCase()))return null;const i=info(r);return String(i.market.slug??'').endsWith('_relic')?marketRelicOwned(snapshot as any,relics,i.market.slug,r.subtype):displayOrderOwned(i.market,i.local,snapshot,sources,r,appPreferences.takeRankIntoAccount);};
 const projectedById=useMemo(()=>{
  const map=new Map<string,ProjectedOrder<OrderRow>>();
  for(const row of rows)map.set(row.id,projectOrderState(row,queueState.tasks));
  return map;
 },[rows,queueState.tasks]);
 const filtered=rows.filter(r=>{const pr=projectedById.get(r.id)?.row??r;const i=info(r);return (category==='all'||category===i.category)&&(!orderType||pr.type===orderType)&&(!visibility||(visibility==='visible'?pr.visible!==false:pr.visible===false))&&(!missingOnly||orderMissing(pr,ownership(pr)))&&(!missingNo||!orderMissing(pr,ownership(pr)))&&searchText(orderSearch,i.name,marketName(i.market));}).sort((a,b)=>{const pa=projectedById.get(a.id)?.row??a,pb=projectedById.get(b.id)?.row??b;const value=sort==='price'?(orderUnitPrice(pa)??-1)-(orderUnitPrice(pb)??-1):sort==='quantity'?pa.quantity-pb.quantity:info(a).name.localeCompare(info(b).name);return reverse?-value:value;});
 const activeFilteredRows=filtered.flatMap(r=>{const proj=projectedById.get(r.id);return proj?.deleting?[]:[proj?.row??r];});
 const hasFilters=category!=='all'||!!orderSearch||!!visibility||!!orderType||missingOnly||missingNo;
 const resetView=()=>{setCategory('all');setOrderSearch('');setVisibility('');setOrderType('');setMissingOnly(false);setMissingNo(false);};
 const missingCount=activeFilteredRows.filter(r=>orderMissing(r,ownership(r))).length;
 const availableOrderIds=useMemo(()=>new Set(rows.map(r=>r.id as string)),[rows]);
 const deletingOrderIds=useMemo(()=>new Set([...projectedById.entries()].filter(([,p])=>p.deleting).map(([id])=>id)),[projectedById]);
 useEffect(()=>{
  setSelectedIds(prev=>{
   if(!prev.size)return prev;
   const next=reconcileSelection(prev,availableOrderIds,deletingOrderIds);
   return next.size===prev.size?prev:next;
  });
 },[availableOrderIds,deletingOrderIds]);
 useEffect(()=>{if(selectedIds.size===0)setBatchDeleteConfirm(false);},[selectedIds.size]);
 const visibleSelectableIds=filtered.filter(r=>!projectedById.get(r.id)?.deleting).map(r=>r.id as string);
 const allVisibleSelected=visibleSelectableIds.length>0&&visibleSelectableIds.every(id=>selectedIds.has(id));
 const someVisibleSelected=visibleSelectableIds.some(id=>selectedIds.has(id))&&!allVisibleSelected;
 useEffect(()=>{if(masterCheckRef.current)masterCheckRef.current.indeterminate=someVisibleSelected;},[someVisibleSelected]);
 function toggleAllVisible(){
  setBatchDeleteConfirm(false);
  if(allVisibleSelected){
   setSelectedIds(prev=>{const next=new Set(prev);for(const id of visibleSelectableIds)next.delete(id);return next;});
  }else{
   setSelectedIds(prev=>{const next=new Set(prev);for(const id of visibleSelectableIds)next.add(id);return next;});
  }
 }
 function toggleRowSelection(id:string,shiftKey:boolean){
  setBatchDeleteConfirm(false);
  if(shiftKey&&lastSelectedId){
   const start=visibleSelectableIds.indexOf(lastSelectedId),end=visibleSelectableIds.indexOf(id);
   if(start>=0&&end>=0){
    const [lo,hi]=start<end?[start,end]:[end,start];
    setSelectedIds(prev=>{const next=new Set(prev);for(let i=lo;i<=hi;i++)next.add(visibleSelectableIds[i]);return next;});
    setLastSelectedId(id);
    return;
   }
  }
  setSelectedIds(prev=>{
   const next=new Set(prev);
   if(next.has(id))next.delete(id);else next.add(id);
   setLastSelectedId(next.has(id)?id:null);
   return next;
  });
 }
 function enqueueOrderOp(r:Row,kind:OrderMutationKind,body:OrderMutationBody={}){
  if(accountLoading||bulkRunning||!session.connected)return;
  setMessage('');
  orderQueueRef.current?.enqueue({orderId:r.id,label:info(r).name,kind,body,context:queueContextRef.current});
 }
 function enqueueBatchVisibility(visible:boolean){
  if(accountLoading||bulkRunning||!session.connected)return;
  const changedRows:OrderRow[]=[];
  for(const id of selectedIds){
   const base=rowsRef.current.find(x=>x.id===id);
   if(!base)continue;
   const proj=projectedById.get(id);
   if(proj?.deleting)continue;
   const currentVisible=(proj?.row.visible??base.visible)!==false;
   if(currentVisible!==visible)changedRows.push(base);
  }
  if(selectedIds.size===rowsRef.current.length&&deletingOrderIds.size===0&&changedRows.length>=2){
   setMessage('');
   orderQueueRef.current?.enqueue({orderId:GROUP_ALL_ORDER_ID,label:L('全部订单','All orders'),kind:'update_group',body:{visible},context:queueContextRef.current});
  }else{
   for(const base of changedRows){
    orderQueueRef.current?.enqueue({orderId:base.id,label:info(base).name,kind:'update',body:{visible},context:queueContextRef.current});
   }
  }
  setSelectedIds(new Set());setLastSelectedId(null);setBatchDeleteConfirm(false);
 }

 const searchIndex=useMemo(()=>items.map(item=>{const local=localItem(item);return {item,text:`${marketDisplayName(item,local,i18n.language)} ${marketName(item)} ${local?.zh??''} ${local?.name??''}`};}),[items,localItem,i18n.language]);
 const matches=useMemo(()=>{const term=query.trim().toLowerCase();return searchIndex.filter(entry=>searchText(term,entry.text)).map(entry=>entry.item);},[searchIndex,query]);
 useEffect(()=>{setSearchLimit(30);if(searchRoot.current)searchRoot.current.scrollTop=0;},[query,items,i18n.language]);
 useEffect(()=>{const root=searchRoot.current,target=searchEnd.current;if(!root||!target||!query.trim()||searchLimit>=matches.length)return;const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){observer.disconnect();setSearchLimit(n=>Math.min(n+30,matches.length));}},{root,rootMargin:'0px 0px 100px 0px'});observer.observe(target);return()=>observer.disconnect();},[query,searchLimit,matches.length]);
 const shownQuotes=marketTradeQuotes(book,{...extra,...(item?.maxRank!=null?{rank}:{})},marketPreferences.marketInGameOnly);
 const goodPrices=marketGoodPrices(shownQuotes);
 async function browse(m:Row,type='sell',order?:Row){
  const defaults=marketTradeDefaults(m,order),generation=++browseGeneration.current,revision=priceRevision.current;
  setItem(m);setSide(type);setRank(defaults.rank);if(rail!=null&&m.slug)openInventoryTrade({id:m.gameRef??m.id,slug:m.slug,name:displayName(m),englishName:marketName(m),...(m.maxRank!=null?{rank:defaults.rank}:{}),platform:effectivePlatform});setPrice(defaults.price);setExtra(defaults.extras);setBook([]);setQuantity(defaults.quantity);
  const response=qa?await fetch('/qa/market.json').then(r=>r.json()).then(f=>({data:f.books?.[m.slug]??[],fetchedAt:''})):await request('book',m.slug);
  if(generation!==browseGeneration.current)return;
  const result=orders(response.data);if(!qa)saveMarketBook(localStorage,m.slug,effectivePlatform,result,response.fetchedAt||undefined);setBook(result);if(response.fetchedAt)setStamp(response.fetchedAt);
  if(!order&&priceRevision.current===revision)setPrice(marketSuggestedPrice(result,{...defaults.extras,...(m.maxRank!=null?{rank:defaults.rank}:{})},marketPreferences.marketInGameOnly));
 }

 function bulkOwned(r:Row,fresh?:Row):number|null{
  const inventory=fresh??snapshot,m=marketById.get(r.itemId)??r.item;
  if(!m?.gameRef||!inventory?.playerProfile?.name||!session.ingameName||inventory.playerProfile.name.toLowerCase()!==session.ingameName.toLowerCase())return null;
  if(r.charges!=null||r.amberStars!=null||r.cyanStars!=null||String(m.slug).includes('riven'))return null;
  if(String(m.slug).endsWith('_set')){const matches=setContracts.filter(s=>s.slug===m.slug&&s.parentId===m.gameRef);return matches.length===1?inventorySetState(matches[0],inventory as any).ready:null;}
  if(String(m.slug).endsWith('_relic'))return marketRelicOwned(inventory as any,relics,m.slug,r.subtype);
  if(r.subtype!=null)return null;
  if(m.maxRank!=null){if(r.rank==null)return null;return orderOwned(m,undefined,inventory,null,r);}
  const local=catalog.find(item=>item.id===m.gameRef);
  if(local&&['mod','arcane'].includes(local.category))return null;
  if(local?.maxRank>0){const counts=inventory.unrankedEquipmentCounts;if(!counts)return null;const n=counts[m.gameRef]??0;return Number.isSafeInteger(n)&&n>=0?n:null;}
  const n=inventory.counts?.[m.gameRef]??(inventory.complete?0:null);return typeof n==='number'&&Number.isSafeInteger(n)&&n>=0?n:null;
 }
 function edit(r:Row){setConfirmation(null);setBatchDeleteConfirm(false);setEditing(r);setEditPrice(r.platinum);setEditQuantity(r.quantity);setTimeout(()=>{const node=document.querySelector<HTMLElement>('[data-order-id="'+CSS.escape(r.id)+'"] .marketEditForm');node?.querySelector<HTMLInputElement>('input')?.focus({preventScroll:true});node?.scrollIntoView({block:'nearest'});},0);}
 const Price=({value}:{value:number|null|undefined})=><span className="marketPrice">{value==null?'—':value.toLocaleString(i18n.language,{maximumFractionDigits:2})}<span className="marketPlatinum"/></span>;
 useEffect(()=>{const update=()=>{if(native&&session.connected&&!queueActiveRef.current)void runRefresh();};window.addEventListener('market-orders-updated',update);return()=>window.removeEventListener('market-orders-updated',update);},[context]);
 const queueActionLabel=(kind:OrderMutationKind)=>({update:L('更新','Update'),update_group:L('整组显隐','Group visibility'),close:L('成交','Close'),delete:L('删除','Delete'),fix:L('修正','Adjust')})[kind];
 const groupFailure=queueState.failed.find(f=>f.orderId===GROUP_ALL_ORDER_ID);
 const queueTitle=queueState.runningTask?`${queueState.runningTask.label} (${queueActionLabel(queueState.runningTask.kind)})${queueState.queuedCount?` · ${L('待发送','Queued')}: ${queueState.queuedCount}`:''}`:'';
 const marketSide=(<section className="marketSide"><div className="marketQuickTrade"><div className="marketSideTitle"><Icon name="wfMarketIconBW"/>{L('交易市场','Trading')}</div><div className="marketSearch"><label htmlFor="market-search">{L('市场搜索:','Search:')}</label><input id="market-search" placeholder={L('搜索物品','Search items')} value={query} onFocus={()=>{if(!items.length&&native)void runSide(loadItems);}} onChange={e=>setQuery(e.target.value)}/><button aria-label={L('加载市场目录','Load market catalog')} title={L('加载市场目录','Load market catalog')} disabled={sideBusy||accountLoading} onClick={()=>void runSide(loadItems)}><Icon name="search"/></button></div>
   <div className="marketSearchResults" ref={searchRoot}>{(query.trim()?matches.slice(0,searchLimit):item?[item]:[]).map(m=><div className="marketSearchResult" key={m.id}><button className="sellPill" onClick={()=>void runSide(()=>browse(m,'sell'))}>{L('卖出','Sell')}</button><button className="marketResultName" onClick={()=>void runSide(()=>browse(m,side))}>{displayName(m)}</button><button className="buyPill" onClick={()=>void runSide(()=>browse(m,'buy'))}>{L('买入','Buy')}</button></div>)}{query.trim()&&searchLimit<matches.length&&<div ref={searchEnd} className="marketSearchEnd" aria-hidden="true"/>}{query.trim()&&items.length>0&&!matches.length&&<p className="marketSearchHint">{L('没有匹配的物品','No matching items')}</p>}{!items.length&&<p className="marketSearchHint">{L('搜索前先加载物品目录','Load the market catalog to search')}</p>}</div>
   <form className="marketPostBar" onSubmit={e=>{e.preventDefault();void runSide(async()=>{if(!item)throw Error('请先选择物品');if(price===''||!Number.isInteger(price)||price<1||price>900000)throw Error('请输入有效价格');const props=marketExtras(item,extra,quantity);setMessage(await publishMarketOrder(()=>request('create','',{...props,itemId:item.id,type:side,platinum:price,quantity,visible:true,...(item.maxRank!==undefined?{rank}:{})}),refresh));});}}><button className={side==='sell'?'sellPill':'buyPill'} disabled={sideBusy||accountLoading||bulkRunning||!session.connected||!item}>{side==='sell'?L('发布出售','Create sell order'):L('发布收购','Create buy order')}</button><div><label>{L('数量:','Quantity:')}<input type="number" min="1" max="9999" required value={quantity} onChange={e=>setQuantity(Number(e.target.value))}/></label><label>{(extra.perTrade??1)>1?L(`每 ${extra.perTrade} 个（白金）`,`Platinum / ${extra.perTrade} items`):L('单价（白金）','Platinum / item')}:<input type="number" min="1" max="900000" required value={price} onChange={e=>{priceRevision.current++;setPrice(e.target.value===''?'':Number(e.target.value));}}/></label><label className="marketPostType">{L('类型:','Type:')}<select value={side} onChange={e=>setSide(e.target.value)}><option value="sell">{L('卖出','Sell')}</option><option value="buy">{L('买入','Buy')}</option></select></label>{item?.maxRank!==undefined&&<label>{L('等级:','Rank:')}<input type="number" min="0" max={item.maxRank} value={rank} onChange={e=>setRank(Number(e.target.value))}/></label>}</div></form>
   {item&&<div className="marketSpecialControls">{item.subtypes?.length>0&&<label>{L('物品类型','Item variant')}<select aria-label={L('物品类型','Item variant')} value={extra.subtype??''} onChange={e=>setExtra({...extra,subtype:e.target.value})}>{item.subtypes.map((value:string)=><option key={value} value={value}>{en?value:marketSubtypeLabel(value)}</option>)}</select></label>}{specialNumbers.map(([field,label,limit])=>item[limit]!=null&&<label key={field}>{en?({charges:'Charges',amberStars:'Amber stars',cyanStars:'Cyan stars'})[field]:label}<input aria-label={en?field:label} type="number" min="0" max={item[limit]} step="1" value={extra[field]??0} onChange={e=>setExtra({...extra,[field]:Number(e.target.value)})}/></label>)}{item.bulkTradable&&<label>{L('每组数量','Items per trade')}<input aria-label={L('每组数量','Items per trade')} type="number" min="1" max={Math.min(6,quantity)} step="1" value={extra.perTrade??1} onChange={e=>setExtra({...extra,perTrade:Number(e.target.value)})}/></label>}</div>}
  </div><div className="marketQuotes">{item?<><h3>{displayName(item)}</h3>{shownQuotes.length?<div className="marketQuoteList">{shownQuotes.map(r=><div key={r.id} className={goodPrices.has(r)?'goodPrice':undefined}><span>{r.user?.ingameName??'—'}<small>{r.type==='sell'?L('卖出','Sell'):L('买入','Buy')} · {r.user?.status==='ingame'?L('游戏中','In game'):r.user?.status==='online'?L('在线','Online'):L('离线','Offline')}</small></span><b>{r.platinum}<Icon name="platinum"/>{(r.perTrade??1)>1&&<small> / {r.perTrade} {L('个','items')}</small>}</b><button disabled={!r.user?.ingameName} title={L('复制交易密语','Copy trade whisper')} aria-label={L('复制密语 ','Copy whisper ')+r.user?.ingameName} onClick={()=>void runSide(async()=>{await navigator.clipboard.writeText(marketWhisper(marketName(item),r));setMessage(L('交易密语已复制','Trade whisper copied'));})}><Icon name="copy"/></button></div>)}</div>:<p>{L('暂无符合当前条件的报价','No matching listings')}</p>}</>:<><Icon name="market"/><p>{L('选择物品查看市场挂牌','Choose an item to view market listings')}</p></>}</div></section>);
 return <div className={"marketWorkspace"+(rail!=null?" withWorldRail":"")}>
  <section className="marketBoard">
   <div className="marketSectionHeader"><button className="selected" aria-current="page"><Icon name="market"/>{L('我的订单','My orders')}</button><button disabled={!onContracts} onClick={onContracts}><Icon name="icon-contract"/>{L('我的合约','My contracts')}</button></div>
   <div className="marketOrdersView">
   <div className="tabPageHeader marketCompactHeader"><div className="tabPageHeading"><h2>{L('我的订单','My orders')}</h2></div>
    <div className="marketOverview marketOverviewInline" title={L('统计跟随当前类别、搜索与筛选','Totals and counts follow the current category, search, and filters.')}><div className="marketOverviewMetrics"><div><span className="marketType sell">{L('卖单总值','Sell value')}</span><Price value={ordersValue(activeFilteredRows,'sell')}/></div><div><span className="marketType buy">{L('买单总值','Buy value')}</span><Price value={ordersValue(activeFilteredRows,'buy')}/></div>{queueState.active?<span className="marketQueueStatus" title={queueTitle}>{L(`● 同步中 (${queueState.tasks.length})`,`● Syncing (${queueState.tasks.length})`)}{queueState.queuedCount>0&&<button type="button" className="marketQueueCancel" onClick={()=>orderQueueRef.current?.cancelAllQueued()}>{L('取消待发','Cancel')}</button>}</span>:<span className="marketStatus">{accountLoading||refreshing||bulkRunning||sideBusy?L('更新中…','Updating…'):stamp?new Date(stamp).toLocaleTimeString(i18n.language):''}</span>}</div><div className="marketOverviewStatus"><div className="marketVisibilitySummary"><MarketIcon name="eye"/><strong>{activeFilteredRows.filter(r=>r.visible!==false).length}/{activeFilteredRows.length}</strong><span>{L('可见','visible')}</span></div>{missingCount>0&&<div className="marketOverviewNotice"><button className="marketMissingSummary" onClick={()=>{setMissingOnly(true);setMissingNo(false);}}><MarketIcon name="warning"/><span>{missingCount} {L('条订单缺少物品','orders with missing items')}</span></button></div>}</div></div>
    <div className="marketHeaderActions"><button className="marketIconButton" title={L('刷新订单','Refresh orders')} aria-label={L('刷新订单','Refresh orders')} disabled={refreshing||accountLoading||bulkRunning||!session.connected} onClick={()=>void runRefresh()}><MarketIcon name="refresh"/></button><MarketBulk session={session} platform={effectivePlatform} rows={rows} filtered={filtered} marketFor={r=>marketById.get(r.itemId)??r.item} label={r=>info(r).name} owned={bulkOwned} disabled={accountLoading||bulkRunning||queueState.active} disabledReason={queueState.active?L('请等待队列请求完成后操作','Wait for queued order updates'):undefined} onRunning={setBulkRunning} onRefresh={refresh}/></div>
   </div>
   <div className="marketToolbar"><TradingCategories rows={[['all','infinity',L('全部','All')],['parts','ingredient',L('部件','Parts')],['relics','axi-intact',L('遗物','Relics')],['mods','mods',L('MOD','Mods')],['arcanes','arcane',L('赋能','Arcanes')],['misc','misc',L('其他','Misc')],['sets','set',L('套装','Sets')]]} value={category} onChange={setCategory} en={en}/><div className="marketSortTools"><div className={'marketOrderSearch'+(orderSearch?' hasValue':'')}><label htmlFor="market-order-search" title={L('搜索我的订单','Search my orders')}><MarketIcon name="search"/></label><input id="market-order-search" aria-label={L('搜索我的订单','Search my orders')} placeholder={L('搜索','Search')} value={orderSearch} onChange={e=>setOrderSearch(e.target.value)}/>{orderSearch&&<button type="button" aria-label={L('清空搜索','Clear search')} onClick={()=>setOrderSearch('')}><MarketIcon name="close"/></button>}</div><button title={L('反向排序','Reverse order')} aria-label={L('反向排序','Reverse order')} className={reverse?'reverseOrder':''} onClick={()=>setReverse(!reverse)}><Icon name="ordering"/></button><select aria-label={L('订单排序','Order by')} value={sort} onChange={e=>setSort(e.target.value)}><option value="name">{L('名称','Name')}</option><option value="price">{L('白金','Platinum')}</option><option value="quantity">{L('数量','Quantity')}</option></select><button title={L('筛选','Filters')} aria-label={L('筛选订单','Filter orders')} aria-expanded={filterOpen} className={'marketFilterToggle'+(filterOpen?' selected':'')} onClick={()=>setFilterOpen(!filterOpen)}><Icon name="filter"/><span>{L('筛选','Filters')}</span></button></div></div>
   {hasFilters&&<div className="marketFilterSummary"><span>{L('筛选结果','Filtered results')}: {filtered.length}</span><button onClick={resetView}><MarketIcon name="close"/>{L('清空筛选','Clear filters')}</button></div>}
   <div className="marketScroll">
    {selectedIds.size>0&&<div className="marketSelectionBar" role="region" aria-label={L('选中订单批量操作','Selected order actions')}>
     <span className="marketSelectionCount">{L('已选','Selected')} <strong>{selectedIds.size}</strong></span>
     {!batchDeleteConfirm?<>
      <button type="button" className="itemDetailsButton" disabled={accountLoading||bulkRunning||!session.connected} onClick={()=>enqueueBatchVisibility(true)}>{L('显示','Show')}</button>
      <button type="button" className="itemDetailsButton" disabled={accountLoading||bulkRunning||!session.connected} onClick={()=>enqueueBatchVisibility(false)}>{L('隐藏','Hide')}</button>
      <button type="button" className="itemDetailsButton marketDanger" disabled={accountLoading||bulkRunning||!session.connected} onClick={()=>setBatchDeleteConfirm(true)}>{L('批量删除','Delete')}</button>
      <button type="button" className="itemDetailsButton" onClick={()=>{setSelectedIds(new Set());setLastSelectedId(null);setBatchDeleteConfirm(false);}}>{L('清空','Clear')}</button>
     </>:<>
      <span className="marketSelectionConfirm">{L(`确认删除 ${selectedIds.size} 条订单？`,`Delete ${selectedIds.size} orders?`)}</span>
      <button type="button" className="itemDetailsButton" onClick={()=>setBatchDeleteConfirm(false)}>{L('取消','Cancel')}</button>
      <button type="button" className="itemDetailsButton marketDanger" disabled={accountLoading||bulkRunning||!session.connected} onClick={()=>{
       const targets=[...selectedIds].map(id=>{const base=rowsRef.current.find(x=>x.id===id);return {orderId:id,label:base?info(base).name:id};});
       setMessage('');
       orderQueueRef.current?.enqueueBatchDelete(targets,queueContextRef.current);
       setSelectedIds(new Set());setLastSelectedId(null);setBatchDeleteConfirm(false);
      }}>{L('确认删除','Delete')}</button>
     </>}
    </div>}
    <div className="marketOrderList">
    {groupFailure&&<div className="marketNotice marketRowError" role="alert"><span>{groupFailure.message}</span><button type="button" className="marketIconButton" aria-label={L('关闭错误提示','Dismiss error')} onClick={()=>orderQueueRef.current?.dismissFailure(GROUP_ALL_ORDER_ID)}><MarketIcon name="close"/></button></div>}
    {filterOpen&&<section className="mainFilterPanel"><div className="mainFilterPanelHeader"><strong>{L('筛选订单','Filter orders')}</strong><button className="mainFilterClose" onClick={()=>setFilterOpen(false)}><MarketIcon name="close"/>{L('关闭筛选','Close filters')}</button></div><div className="mainFilterGroups">{[{name:L('订单类型','Order type'),value:orderType,select:(v:string)=>setOrderType(orderType===v?'':v),options:[['sell',L('卖出','Sell')],['buy',L('买入','Buy')]]},{name:L('可见性','Visibility'),value:visibility,select:(v:string)=>setVisibility(visibility===v?'':v),options:[['visible',L('可见','Visible')],['hidden',L('隐藏','Hidden')]]},{name:L('缺少物品','Missing items'),value:missingOnly?'yes':missingNo?'no':'',select:(v:string)=>{setMissingOnly(v==='yes'&&!missingOnly);setMissingNo(v==='no'&&!missingNo);},options:[['yes',L('是','Yes')],['no',L('否','No')]]}].map(group=><div className="mainFilterGroup" key={group.name}><span>{group.name}</span><div>{group.options.map(([value,label])=><button key={value} className={group.value===value?'selected':''} aria-pressed={group.value===value} onClick={()=>group.select(value)}>{label}</button>)}</div></div>)}</div></section>}

    {newOrderOpen&&<section className="marketNewOrder"><div className="marketPickerHeading"><div><h3>{L('创建订单','Create an order')}</h3><p>{L('选择物品，然后在交易面板设置价格与数量','Choose an item, then set its price and quantity in the trading panel')}</p></div><button className="marketIconButton" aria-label={L('关闭','Close')} onClick={()=>setNewOrderOpen(false)}><MarketIcon name="close"/></button></div><div className="marketPickerControls"><select value={side} onChange={e=>setSide(e.target.value)}><option value="sell">{L('卖出','Sell')}</option><option value="buy">{L('买入','Buy')}</option></select><input autoFocus type="search" aria-label={L('搜索物品','Search items')} value={query} onFocus={()=>{if(!items.length&&native)void runSide(loadItems);}} onChange={e=>setQuery(e.target.value)}/></div><div className="marketPickerResults">{query.trim()?matches.slice(0,30).map(m=><button key={m.id} className="marketPickerItem" onClick={()=>void runSide(async()=>{await browse(m,side);setNewOrderOpen(false);})}><span>{displayName(m)}</span><MarketIcon name="arrow"/></button>):<p>{L('搜索部件、MOD、遗物、赋能或其他可交易物品','Search for a part, mod, relic, arcane, or another tradeable item')}</p>}</div></section>}
    {!!filtered.length&&<div className="marketOrderColumns"><span className="marketOrderColumnCheck"><input ref={masterCheckRef} type="checkbox" className="marketOrderCheck" aria-label={L('全选当前列表','Select all visible orders')} disabled={!visibleSelectableIds.length||accountLoading||bulkRunning||!session.connected} checked={allVisibleSelected} onChange={toggleAllVisible}/><span>{L('物品','Item')}</span></span>{[L('可见性','Visibility'),L('数量','Quantity'),L('单价','Price / item'),'',L('最低卖价','Lowest sell'),L('操作','Actions')].map((label,n)=><span key={n}>{label}</span>)}</div>}
    {filtered.map(r=>{
     const projected=projectedById.get(r.id)??projectOrderState(r,queueState.tasks);
     const row=projected.row,i=info(r),owned=ownership(row),quote=lowest[orderQuoteKey(r)],quoted=typeof quote==='number'?quote:null,copyPrice=quoted===null?null:quoted*(r.perTrade??1),canCopy=canCopyMarketPrice(copyPrice,editing?.id===r.id?editPrice:row.platinum),missing=orderMissing(row,owned),isEditing=editing?.id===r.id,rowLocked=accountLoading||bulkRunning||!session.connected||projected.deleting,isSelected=selectedIds.has(r.id),rowFailure=queueState.failed.find(f=>f.orderId===r.id);
     return <article key={r.id} data-order-id={r.id} className={'marketOrder'+(row.visible===false?' hiddenListing':'')+(isEditing?' editing':'')+(isSelected?' selected':'')+(projected.deleting?' deleting':'')+(projected.pendingCount>0&&!projected.deleting?' busy':'')} onKeyDown={e=>{if(e.key==='Escape'&&!accountLoading&&!bulkRunning){setEditing(null);setConfirmation(null);}}}>
     <div className="marketOrderBody"><div className="marketIdentity"><input type="checkbox" className="marketOrderCheck" aria-label={L('选择 ','Select ')+i.name} checked={isSelected} disabled={rowLocked} onMouseDown={e=>{shiftHeldRef.current=e.shiftKey;}} onChange={()=>{const shift=shiftHeldRef.current;shiftHeldRef.current=false;toggleRowSelection(r.id,shift);}}/><button className="marketArtwork" title={L('查看市场挂牌','View market listings')} onClick={()=>void runSide(()=>browse(i.market,r.type,row))}><Artwork item={i.local}/></button><div className="marketIdentityText"><h3 title={i.name}>{i.name}</h3><div className="marketIdentityMeta"><span className={'marketType '+r.type}>{r.type==='sell'?L('卖出','Sell'):L('买入','Buy')}</span>{(r.subtype||r.rank!==undefined)&&<span className="marketRank">{r.subtype?(en?r.subtype:marketSubtypeLabel(r.subtype)):L('等级 ','Rank ')+r.rank}</span>}{projected.deleting?<span className="marketQueueBadge deleting" title={L('正在按队列顺序从 warframe.market 移除','Queued to be removed sequentially from warframe.market')}>{projected.runningKind==='delete'||projected.runningKind==='fix'||projected.runningKind==='close'?L('删除中…','Deleting…'):L('待删除','Queued')}</span>:projected.pendingCount>0?<span className="marketQueueBadge pending" title={L('正在后台按顺序同步修改','Syncing queued edits sequentially')}>{projected.runningKind?L('同步中','Syncing'):L('排队中','Queued')}</span>:null}</div></div></div>
      <div className={'marketVisibility'+(row.visible!==false?' visible':'')}><span className="marketVisibilityState"><MarketIcon name={row.visible!==false?'eye':'hidden'}/><strong>{row.visible!==false?L('可见','Visible'):L('隐藏','Hidden')}</strong></span><button className="marketVisibilityToggle" disabled={rowLocked||isEditing} onClick={()=>enqueueOrderOp(r,'update',{visible:row.visible===false})}>{row.visible!==false?L('隐藏','Hide'):L('显示','Show')}</button></div>
      <div className="marketQuantity"><span className="marketMobileLabel">{L('数量','Quantity')}</span><strong>{row.quantity}</strong><small title={owned===null?L('此物品的库存暂不可用','Ownership is unavailable for this item'):L('最新库存中的份数','Copies in your latest inventory')}>{owned??'—'} {L('拥有','owned')}</small></div>
      <div className="marketUnitPrice"><span className="marketMobileLabel">{L('单价','Price / item')}</span><Price value={orderUnitPrice(row)}/></div>
      <button className={'marketIconButton marketCopyLowest'+(canCopy&&copyPrice!==null&&significantMarketPrice(copyPrice,isEditing?editPrice:row.platinum)?' significant':'')} disabled={rowLocked||!canCopy} title={L('将挂牌价格设为最低卖价','Set listing price to lowest sell')} onClick={()=>{if(!canCopy||copyPrice===null)return;if(isEditing)setEditPrice(copyPrice);else enqueueOrderOp(r,'update',{platinum:copyPrice});}}><MarketIcon name="arrow"/></button>
      <button className="marketComparison" title={L('对比市场实时报价','Compare live market listings')} onClick={()=>void runSide(()=>browse(i.market,r.type,row))}><span className="marketMobileLabel">{L('最低卖价','Lowest sell')}</span><Price value={quoted}/><span className="marketCompareLabel">{L('对比','Compare')}<MarketIcon name="arrow"/></span></button>
      <div className="marketRowActions"><button className="itemDetailsButton marketComplete" disabled={rowLocked||isEditing} title={r.type==='sell'?L('登记已卖出1份','Mark one copy as sold'):L('登记已买入1份','Mark one copy as bought')} onClick={()=>{if(confirmation?.id===r.id)setConfirmation(null);enqueueOrderOp(r,'close',{quantity:1});}}><MarketIcon name="check"/>{r.type==='sell'?L('卖出1份','Sold 1'):L('买入1份','Bought 1')}</button><button className="itemDetailsButton" disabled={rowLocked||isEditing} onClick={()=>edit(row)}><MarketIcon name="edit"/>{L('编辑','Edit')}</button><button className="marketIconButton marketAddOne" disabled={rowLocked||isEditing||row.quantity>=9998} title={L('挂牌数量加1','Increase listed quantity by 1')} onClick={()=>enqueueOrderOp(r,'update',{quantity:row.quantity+1})}>+1</button>{projected.deleting&&projected.canUndoQueued?<button type="button" className="itemDetailsButton marketUndoButton" title={L('撤销排队中的删除','Undo queued delete')} onClick={()=>orderQueueRef.current?.cancelOrder(r.id)}>{L('撤销','Undo')}</button>:<button className="marketIconButton marketRemove" disabled={rowLocked||isEditing} title={L('移除订单','Remove order')} aria-label={L('移除 ','Remove ')+i.name} onClick={()=>setConfirmation({id:r.id,action:'delete'})}><MarketIcon name="trash"/></button>}</div>
     </div>
     {missing&&!projected.deleting&&<div className="marketInventoryWarning"><MarketIcon name="warning"/><span>{L('已挂牌 '+row.quantity+' 份，库存中有 '+owned+' 份',row.quantity+' listed, '+owned+' found in your inventory')}</span><button disabled={rowLocked||isEditing} onClick={()=>setConfirmation({id:r.id,action:'fix'})}>{L('检查数量','Review quantity')}<MarketIcon name="arrow"/></button></div>}
     {isEditing&&<form className="marketEditForm" onSubmit={e=>{e.preventDefault();if(!Number.isInteger(editPrice)||editPrice<1||editPrice>800000||!Number.isInteger(editQuantity)||editQuantity<1||editQuantity>9998){setMessage(L('请输入有效价格与数量','Enter a valid price and quantity'));return;}enqueueOrderOp(r,'update',{platinum:editPrice,quantity:editQuantity});setEditing(null);}}><span><MarketIcon name="edit"/>{L('编辑订单','Edit order')}</span><label>{L('数量','Quantity')}<input type="number" min="1" max="9998" step="1" required value={editQuantity} disabled={rowLocked} onChange={e=>setEditQuantity(Number(e.target.value))}/></label><label>{(r.perTrade??1)>1?L('每 '+r.perTrade+' 个的白金','Platinum / '+r.perTrade+' items'):L('白金 / 每件','Platinum / item')}<input type="number" min="1" max="800000" step="1" required value={editPrice} disabled={rowLocked} onChange={e=>setEditPrice(Number(e.target.value))}/></label><span className="marketEditTotal">{L('总计','Total')}<Price value={editPrice*editQuantity/(r.perTrade??1)}/></span><button type="button" className="itemDetailsButton" disabled={accountLoading||bulkRunning} onClick={()=>setEditing(null)}>{L('取消','Cancel')}</button><button className="itemDetailsButton marketPrimary" disabled={rowLocked}><MarketIcon name="check"/>{L('保存','Save')}</button></form>}
     {confirmation&&confirmation.id===r.id&&<div className="marketInlineConfirm"><span>{confirmation.action==='fix'?L('将卖单数量调整为最新库存数量？','Match listed quantity to your latest inventory?'):L('从 warframe.market 移除此订单？','Remove this order from warframe.market?')}</span><button className="itemDetailsButton" disabled={accountLoading||bulkRunning} onClick={()=>setConfirmation(null)}>{L('取消','Cancel')}</button><button className="itemDetailsButton marketDanger" disabled={rowLocked} onClick={()=>{enqueueOrderOp(r,confirmation.action==='delete'?'delete':'fix',{});setConfirmation(null);if(editing?.id===r.id)setEditing(null);}}>{confirmation.action==='fix'?L('确认','Confirm'):L('移除','Remove')}</button></div>}
     {rowFailure&&<div className="marketRowError" role="alert"><span>{rowFailure.message}</span><button type="button" className="marketIconButton" aria-label={L('关闭错误提示','Dismiss error')} onClick={()=>orderQueueRef.current?.dismissFailure(r.id)}><MarketIcon name="close"/></button></div>}
    </article>;})}
    {!filtered.length&&<div className="marketEmpty"><MarketIcon name={hasFilters?'search':'box'}/><h3>{accountLoading?L('正在加载订单…','Loading your orders…'):hasFilters?L('没有匹配的订单','No matching orders'):L('还没有订单','No orders yet')}</h3><p>{hasFilters?L('尝试其他搜索或清空筛选','Try another search or clear your filters.'):L('创建订单，开始购买或出售物品','Create an order to start buying or selling items.')}</p><button className="itemDetailsButton marketPrimary" disabled={accountLoading||refreshing||bulkRunning} onClick={()=>{if(hasFilters)resetView();else setNewOrderOpen(true);}}>{hasFilters?L('重置搜索与筛选','Reset search & filters'):L('新建订单','New order')}</button></div>}
   </div></div>
   {qa&&<MarketQA/>}
   <div className="marketConnectionTools"><select className="marketPlatform" aria-label={L('交易平台','Trading platform')} value={platform} disabled={session.connected||accountLoading||refreshing||sideBusy||bulkRunning||queueState.active} onChange={e=>{setPlatform(e.target.value);setRows([]);setBook([]);setLowest({});}}>{['pc','ps4','xbox','switch'].map(p=><option key={p}>{p}</option>)}</select><MarketAccount platform={platform}/><details><summary>{L('成交记录','Trade completion')}</summary><TradeFinishPanel session={session} platform={effectivePlatform} market={items as any} disabled={accountLoading||bulkRunning||queueState.active} onRunning={setBulkRunning} onRefresh={refresh}/></details>{inventoryLoading&&<span role="status">{L('库存读取中','Reading inventory')}</span>}{inventoryError&&<span role="alert" title={inventoryError}>{L('库存读取失败','Inventory unavailable')}</span>}</div>
   </div>
  </section>
  {rail!=null?<TradeSidebar fissures={fissures} >{rail}</TradeSidebar>:marketSide}
  {message&&<div className="marketRequestStatus" role="status">{message}<button aria-label={L('关闭提示','Dismiss')} onClick={()=>setMessage('')}><MarketIcon name="close"/></button></div>}
 </div>;
}

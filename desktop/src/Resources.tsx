import {resourceInventoryNeed} from './resourceInventoryNeed';
import './inventoryFamilyParity.css';
import {snapshotScope} from './accountScopeModel';
import type {NavigationDetail} from './navigationModel';
type ResourceNavigation=Extract<NavigationDetail,{page:'resources'}>;
import type {ShardFocus} from './shardFocus';
import {isInventoryAvailable,resourceDemand,type DemandCatalog} from './resourceDemand';
import {useEffect,useMemo,useRef,useState} from 'react';
import {useTranslation} from 'react-i18next';
import {useCollectionSnapshot} from './useCollectionSnapshot';
import {itemName} from './itemNames';
import {searchText} from './searchText';
import Artwork from './Artwork';
import ItemDetails,{type DetailItem} from './ItemDetails';
import ArchonShards from './ArchonShards';
import ResourceSources from './ResourceSources';
import './resources.css';
import ResourceCrafting from './ResourceCrafting';
import ResourceMining from './ResourceMining';
import type {MiningPlannerItem} from './miningPlannerModel';
import {invoke} from '@tauri-apps/api/core';
import {native} from './api';
import {useResourcePreferences} from './useResourcePreferences';
import {filterAndSortInventoryResources,resourceProgress,type ResourceInventoryFilter,type ResourceInventoryOrder} from './resourceUsageModel';

type ResourceCatalogItem=DetailItem&MiningPlannerItem;

export default function Resources({shardFocus,requestedView,onViewChange}:{shardFocus?:ShardFocus;requestedView?:ResourceNavigation;onViewChange?:(view:ResourceNavigation['view'])=>void}){
 const {i18n}=useTranslation(),en=i18n.language.startsWith('en'),L=(zh:string,eng:string)=>en?eng:zh;
 const snapshot=useCollectionSnapshot();
 const {preferences,update,storageError}=useResourcePreferences();
 const {view,inventoryFilter,inventoryOrder:order}=preferences;
 const setView=(view:'inventory'|'plan'|'mining'|'shards')=>{update({view});setSearch('');setSelected(null);setLimit(80);};
 useEffect(()=>{if(shardFocus)setView('shards');},[shardFocus]);
 const pendingNavigation=useRef<ResourceNavigation['view']|null>(null);
 useEffect(()=>{if(requestedView){pendingNavigation.current=requestedView.view;if(requestedView.view!==view)update({view:requestedView.view});}},[requestedView]);
 useEffect(()=>{if(pendingNavigation.current&&pendingNavigation.current!==view)return;pendingNavigation.current=null;onViewChange?.(view);},[view,onViewChange]);
 const setInventoryFilter=(next:ResourceInventoryFilter)=>update({inventoryFilter:next,ownedOnly:next==='owned'});
 const setOrder=(inventoryOrder:ResourceInventoryOrder)=>update({inventoryOrder});
 const [busy,setBusy]=useState(false);
 const favoritePending=useRef(false);
 const favorite=async(id:string,enabled:boolean)=>{if(!native||!snapshot||favoritePending.current)return;favoritePending.current=true;setBusy(true);try{await invoke('set_collection_favorite',{id,expectedScope:snapshotScope(snapshot),enabled});window.dispatchEvent(new CustomEvent('myframe-collection-updated'));setError('');}catch(e){setError(String(e));}finally{favoritePending.current=false;setBusy(false);}};
 const [demandCatalog,setDemandCatalog]=useState<DemandCatalog|null>(null);
 const [items,setItems]=useState<ResourceCatalogItem[]>([]),[ids,setIds]=useState<string[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true),[catalogRetry,setCatalogRetry]=useState(0);
 const [search,setSearch]=useState(''),[limit,setLimit]=useState(80),[selected,setSelected]=useState<DetailItem|null>(null);
 const scroll=useRef<HTMLDivElement>(null);
 useEffect(()=>{setSearch('');setSelected(null);setLimit(80);scroll.current?.scrollTo(0,0);},[view]);
 useEffect(()=>{let live=true;setLoading(true);setError('');Promise.all(['/catalog.json','/resource-index.json'].map(async url=>{const r=await fetch(url);if(!r.ok)throw Error(`${url}: ${r.status}`);return r.json();})).then(([catalog,index])=>{if(!Array.isArray(catalog.items)||!Array.isArray(index.items)||!Array.isArray(index.ids)||!Array.isArray(index.goalIds)||!index.recipes)throw Error(L('资源目录格式无效','Invalid resource catalog'));if(live){setItems([...catalog.items,...index.items]);setIds(index.ids);setDemandCatalog(index);}}).catch(e=>{if(live)setError(String(e));}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};},[catalogRetry]);
 const known=isInventoryAvailable(snapshot);
 const quantity=(id:string)=>snapshot?.counts[id]??(known?0:null);
 const all=useMemo(()=>new Map(items.map(item=>[item.id,item])),[items]);
 const demand=useMemo(()=>demandCatalog?resourceDemand(demandCatalog,snapshot,all):null,[demandCatalog,snapshot,all]);
 const need=(id:string,scope:'favorites'|'remaining')=>{const state=resourceInventoryNeed(demand?.[scope],id),value=state.quantity===null?'—':format(state.quantity);return {covered:state.covered,text:state.kind==='atLeast'?L(`至少 ${value} 缺少`,`At least ${value} needed`):state.kind==='missing'?L(`${value} 缺少`,`${value} needed`):state.kind==='keep'?L(`${value} 应保留`,`${value} to keep`):state.kind==='none'?L('无需保留','Not needed'):state.kind==='unverified'?L('未核实','Unverified'):L('不可用','Unavailable')};};
 const resourceItems=useMemo(()=>ids.map(id=>all.get(id)).filter((item):item is DetailItem=>!!item),[ids,all]);
 const rows=useMemo(()=>filterAndSortInventoryResources(resourceItems,{filter:inventoryFilter,order,search,matchesSearch:(item,q)=>searchText(q,item.name,item.zh,item.id),owned:id=>quantity(id),remainingPlan:demand?.remaining,displayName:item=>itemName(item,en)}),[resourceItems,inventoryFilter,order,search,snapshot,known,demand,en]);
 useEffect(()=>{setLimit(80);scroll.current?.scrollTo(0,0);},[search,inventoryFilter,order]);

 const format=(value:number|null)=>value===null?'—':new Intl.NumberFormat(i18n.language,{notation:'compact',maximumFractionDigits:1}).format(value);
 return <section className="resourceInventory resourceWorkspace" aria-label={L('资源库存','Resource inventory')}>
  <nav className="resourceViews" aria-label={L('资源页面','Resource pages')}>{[['inventory','resourceInventory.svg',L('资源库存','Resource inventory')],['plan','craftingPlan.svg',L('制造助手','Crafting helper')],['mining','farmRoutes.svg',L('采矿规划','Mining planner')],['shards','archonShards.svg',L('源力石','Archon shards')]].map(([key,icon,label])=><button key={key} aria-pressed={view===key} onClick={()=>setView(key as 'inventory'|'plan'|'mining'|'shards')}><span className="resourceSectionIcon" style={{maskImage:`url(/reference/ui/${icon})`,WebkitMaskImage:`url(/reference/ui/${icon})`}}/>{label}</button>)}</nav>
  {storageError&&<p role="alert">{L('页面偏好无法读取或保存，当前设置仍可使用','Page preferences could not be read or saved; current settings remain usable')}</p>}
  {view!=='shards'&&<h2>{view==='inventory'?L('资源库存','Resource inventory'):view==='mining'?L('采矿规划','Mining planner'):L('制造助手','Crafting helper')}</h2>}
  {view==='inventory'&&<>
  <div className="resourceToolbar"><div className="resourceOwnership" role="group" aria-label={L('资源筛选','Resource filter')}><button aria-pressed={inventoryFilter==='all'} onClick={()=>setInventoryFilter('all')}>{L('全部','All')}</button><button aria-pressed={inventoryFilter==='owned'} onClick={()=>setInventoryFilter('owned')}>{L('已拥有','Owned')}</button><button aria-pressed={inventoryFilter==='missing'} onClick={()=>setInventoryFilter('missing')} title={L('仅显示全毕业仍有缺口的资源','Only show resources still missing for all unlocks')}>{L('有缺口','Missing')}</button></div><input aria-label={L('搜索资源','Search resources')} placeholder={L('搜索资源名称','Search resources by name')} value={search} onChange={e=>setSearch(e.target.value)}/><select aria-label={L('资源排序','Resource ordering')} value={order} onChange={e=>setOrder(e.target.value as ResourceInventoryOrder)}><option value="name">{L('名称','Name')}</option><option value="quantity">{L('拥有数量','Owned quantity')}</option><option value="shortage">{L('缺口最大','Largest shortage')}</option><option value="needed">{L('毕业总需','Total needed')}</option></select></div>
  {error&&<p role="alert">{error}</p>}
  <div className="resourceScroll" ref={scroll}>
   {loading?<p role="status">{L('正在读取资源目录…','Loading resources…')}</p>:<div className="resourceCards">{rows.slice(0,limit).map(item=>{const prog=resourceProgress(demand?.remaining,item.id),progTitle=prog.known&&prog.needed>0?`${prog.covered.toLocaleString()} / ${prog.needed.toLocaleString()}${prog.missing>0?` · ${L('还差','Missing')} ${prog.missing.toLocaleString()}`:''}`:undefined;return <button className="resourceInventoryCard" key={item.id} onClick={()=>setSelected(item)}><span className="resourceInventoryIdentity"><Artwork item={item}/><strong title={itemName(item,en)}>{itemName(item,en)}</strong><span className="resourceAmount" title={quantity(item.id)?.toLocaleString(i18n.language)}>{format(quantity(item.id))} <small>{L('已拥有','owned')}</small></span></span><span className="resourceNeeds"><span><span>{L('收藏需求','Favorites')}</span><strong className={need(item.id,'favorites').covered?'covered':''}>{need(item.id,'favorites').covered&&<img src="/reference/ui/tick.png" alt=""/>}{need(item.id,'favorites').text}</strong></span><span><span>{L('全部未解锁','All unlocks')}</span><strong className={need(item.id,'remaining').covered?'covered':''} title={progTitle}>{need(item.id,'remaining').covered&&<img src="/reference/ui/tick.png" alt=""/>}{need(item.id,'remaining').text}</strong></span>{prog.known&&prog.needed>0&&<span className="resourceCardProgress" title={progTitle}><span className="resourceCardBar"><i className={prog.missing===0?'ok':undefined} style={{width:`${prog.percent}%`}}/></span><b>{prog.percent}% · {format(prog.needed)}</b></span>}</span><span className="resourceSourceLink">{L('来源与详情','Sources & details')} <svg viewBox="0 0 24 24"><path d="m9 5 7 7-7 7"/></svg></span></button>;})}</div>}
   {!loading&&!error&&!rows.length&&<p>{L('没有匹配的资源','No matching resources')}</p>}{rows.length>limit&&<button className="resourceShowMore" onClick={()=>setLimit(n=>n+80)}>{L('显示更多资源','Show more resources')}</button>}
  </div>
  </>}
  {view==='inventory'&&error&&<button onClick={()=>setCatalogRetry(n=>n+1)}>{L('重试','Retry')}</button>}{(view==='plan'||view==='mining')&&error&&<p role="alert">{error} <button onClick={()=>setCatalogRetry(n=>n+1)}>{L('重试','Retry')}</button></p>}
  {(view==='plan'||view==='mining')&&loading&&!demandCatalog&&<p role="status">{L('正在读取制造配方…','Loading crafting recipes…')}</p>}
  {view==='plan'&&demandCatalog&&<ResourceCrafting uiPreferences={preferences} onPreferences={update} catalog={demandCatalog} items={all} snapshot={snapshot} en={en} busy={busy} canFavorite={native&&!!snapshot} onFavorite={(id,enabled)=>void favorite(id,enabled)} onOpen={setSelected}/>}
  {view==='mining'&&demandCatalog&&<ResourceMining catalog={demandCatalog} items={all} snapshot={snapshot} en={en} busy={busy} canFavorite={native&&!!snapshot} onFavorite={(id,enabled)=>void favorite(id,enabled)} onOpen={setSelected}/>}
  {view==='shards'&&<ArchonShards focus={shardFocus} snapshot={snapshot} items={all} en={en} onOpen={setSelected}/>}
  {selected&&view==='shards'&&<ItemDetails item={selected} items={all} en={en} counts={snapshot?.counts??{}} complete={known} favorites={snapshot?.favorites??[]} canFavorite={native&&!!snapshot&&!busy} onFavorite={id=>void favorite(id,!snapshot?.favorites?.includes(id))} onClose={()=>setSelected(null)}/>}
  {selected&&view!=='shards'&&demandCatalog&&<ResourceSources item={selected} items={all} catalog={demandCatalog} snapshot={snapshot} en={en} remainingPlan={demand?.remaining} favoritePlan={demand?.favorites} defaultScope="remaining" favorites={snapshot?.favorites??[]} busy={busy} canFavorite={native&&!!snapshot} onFavorite={(id,enabled)=>void favorite(id,enabled)} onClose={()=>setSelected(null)}/>}
 </section>;
}

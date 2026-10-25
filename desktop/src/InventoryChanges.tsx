import PanelIcon from './PanelIcon';
import {useEffect,useMemo,useRef,useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {useTranslation} from 'react-i18next';
import {useAccounts} from './AccountProvider';
import {useMarketSession} from './MarketAccount';
import {native} from './api';
import Artwork from './Artwork';
import {itemName} from './itemNames';
import {searchText} from './searchText';
import {rivenInventoryRefresh} from './rivenInventoryRefresh';
import type {DetailItem} from './ItemDetails';
import InventoryChangeQuote from './InventoryChangeQuote';
import {harrowChassisId,parseInventoryChanges,inventoryChangeRows,inventoryChangeTotals,type InventoryChangesData,type ChangeView,type ChangeQuote} from './inventoryChangesModel';
import './inventoryChanges.css';
const empty:InventoryChangesData={revision:0,pending:{}};
export default function InventoryChanges(){
 const {scope}=useAccounts(),session=useMarketSession(),platform=session.platform??'pc',{i18n}=useTranslation(),en=i18n.language.startsWith('en'),L=(zh:string,eng:string)=>en?eng:zh;
 const qa=import.meta.env.DEV&&!native&&new URLSearchParams(location.search).get('qa')==='delta';
 const [stored,setStored]=useState({scope,value:empty}),[error,setError]=useState(''),[open,setOpen]=useState(false),[busy,setBusy]=useState(false),[compact,setCompact]=useState(false),[query,setQuery]=useState(''),[view,setView]=useState<ChangeView>('parts'),[limit,setLimit]=useState(60),[reload,setReload]=useState(0);
 const [catalog,setCatalog]=useState<Map<string,DetailItem>>(new Map()),[ducats,setDucats]=useState<Record<string,number>>({}),[slugs,setSlugs]=useState<Record<string,string>>({}),[metadataReady,setMetadataReady]=useState(false),[metadataError,setMetadataError]=useState(''),[metadataAttempt,setMetadataAttempt]=useState(0),[quotes,setQuotes]=useState<Record<string,ChangeQuote>>({});
 const [noticeDismissed,setNoticeDismissed]=useState(false);
 useEffect(()=>setNoticeDismissed(false),[scope,stored.value.revision]);
 const data=stored.scope===scope?stored.value:empty,pendingCount=Object.keys(data.pending).length,harrows=data.pending[harrowChassisId]?.quantity??0;
 const quoteContext=JSON.stringify([scope,platform,open]),quoteContextRef=useRef(quoteContext);quoteContextRef.current=quoteContext;
 const end=useRef<HTMLDivElement>(null),scroll=useRef<HTMLDivElement>(null),close=useRef<HTMLButtonElement>(null),generation=useRef(0),ackPending=useRef(false),scopeRef=useRef(scope);scopeRef.current=scope;
 useEffect(()=>{generation.current++;ackPending.current=false;setBusy(false);setOpen(false);setQuery('');setView('parts');setStored({scope,value:empty});setQuotes({});setError('');},[scope]);
 useEffect(()=>{
  const expectedScope=scope;const reader=rivenInventoryRefresh(async()=>{
   if(native)return parseInventoryChanges(await invoke('inventory_changes',{expectedScope}));
   if(qa){const response=await fetch('/qa/inventory-changes.json');if(!response.ok)throw Error('Delta fixture unavailable');return parseInventoryChanges(await response.json());}
   return empty;
  },value=>{if(scopeRef.current===expectedScope)setStored({scope:expectedScope,value});},()=>{},message=>{if(scopeRef.current===expectedScope)setError(message);});
  const refresh=()=>void reader.refresh();refresh();const off=native?listen('collection-updated',refresh):null;
  return()=>{reader.dispose();void off?.then(f=>f());};
 },[scope,reload,qa]);
 const shouldLoad=(open||pendingCount>0)&&!metadataReady;
 useEffect(()=>{if(!shouldLoad)return;let alive=true;setMetadataError('');void Promise.all([fetch('/catalog.json'),fetch('/inventory-tradables.json'),fetch('/sale-crafting-index.json')].map(async response=>{const r=await response;if(!r.ok)throw Error('Item metadata unavailable');return r.json();})).then(([c,m,d])=>{if(!Array.isArray(c.items)||!m||typeof m!=='object')throw Error('Item metadata invalid');if(alive){setCatalog(new Map(c.items.map((i:DetailItem)=>[i.id,i])));setSlugs(m);setDucats(d.ducats??{});setMetadataReady(true);}}).catch(e=>{if(alive)setMetadataError(String(e));});return()=>{alive=false;};},[shouldLoad,metadataAttempt]);
 useEffect(()=>{generation.current++;setQuotes({});if(!open)return;let alive=true;const previous=document.activeElement as HTMLElement|null;close.current?.focus();const key=(e:KeyboardEvent)=>{if(e.key==='Escape')setOpen(false);};window.addEventListener('keydown',key);return()=>{alive=false;window.removeEventListener('keydown',key);previous?.focus();};},[open,scope,platform]);
 useEffect(()=>()=>{generation.current++;},[]);
 const rows=useMemo(()=>inventoryChangeRows(data,catalog,slugs,view),[data,catalog,slugs,view]);
 const visible=useMemo(()=>rows.filter(row=>{const item=catalog.get(row.id);return searchText(query,item?.name??'',item?.zh??'',row.id);}),[rows,query,catalog]);
 const partRows=useMemo(()=>inventoryChangeRows(data,catalog,slugs,'parts'),[data,catalog,slugs]),partCopies=partRows.reduce((sum,row)=>sum+row.quantity,0);
 const totals=useMemo(()=>inventoryChangeTotals(visible,quotes,ducats,platform),[visible,quotes,ducats,platform]);
 useEffect(()=>{setLimit(60);if(scroll.current)scroll.current.scrollTop=0;},[query,view,open,compact]);
 useEffect(()=>{if(!open||!end.current)return;const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting))setLimit(n=>Math.min(visible.length,n+60));},{root:scroll.current,rootMargin:'160px'});observer.observe(end.current);return()=>observer.disconnect();},[open,limit,visible.length]);
 async function acknowledge(){if(ackPending.current)return;ackPending.current=true;const request=++generation.current,expectedScope=scope,revision=data.revision;setBusy(true);setError('');try{if(native){await invoke('acknowledge_inventory_changes',{revision,expectedScope});const next=parseInventoryChanges(await invoke('inventory_changes',{expectedScope}));if(request===generation.current&&scopeRef.current===expectedScope)setStored({scope:expectedScope,value:next});}else if(qa)setStored({scope:expectedScope,value:{...empty,revision:revision+1}});if(request===generation.current&&scopeRef.current===expectedScope)setOpen(false);}catch(e){if(request===generation.current&&scopeRef.current===expectedScope)setError(String(e));}finally{if(request===generation.current){ackPending.current=false;setBusy(false);}}}
 const format=(n:number)=>n.toLocaleString(en?'en':'zh-CN',{maximumFractionDigits:1});
 if(!pendingCount&&!open)return error?<button className="inventoryChangesNotice" onClick={()=>setOpen(true)}>{L('新增物品读取失败','New items unavailable')}</button>:null;
 return <>{!noticeDismissed&&!open&&<div className="inventoryChangesNotice"><button className="inventoryChangesOpen" onClick={()=>setOpen(true)}><span className="inventoryChangesNoticeIcon"><PanelIcon name="arbitration"/></span><span><strong>{metadataReady?format(partCopies):'…'} {L('件新增物品','new items found')}</strong><small>{L('查看物品','Review items')} →</small></span></button><button className="inventoryChangesNoticeClose" aria-label={L('关闭新增提示','Dismiss new items notice')} onClick={()=>setNoticeDismissed(true)}><PanelIcon name="close"/></button></div>}{open&&<div className="inventoryChangesShade" onMouseDown={e=>{if(e.target===e.currentTarget)setOpen(false);}}><section className="inventoryChangesModal" role="dialog" aria-modal="true" aria-label={L('新增物品','New items')} onKeyDown={e=>{if(e.key!=='Tab')return;const controls=e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input,select');const first=controls[0],last=controls[controls.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}}>
 <header><h2>{L('发现新物品','New items found')}</h2><div className="inventoryChangeHeaderActions"><div className="inventoryChangeViewSwitch"><button title={L('卡片视图','Card view')} aria-label={L('卡片视图','Card view')} aria-pressed={!compact} onClick={()=>setCompact(false)}><svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg></button><button title={L('紧凑列表','Compact list')} aria-label={L('紧凑列表','Compact list')} aria-pressed={compact} onClick={()=>setCompact(true)}><svg viewBox="0 0 24 24"><path d="M9 5h12M9 12h12M9 19h12M3 5h1M3 12h1M3 19h1"/></svg></button></div><button ref={close} onClick={()=>setOpen(false)} aria-label={L('关闭新增物品','Close new items')}><PanelIcon name="close"/></button></div></header>
 {qa&&<p role="status">QA 演示快照 · 非玩家真实库存 / Fixture data</p>}{error&&<p role="alert">{error} <button onClick={()=>{setError('');setReload(n=>n+1);}}>{L('刷新','Refresh')}</button></p>}{metadataError&&<p role="alert">{metadataError} <button onClick={()=>setMetadataAttempt(n=>n+1)}>{L('重试','Retry')}</button></p>}
 <div className="inventoryChangesOverview"><div><strong>{format(totals.copies)} {L('新增件数','new copies')}</strong><span>{format(totals.itemTypes)} {L('种物品','different items')}</span></div><div className="inventoryChangesTotals"><div title={totals.unpriced?L('部分物品价格未知','Some item prices are unknown'):undefined}><img src="/reference/ui/platinum.png" alt=""/><span>{L('预估价值','Estimated value')}<strong>{totals.platinum===null?'—':format(totals.platinum)}</strong></span></div><div><img src="/reference/ui/ducats.png" alt=""/><span>{L('杜卡德','Ducats')}<strong>{totals.ducats===null?'—':format(totals.ducats)}</strong></span></div></div></div>
 <div ref={scroll} className={'inventoryChangesRows'+(compact?' compact':'')}>{visible.slice(0,limit).map(row=>{const item=catalog.get(row.id),expectedQuoteContext=quoteContext,expectedScope=scope;return <article key={row.key}><Artwork item={item}/><div><strong>{item?itemName(item,en):row.id.split('/').at(-1)}</strong><span>+{format(row.quantity)} {row.unknownEquivalent?L('基础等价份数','rank-zero equivalents'):L('件','copies')}{row.upgraded&&<> · {L('等级','Rank')} {row.rank??'—'}</>}</span></div><div><InventoryChangeQuote key={JSON.stringify([scope,platform,row.key])} row={row} slug={slugs[row.id]} platform={platform} en={en} viewport={scroll} onQuote={(key,value)=>{if(scopeRef.current===expectedScope&&quoteContextRef.current===expectedQuoteContext)setQuotes(old=>({...old,[key]:value}));}}/><small>{!row.upgraded&&Number.isSafeInteger(ducats[row.id])?format(ducats[row.id]*row.quantity):'—'} {L('杜卡德','Ducats')}</small>{item&&slugs[row.id]&&(!row.upgraded||row.rank!==null)&&<button onClick={()=>{setOpen(false);window.dispatchEvent(new CustomEvent('myframe-open-market',{detail:{id:row.id,slug:slugs[row.id],name:itemName(item,en),englishName:item.name,platform,...(row.upgraded?{rank:row.rank}:{})}}));}}>{L('交易','Trade')}</button>}</div></article>;})}{visible.length>limit&&<div ref={end} aria-hidden="true"/>}{!visible.length&&<p role="status">{!metadataReady&&!metadataError?L('读取物品目录…','Loading item catalog…'):L('没有符合条件的条目','No matching items')}</p>}</div>
 <footer><span>{harrows>0&&<>{L('另外获得：','Also found: ')}<strong>{format(harrows)} {L('个 Harrow 机体蓝图','Harrow chassis blueprints')}</strong></>}</span><button onClick={()=>setOpen(false)}>{L('稍后查看','Continue later')}</button><button disabled={busy||!pendingCount||!!error||!metadataReady} title={L('标记本次全部分类的新增记录为已读','Mark new records in every category as read')} onClick={()=>void acknowledge()}>{busy?L('处理中…','Working…'):L('标记为已读','Mark as seen')}</button></footer>
 </section></div>}</>;
}


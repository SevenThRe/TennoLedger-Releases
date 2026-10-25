import {createPortal} from 'react-dom';
import {useEffect,useMemo,useRef,useState} from 'react';
import type {DetailItem} from './ItemDetails';
import type {DemandCatalog,DemandSnapshot} from './resourceDemand';
import type {ResourceRequirement} from './resourcePlan';
import type {Relic} from './relicModel';
import type {Sources} from './masteryModel';
import {resourceSources} from './resourceSourceModel';
import {pendingCrafts} from './pendingCrafts';
import {craftingNames} from './itemNames';
import {useDropLocation} from './useDropLocation';
import {searchText} from './searchText';
import {relicImage} from './relicImage';
import Artwork from './Artwork';
import WikiLinks from './WikiLinks';
import RelicOverview from './RelicOverview';
import './resourceSources.css';
import {loadResourceSourceData} from './craftingSources';
type Props={item:DetailItem;items:Map<string,DetailItem>;catalog:DemandCatalog;snapshot:DemandSnapshot|null;en:boolean;requirement?:ResourceRequirement;craft?:boolean;onCraft?:()=>void;onGoal?:(id:string)=>void;onClose:()=>void};
export default function ResourceSources({item,items,catalog,snapshot,en,requirement,craft,onCraft,onGoal,onClose}:Props){
 const L=(zh:string,eng:string)=>en?eng:zh,name=craftingNames(items,en),location=useDropLocation(en);
 const [data,setData]=useState<{relics:Relic[];sources:Sources}|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0),[search,setSearch]=useState(''),[limit,setLimit]=useState(40),[opened,setOpened]=useState<Relic|null>(null);
 const close=useRef<HTMLButtonElement>(null),scroll=useRef<HTMLDivElement>(null),end=useRef<HTMLDivElement>(null);
 useEffect(()=>{const previous=document.activeElement as HTMLElement|null;close.current?.focus();return()=>{if(previous?.isConnected)previous.focus();};},[]);
 useEffect(()=>{const controller=new AbortController();let active=true;setError('');setData(null);const timer=setTimeout(()=>controller.abort(),15000);
  loadResourceSourceData(async url=>{const r=await fetch(url,{signal:controller.signal});if(!r.ok)throw Error(`${url}: ${r.status}`);return r.json();}).then(result=>{if(active){setData(result);if(result.failed)setError('partial');}}).catch(e=>{if(active)setError(String(e));}).finally(()=>clearTimeout(timer));return()=>{active=false;clearTimeout(timer);controller.abort();};},[retry]);
 const prepared=useMemo(()=>pendingCrafts(catalog.recipes,new Set(catalog.blueprintIds),snapshot?.pendingRecipes,snapshot?.counts??{},catalog.pendingRecipeOutputs),[catalog,snapshot]);
 const owned=item.id==='credits'?snapshot?.credits??null:prepared.stock[item.id]??(snapshot?.complete?0:null);
 const rows=useMemo(()=>{const ids=new Set([item.id]);for(const parent of Object.values(data?.sources.items??{}))for(const part of parent.parts)if(part.ownedItemId===item.id)ids.add(part.itemId);return resourceSources(catalog.dropSources?.[item.id]??item.detail?.drops??[],data?.relics??[],ids,snapshot);},[item,data,snapshot,catalog]);
 const filtered=rows.filter(row=>searchText(search,row.location,location(row.location),row.reward??'',row.rotation??''));
 useEffect(()=>{setLimit(40);scroll.current?.scrollTo(0,0);},[search,item.id]);
 useEffect(()=>{const target=end.current;if(!target||limit>=filtered.length)return;const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting))setLimit(n=>Math.min(n+40,filtered.length));},{root:scroll.current,rootMargin:'160px'});observer.observe(target);return()=>observer.disconnect();},[limit,filtered.length]);
 const rewardNames=useMemo(()=>new Map([...items.values()].map(i=>[i.name,en?i.name:i.zh||i.name])),[items,en]);
 const rewardText=(text:string)=>{const match=text.match(/^(\d[\d,.]*)\s*[xX×]\s*(.+)$/);return match?`${match[1]}× ${rewardNames.get(match[2])??match[2]}`:rewardNames.get(text)??text;};
 const description=(!en?catalog.descriptionsZh?.[item.id]:undefined)??item.detail?.description;
 const count=(n:number|null|undefined)=>n==null?'—':n.toLocaleString();
 return createPortal(<div className="resourceSourceShade" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><section className="resourceSourceDialog" role="dialog" aria-modal="true" aria-label={L('来源与详情','Sources & details')} onKeyDown={e=>{if(opened)return;if(e.key==='Escape'){e.stopPropagation();onClose();}if(e.key==='Tab'){const nodes=[...e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input,a[href]')];const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}}}>
  <header><Artwork item={item}/><h3>{name(item.id)}</h3><button ref={close} aria-label={L('关闭来源详情','Close source details')} onClick={onClose}>×</button></header>
  <div className="resourceSourceBody" ref={scroll}>
   <div className="resourceSourceCounts"><div><span>{L('库存','In inventory')}</span><strong>{count(owned)}</strong></div>{prepared.known&&(prepared.outputs[item.id]??0)>0&&<div><span>{L('铸造厂','In Foundry')}</span><strong>{count(prepared.outputs[item.id])}</strong></div>}{requirement&&<><div><span>{L('计划需求','Needed for plan')}</span><strong>{count(requirement.needed)}</strong></div><div><span>{requirement.crafts?L('待制造批次','Batches to craft'):L('缺少','Needed')}</span><strong>{snapshot?.complete?count(requirement.crafts||requirement.missing):'—'}</strong></div></>}</div>
   {description&&<p className="resourceSourceDescription">{description.replace(/<[^>]*>/g,'')}</p>}
   {requirement&&requirement.crafts>0&&(catalog.recipes[item.id]?.output??1)>1&&<p>{requirement.crafts} × {catalog.recipes[item.id].output} = {requirement.crafts*catalog.recipes[item.id].output} {L('产出','produced')}</p>}
   {onCraft&&<label className="resourceSourceCraft"><input type="checkbox" checked={!!craft} onChange={onCraft}/>{L('使用材料自行制造','Craft missing items from ingredients')}</label>}
   {!!requirement?.usedBy.length&&<div className="resourceSourceUsage"><h4>{L('使用此材料的收藏','Used by your favorites')}</h4>{requirement.usedBy.map(id=><button key={id} onClick={()=>{onGoal?.(id);onClose();}} disabled={!onGoal}><Artwork item={items.get(id)}/><span>{name(id)}</span><span>›</span></button>)}{requirement.reusable&&<p>{L('可重复使用的蓝图，仅保留一份','Reusable blueprint, one copy needed')}</p>}</div>}
   <h4>{L('已知掉落来源','Known drop sources')}</h4>{catalog.ids.includes(item.id)&&<WikiLinks name={item.name} zh={item.zh}/>}
   {!data&&!error&&<p role="status">{L('正在读取来源…','Loading sources…')}</p>}{error&&<p role="alert">{L('部分来源未能读取，保留已知来源','Some sources could not be loaded; known sources are shown')} <button onClick={()=>setRetry(n=>n+1)}>{L('重试','Retry')}</button></p>}
   {data&&<><input className="resourceSourceSearch" aria-label={L('搜索来源','Search sources')} placeholder={L('搜索任务、敌人或遗物','Search missions, enemies, or relics')} value={search} onChange={e=>setSearch(e.target.value)}/><div className="resourceSourceRows">{filtered.slice(0,limit).map((row,index)=>row.relic?<button className={(row.owned??0)>0?'owned':''} key={row.relic.id} onClick={()=>setOpened(row.relic!)}><img src={relicImage(row.relic.era,'Intact')} alt=""/><span><strong>{row.location}</strong><small>{row.owned==null?L('库存未知','Ownership unavailable'):`${count(row.owned)} ${L('已拥有','owned')}`} · {row.relic.vaulted===null?L('入库状态未知','Vault status unknown'):row.relic.vaulted?L('已入库','Vaulted'):L('未入库','Available')}</small>{row.reward&&<small>{rewardText(row.reward)}</small>}</span><span>›</span></button>:<div key={`${row.location}-${index}`}><span className="resourceDropIdentity"><strong>{location(row.location)}</strong>{row.reward&&<small>{rewardText(row.reward)}</small>}{row.rotation&&!row.location.includes(`Rotation ${row.rotation}`)&&<small>{L('轮次','Rotation')} {row.rotation}</small>}</span><span>{row.chance==null?'—':`${+row.chance.toFixed(2)}%`}</span></div>)}{!filtered.length&&<p>{rows.length?L('没有匹配的来源','No sources match your search'):L('未列出掉落来源','No drop sources listed')}</p>}<div ref={end}/></div></>}
  </div>
 </section>{opened&&<RelicOverview relic={opened} variants={data?.relics??[]} counts={snapshot?.counts??{}} complete={!!snapshot?.complete} snapshot={snapshot} en={en} onClose={()=>setOpened(null)}/>}</div>,document.querySelector('.resourceWorkspace')??document.body);
}

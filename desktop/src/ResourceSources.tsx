import {createPortal} from 'react-dom';
import {useEffect,useMemo,useRef,useState} from 'react';
import type {DetailItem} from './ItemDetails';
import {isInventoryAvailable,type DemandCatalog,type DemandSnapshot} from './resourceDemand';
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
import {MINING_ALT_SOURCE_LABELS,MINING_VENDOR_LABELS,MINING_ZONE_LABELS,RAW_MINERAL_BY_ID} from './miningCatalogModel';
import {resourceConsumers,resourceProgress,type ResourcePlanSummary} from './resourceUsageModel';
type ResourceDetailItem=DetailItem&{maxRank?:number;masteryReq?:number};
type Props={item:DetailItem;items:ReadonlyMap<string,ResourceDetailItem>;catalog:DemandCatalog;snapshot:DemandSnapshot|null;en:boolean;requirement?:ResourceRequirement;remainingPlan?:ResourcePlanSummary;favoritePlan?:ResourcePlanSummary;defaultScope?:'remaining'|'favorites';favorites?:readonly string[];busy?:boolean;canFavorite?:boolean;onFavorite?:(id:string,enabled:boolean)=>void;craft?:boolean;onCraft?:()=>void;onGoal?:(id:string)=>void;onClose:()=>void};
export default function ResourceSources({item:initialItem,items,catalog,snapshot,en,requirement,remainingPlan,favoritePlan,defaultScope,favorites,busy,canFavorite,onFavorite,craft,onCraft,onGoal,onClose}:Props){
 const [history,setHistory]=useState<DetailItem[]>([initialItem]);
 const hasScopeTabs=!!(remainingPlan&&favoritePlan);
 const resolvedDefault=defaultScope??(remainingPlan?'remaining':'favorites');
 const [scope,setScope]=useState<'remaining'|'favorites'>(resolvedDefault);
 const [consumerExpanded,setConsumerExpanded]=useState(false),[consumerSearch,setConsumerSearch]=useState('');
 useEffect(()=>{setHistory([initialItem]);setConsumerExpanded(false);setConsumerSearch('');},[initialItem.id]);
 useEffect(()=>{setScope(defaultScope??(remainingPlan?'remaining':'favorites'));},[initialItem.id,defaultScope,remainingPlan]);
 const item=history.at(-1)!,recipe=catalog.recipes[item.id];
 useEffect(()=>{setConsumerExpanded(false);setConsumerSearch('');},[item.id,scope]);
 const selectedPlan=hasScopeTabs?(scope==='remaining'?remainingPlan:favoritePlan):(remainingPlan??favoritePlan);
 const currentRequirement=selectedPlan?(selectedPlan.inventoryKnown?selectedPlan.requirements[item.id]:undefined):(item.id===initialItem.id?requirement:undefined);
 const remainingCount=remainingPlan?.inventoryKnown?(remainingPlan.requirements[item.id]?.usedBy.length??0):0;
 const favoriteCount=favoritePlan?.inventoryKnown?(favoritePlan.requirements[item.id]?.usedBy.length??0):0;
 const L=(zh:string,eng:string)=>en?eng:zh,name=craftingNames(items,en),location=useDropLocation(en);
 const [data,setData]=useState<{relics:Relic[];sources:Sources}|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0),[search,setSearch]=useState(''),[limit,setLimit]=useState(40),[opened,setOpened]=useState<Relic|null>(null);
 const close=useRef<HTMLButtonElement>(null),scroll=useRef<HTMLDivElement>(null),end=useRef<HTMLDivElement>(null);
 useEffect(()=>{const previous=document.activeElement as HTMLElement|null;close.current?.focus();return()=>{if(previous?.isConnected)previous.focus();};},[]);
 useEffect(()=>{const controller=new AbortController();let active=true;setError('');setData(null);const timer=setTimeout(()=>controller.abort(),15000);
  loadResourceSourceData(async url=>{const r=await fetch(url,{signal:controller.signal});if(!r.ok)throw Error(`${url}: ${r.status}`);return r.json();}).then(result=>{if(active){setData(result);if(result.failed)setError('partial');}}).catch(e=>{if(active)setError(String(e));}).finally(()=>clearTimeout(timer));return()=>{active=false;clearTimeout(timer);controller.abort();};},[retry]);
 const inventoryKnown=isInventoryAvailable(snapshot);
 const prepared=useMemo(()=>pendingCrafts(catalog.recipes,new Set(catalog.blueprintIds),snapshot?.pendingRecipes,snapshot?.counts??{},catalog.pendingRecipeOutputs),[catalog,snapshot]);
 const owned=item.id==='credits'?snapshot?.credits??null:prepared.stock[item.id]??(inventoryKnown?0:null);
 const rows=useMemo(()=>{const ids=new Set([item.id]);for(const parent of Object.values(data?.sources.items??{}))for(const part of parent.parts)if(part.ownedItemId===item.id)ids.add(part.itemId);return resourceSources(catalog.dropSources?.[item.id]??item.detail?.drops??[],data?.relics??[],ids,snapshot);},[item,data,snapshot,catalog]);
 const filtered=rows.filter(row=>searchText(search,row.location,location(row.location),row.reward??'',row.rotation??''));
 useEffect(()=>{setLimit(40);scroll.current?.scrollTo(0,0);},[search,item.id]);
 useEffect(()=>{const target=end.current;if(!target||limit>=filtered.length)return;const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting))setLimit(n=>Math.min(n+40,filtered.length));},{root:scroll.current,rootMargin:'160px'});observer.observe(target);return()=>observer.disconnect();},[limit,filtered.length]);
 const rewardNames=useMemo(()=>new Map([...items.values()].map(i=>[i.name,en?i.name:i.zh||i.name])),[items,en]);
 const rewardText=(text:string)=>{const match=text.match(/^(\d[\d,.]*)\s*[xX×]\s*(.+)$/);return match?`${match[1]}× ${rewardNames.get(match[2])??match[2]}`:rewardNames.get(text)??text;};
 const description=(!en?catalog.descriptionsZh?.[item.id]:undefined)??item.detail?.description;
 const count=(n:number|null|undefined)=>n==null?'—':n.toLocaleString();
 const favoriteSet=useMemo(()=>new Set(favorites??snapshot?.favorites??[]),[favorites,snapshot?.favorites]);
 const progress=useMemo(()=>selectedPlan?resourceProgress(selectedPlan,item.id):currentRequirement?resourceProgress({inventoryKnown,incomplete:false,requirements:{[item.id]:currentRequirement}},item.id):null,[selectedPlan,currentRequirement,item.id,inventoryKnown]);
 const consumers=useMemo(()=>resourceConsumers(currentRequirement,items,name),[currentRequirement,items,name]);
 const nonMasteryCount=useMemo(()=>consumers.filter(c=>!c.hasMastery).length,[consumers]);
 const filteredConsumers=useMemo(()=>{const q=consumerSearch.trim();if(!q)return consumers;return consumers.filter(c=>searchText(q,name(c.id),items.get(c.id)?.name??'',items.get(c.id)?.zh??'',c.id));},[consumers,consumerSearch,items,name]);
 const visibleConsumers=consumerExpanded?filteredConsumers:filteredConsumers.slice(0,8);
 const isFavoritesScope=scope==='favorites'&&(hasScopeTabs||!remainingPlan);
 return createPortal(<div className="resourceSourceShade" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><section className="resourceSourceDialog" role="dialog" aria-modal="true" aria-label={L('来源与详情','Sources & details')} onKeyDown={e=>{if(opened)return;if(e.key==='Escape'){e.stopPropagation();onClose();}if(e.key==='Tab'){const nodes=[...e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input,a[href]')];const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}}}>
  <header><Artwork item={item}/><h3>{name(item.id)}</h3><button ref={close} aria-label={L('关闭来源详情','Close source details')} onClick={onClose}>×</button></header>
  <div className="resourceSourceBody" ref={scroll}>
   {history.length>1&&<button className="resourceBack" onClick={()=>setHistory(h=>h.slice(0,-1))}>{L('返回 ','Back to ')+name(history.at(-2)!.id)}</button>}
   {recipe&&<section className="resourceRecipe"><h4>{L('制造配方','Crafting recipe')}</h4><small>{L('每次产出','Output per craft')} ×{recipe.output}{recipe.credits?` · ${recipe.credits.toLocaleString()} ${L('现金','credits')}`:''}</small><div>{recipe.parts.map(part=><button key={part.itemId} onClick={()=>{const next=items.get(part.itemId);if(next){setHistory(h=>[...h,next]);setSearch('');}}} disabled={!items.has(part.itemId)}><Artwork item={items.get(part.itemId)}/><span>{name(part.itemId)}<small>{part.quantity.toLocaleString()} {part.reusable?L('可重复使用','Reusable'):''}</small></span><strong>{prepared.stock[part.itemId]??(inventoryKnown?0:'—')}</strong></button>)}</div></section>}

   <section className="resourceSourceDemandBox">
    {hasScopeTabs&&<div className="resourceSourceScopeBar" role="group" aria-label={L('需求口径','Demand scope')}><button type="button" aria-pressed={scope==='remaining'} onClick={()=>setScope('remaining')}>{L('全毕业','All unlocks')}{remainingCount>0&&<b>{remainingCount}</b>}</button><button type="button" aria-pressed={scope==='favorites'} onClick={()=>setScope('favorites')}>{L('收藏','Favorites')}{favoriteCount>0&&<b>{favoriteCount}</b>}</button></div>}
    <div className="resourceSourceCounts">
     <div><span>{L('库存','In inventory')}</span><strong>{count(owned)}</strong></div>
     {prepared.queueCaptured&&prepared.ambiguous.length===0&&(prepared.outputs[item.id]??0)>0&&<div><span>{L('铸造厂','In Foundry')}</span><strong>{count(prepared.outputs[item.id])}</strong></div>}
     {(currentRequirement||selectedPlan)&&<>
      <div><span>{hasScopeTabs?(scope==='remaining'?L('全毕业总需','All unlocks'):L('收藏总需','Favorites')):L('计划需求','Needed for plan')}</span><strong title={selectedPlan&&!selectedPlan.inventoryKnown?L('等待完整库存、队列与段位同步','Waiting for complete inventory, Foundry, and mastery sync'):undefined}>{currentRequirement?count(currentRequirement.needed):selectedPlan?.inventoryKnown?'0':'—'}</strong></div>
      <div>
       <span>{currentRequirement?.crafts?L('待制造批次','Batches to craft'):currentRequirement&&currentRequirement.missing>0?L('还差','Missing'):L('状态','Status')}</span>
       {currentRequirement?(currentRequirement.crafts>0?<strong>{inventoryKnown?count(currentRequirement.crafts):'—'}</strong>:currentRequirement.missing>0?<strong className="deficit">{inventoryKnown?count(currentRequirement.missing):'—'}</strong>:<strong className="ok">● {L('已齐备','Covered')}</strong>):selectedPlan?.inventoryKnown?<strong className="ok">● {L('无需保留','Not needed')}</strong>:<strong>—</strong>}
      </div>
     </>}
    </div>
    {progress&&progress.known&&progress.needed>0&&<div className="resourceSourceProgressRow" title={`${count(progress.covered)} / ${count(progress.needed)}${progress.missing>0?` · ${L('还差','Missing')} ${count(progress.missing)}`:''}`}><div className="resourceSourceProgressTrack"><i className={progress.missing===0?'ok':undefined} style={{width:`${progress.percent}%`}}/></div><span>{progress.percent}% · {count(progress.covered)} / {count(progress.needed)}</span></div>}
   </section>
   {description&&<p className="resourceSourceDescription">{description.replace(/<[^>]*>/g,'')}</p>}
   {currentRequirement&&currentRequirement.crafts>0&&(catalog.recipes[item.id]?.output??1)>1&&<p>{currentRequirement.crafts} × {catalog.recipes[item.id].output} = {currentRequirement.crafts*catalog.recipes[item.id].output} {L('产出','produced')}</p>}
   {onCraft&&<label className="resourceSourceCraft"><input type="checkbox" checked={!!craft} onChange={onCraft}/>{L('使用材料自行制造','Craft missing items from ingredients')}</label>}
   {!!consumers.length&&<section className="resourceSourceUsage">
    <div className="resourceUsageHeader">
     <h4>{isFavoritesScope?L('收藏消耗','Used by favorites'):L('全毕业消耗','Used by unlocks')} <span className="resourceUsageCount">{consumers.length}</span></h4>
     {nonMasteryCount>0&&<span className="resourceNoMrSummary" title={L('其中包含无精通经验的可制造散件','Includes craftable parts granting no Mastery XP')}>{L('无精通','No MR')} {nonMasteryCount}</span>}
    </div>
    {consumerExpanded&&consumers.length>16&&<input className="resourceConsumerFilter" aria-label={L('筛选消耗装备','Filter consuming items')} placeholder={L('筛选装备名称','Filter item name')} value={consumerSearch} onChange={e=>setConsumerSearch(e.target.value)}/>}
    <div className="resourceConsumerList">
     {visibleConsumers.map(consumer=>{
      const target=items.get(consumer.id),isFav=favoriteSet.has(consumer.id);
      const qtyText=consumer.sharedBatch?L('共享','Shared'):consumer.quantity!==null?(currentRequirement?.reusable?`×${consumer.quantity.toLocaleString()}`:consumer.quantity.toLocaleString()):'';
      const qtyTitle=consumer.sharedBatch?L('由同批次其余目标共同产出覆盖','Covered by batch output already planned for another goal'):undefined;
      return <div className="resourceConsumerRow" key={consumer.id}>
       <button type="button" className="resourceConsumerMain" onClick={()=>{if(onGoal){onGoal(consumer.id);onClose();}else if(target){setHistory(h=>[...h,target]);setSearch('');}}} disabled={!onGoal&&!target}>
        <Artwork item={target}/>
        <span className="resourceConsumerInfo">
         <strong>{name(consumer.id)}</strong>
         {!consumer.hasMastery&&<span className="resourceNoMrTag" title={L('无精通经验，不提供段位经验','Grants no Mastery XP')}>{L('无精通','No MR')}</span>}
        </span>
        {qtyText&&<b className={'resourceConsumerQty'+(consumer.sharedBatch?' shared':'')} title={qtyTitle}>{qtyText}</b>}
       </button>
       {onFavorite&&<button type="button" className={'resourceConsumerStar'+(isFav?' active':'')} disabled={busy||!canFavorite} title={isFav?L('移出收藏','Remove favorite'):L('加入收藏','Add favorite')} aria-label={L('收藏 ','Favorite ')+name(consumer.id)} aria-pressed={isFav} onClick={()=>onFavorite(consumer.id,!isFav)}><img src={isFav?'/reference/ui/star2.png':'/reference/ui/starEmpty.png'} alt=""/></button>}
      </div>;
     })}
    </div>
    {consumerExpanded&&!filteredConsumers.length&&<p className="resourceConsumerEmpty">{L('没有匹配的装备','No matching items')}</p>}
    {consumers.length>8&&!consumerSearch.trim()&&<button type="button" className="resourceConsumerToggle" onClick={()=>setConsumerExpanded(v=>!v)}>{consumerExpanded?L('收起','Show less'):L(`展开全部 ${consumers.length}`,`Show all ${consumers.length}`)}</button>}
    {currentRequirement?.reusable&&<p>{L('可重复使用的蓝图，仅保留一份','Reusable blueprint, one copy needed')}</p>}
   </section>}
   {(()=>{const mining=RAW_MINERAL_BY_ID.get(item.id);if(!mining)return null;const zone=MINING_ZONE_LABELS[mining.zone],vendor=MINING_VENDOR_LABELS[mining.vendor],veinColor=mining.vein==='gem'?'blue':zone.oreColor;return <section className="resourceMiningOrigin" aria-label={L('采矿来源','Mining origin')}><h4>{L('采矿点与精炼商人','Mining vein & vendor')}</h4><div className="resourceMiningBadges"><span>{en?zone.en:zone.zh}</span><span><i className={'veinDot '+veinColor}/>{mining.vein==='gem'?L('蓝色宝石脉','Blue gem vein'):veinColor==='yellow'?L('黄色矿脉','Yellow ore vein'):L('红色矿脉','Red ore vein')}</span>{mining.drillTier==='sunpoint'&&<span className="sunpoint">{L('需阳点等离子钻头','Sunpoint Plasma Drill')}</span>}<span>{L('商人','Vendor')}: {en?vendor.en:vendor.zh}</span>{mining.altSources.map(src=><span key={src}>{en?MINING_ALT_SOURCE_LABELS[src].en:MINING_ALT_SOURCE_LABELS[src].zh}</span>)}</div></section>;})()}
   <h4>{L('已知掉落来源','Known drop sources')}</h4>{catalog.ids.includes(item.id)&&<WikiLinks name={item.name} zh={item.zh}/>}
   {!data&&!error&&<p role="status">{L('正在读取来源…','Loading sources…')}</p>}{error&&<p role="alert">{L('部分来源未能读取，保留已知来源','Some sources could not be loaded; known sources are shown')} <button onClick={()=>setRetry(n=>n+1)}>{L('重试','Retry')}</button></p>}
   {data&&<><input className="resourceSourceSearch" aria-label={L('搜索来源','Search sources')} placeholder={L('搜索任务、敌人或遗物','Search missions, enemies, or relics')} value={search} onChange={e=>setSearch(e.target.value)}/><div className="resourceSourceRows">{filtered.slice(0,limit).map((row,index)=>row.relic?<button className={(row.owned??0)>0?'owned':''} key={row.relic.id} onClick={()=>setOpened(row.relic!)}><img src={relicImage(row.relic.era,'Intact')} alt=""/><span><strong>{row.location}</strong><small>{row.owned==null?L('库存未知','Ownership unavailable'):`${count(row.owned)} ${L('已拥有','owned')}`} · {row.relic.vaulted===null?L('入库状态未知','Vault status unknown'):row.relic.vaulted?L('已入库','Vaulted'):L('未入库','Available')}</small>{row.reward&&<small>{rewardText(row.reward)}</small>}</span><span>›</span></button>:<div key={`${row.location}-${index}`}><span className="resourceDropIdentity"><strong>{location(row.location)}</strong>{row.reward&&<small>{rewardText(row.reward)}</small>}{row.rotation&&!row.location.includes(`Rotation ${row.rotation}`)&&<small>{L('轮次','Rotation')} {row.rotation}</small>}</span><span>{row.chance==null?'—':`${+row.chance.toFixed(2)}%`}</span></div>)}{!filtered.length&&<p>{rows.length?L('没有匹配的来源','No sources match your search'):L('未列出掉落来源','No drop sources listed')}</p>}<div ref={end}/></div></>}
  </div>
 </section>{opened&&<RelicOverview relic={opened} variants={data?.relics??[]} counts={snapshot?.counts??{}} complete={inventoryKnown} snapshot={snapshot} en={en} onClose={()=>setOpened(null)}/>}</div>,document.querySelector('.resourceWorkspace')??document.body);
}

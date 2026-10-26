import RelicPlannerFilterPanel from './RelicPlannerFilterPanel';
import {relicFamilyCount,matchesRelicTenCopies,plannerRefinementRows,plannerOverlayKey,plannerOverlayEvent,type PlannerOverlayFilters} from './relicPlannerFilters';
import {useAccounts} from './AccountProvider';
import {accountStorageKey} from './accountScopeModel';
import {emit} from '@tauri-apps/api/event';
import './inventoryFamilyParity.css';
import {useAppPreferences} from './useAppPreferences';
import {voidTraceId} from './relicRecommendationsModel';
import {mergeRelicAliases,relicOwned} from './relicAliases';
import {groupedValue,compareRelicValues,refinementGain} from './relicSorting';
import {relicDucatValues} from './relicOverviewModel';
import {useTranslation} from 'react-i18next';
import {craftingNames} from './itemNames';
import {useRelicFavorites} from './useRelicFavorites';
import {isRelicFavorite,isRewardFavorite} from './relicFavorites';
import RelicOverview,{refinementLabel} from './RelicOverview';
import {rewardQuote,cachedRewardQuote} from './priceService';
import {loadRelicQuotes} from './relicQuotes';
import {relicImage} from './relicImage';
import {useEffect,useMemo,useRef,useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {native} from './api';
import {owned,matchesRelic,matchesRelicReward,groupRelics,relicResultWindow,relicOwnershipMatches,type Relic,type Inventory} from './relicModel';
import './relic.css';
import {allRewardState,isFormaReward,accepts,missingReward} from './relicPlannerState';
import type {Sources,MasteryItem} from './masteryModel';
import {rewardParentState} from './relicExtrasModel';
import RelicExtras from './RelicExtras';
import {expectedBest,lowestSell} from './relicExtrasModel';
const relicQA=import.meta.env.DEV&&new URLSearchParams(location.search).get('qa')==='workshop';
export default function RelicPlanner(){
 const {i18n}=useTranslation(),en=i18n.language.startsWith('en');
 const gridRef=useRef<HTMLDivElement|null>(null);
 const [preferences]=useAppPreferences();
 const [showAllResults,setShowAllResults]=useState(false);
 const [filtersOpen,setFiltersOpen]=useState(false);
 const filterTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const cancelFilterClose=()=>{if(filterTimer.current!==null){clearTimeout(filterTimer.current);filterTimer.current=null;}};
 const openFilters=()=>{cancelFilterClose();setFiltersOpen(true);};
 const closeFilters=()=>{cancelFilterClose();setFiltersOpen(false);};
 const deferFilterClose=()=>{cancelFilterClose();filterTimer.current=setTimeout(()=>{setFiltersOpen(false);filterTimer.current=null;},200);};
 useEffect(()=>()=>{if(filterTimer.current!==null)clearTimeout(filterTimer.current);},[]);
 const L=(zh:string,english:string)=>en?english:zh;
 const [overview,setOverview]=useState<Relic|null>(null);
 const [catalog,setCatalog]=useState<MasteryItem[]>([]),[sources,setSources]=useState<Sources|null>(null),[rewardFilter,setRewardFilter]=useState('all'),[parentFilter,setParentFilter]=useState('all');
 useEffect(()=>{void Promise.all([fetch('/catalog.json').then(r=>r.json()),fetch('/mastery-sources.json').then(r=>r.json())]).then(([c,s])=>{setCatalog(c.items);setSources(s);}).catch(()=>{});},[]);
 const lookup=useMemo(()=>{const parents=new Map<string,MasteryItem[]>(),images=new Map(catalog.map(i=>[i.id,i.image]));for(const item of catalog){if(item.maxRank<=0)continue;for(const id of new Set([item.id,...(sources?.items[item.id]?.parts??[]).flatMap(p=>[p.itemId,p.ownedItemId].filter((x):x is string=>!!x))])){const group=parents.get(id)??[];group.push(item);parents.set(id,group);}}return {parents,images};},[catalog,sources]);
 const rewardNames=useMemo(()=>{const byId=new Map(catalog.map(i=>[i.id,i])),name=craftingNames(byId);return (id:string)=>byId.has(id)?name(id):'';},[catalog]);
 const rewardImage=(id:string)=>lookup.images.get(id)||lookup.parents.get(id)?.[0]?.image;
 const rewardFavorite=(id:string)=>isRewardFavorite(snapshot?.favorites??[],id,lookup.parents.get(id)??[]);
 const parentState=(id:string)=>rewardParentState(lookup.parents.get(id)??[],snapshot);
 const parentOwned=(id:string)=>{const state=parentState(id);return state==='unknown'?null:state!=='missing';};
 const [quotes,setQuotes]=useState<Record<string,number|null>>({}),[pricing,setPricing]=useState('');
 const {favorites,toggleFavorite,favoriteError}=useRelicFavorites();
 const {scope}=useAccounts();
 const [favoriteMode,setFavoriteMode]=useState('all'),[tenCopies,setTenCopies]=useState('');
 const onlyFavorites=favoriteMode==='yes';
 const [items,setItems]=useState<Relic[]>([]),[snapshot,setSnapshot]=useState<Inventory|null>(null),[error,setError]=useState(''),[q,setQ]=useState(''),[era,setEra]=useState(''),[level,setLevel]=useState(''),[stock,setStock]=useState('owned'),[vault,setVault]=useState('all'),[minimum,setMinimum]=useState(1),[players,setPlayers]=useState(1),[selected,setSelected]=useState<string|null>(null),[wanted,setWanted]=useState<Set<string>>(new Set()),[sort,setSort]=useState('plat'),[descending,setDescending]=useState(true);
 useEffect(()=>{
  if(!native)return;
  const restored:Record<string,number|null>={};
  for(const reward of new Map(items.flatMap(r=>r.rewards).map(r=>[r.id,r])).values()){
   if(!reward.marketSlug)continue;
   const quote=cachedRewardQuote(reward.marketSlug);
   if(quote)restored[reward.id]=quote.price;
  }
  setQuotes(old=>({...restored,...old}));
 },[items]);
 useEffect(()=>{let alive=true;fetch('/relic-catalog.json').then(r=>{if(!r.ok)throw new Error('遗物目录不可用');return r.json();}).then(d=>{if(alive)setItems(mergeRelicAliases(d.items));}).catch(e=>setError(String(e)));const reload=()=>{if(native)void invoke<Inventory|null>('load_collection').then(s=>{if(alive)setSnapshot(s);}).catch(e=>setError(String(e)));};if(relicQA&&!native)void fetch('/qa/workshop-snapshot.json').then(r=>{if(!r.ok)throw Error('QA snapshot unavailable');return r.json();}).then(s=>{if(alive)setSnapshot(s);}).catch(e=>{if(alive)setError(String(e));});reload();const off=native?listen('collection-updated',reload):null;return()=>{alive=false;void off?.then(f=>f());};},[]);
 useEffect(()=>{if(gridRef.current)gridRef.current.scrollTop=0;setShowAllResults(false);},[q,era,level,stock,vault,minimum,sort,descending,rewardFilter,parentFilter,onlyFavorites,players,favoriteMode,tenCopies]);
 const relicById=useMemo(()=>new Map(items.map(r=>[r.id,r])),[items]);
 const count=(id:string)=>{const relic=relicById.get(id);return relic?relicOwned(snapshot,relic):owned(snapshot,id);};
 useEffect(()=>{if(!native||!items.length)return;let live=true;void invoke<{rows:{slug:string;unitPrice:number|null}[]}>('market_analytics').then(result=>{const prices=new Map(result.rows.map(row=>[row.slug,row.unitPrice]));if(live)setQuotes(old=>{const next={...old};for(const relic of items)for(const reward of relic.rewards){const price=reward.marketSlug?prices.get(reward.marketSlug):null;if(typeof price==='number'&&Number.isFinite(price)&&price>0)next[reward.id]=price;}return next;});}).catch(e=>{if(live)setPriceNotice(String(e));});return()=>{live=false;};},[items,scope]);
 const allVariants=useMemo(()=>new Map(groupRelics(items).map(g=>[g.base,g.variants])),[items]);
 const rows=items.filter(r=>(rewardFilter==='all'||accepts(allRewardState(r.rewards,id=>{const n=owned(snapshot,id);return n===null?null:n>0;}),rewardFilter))&&(parentFilter==='all'||accepts(allRewardState(r.rewards,parentOwned),parentFilter))&&((favoriteMode!=='yes'&&favoriteMode!=='no')||(isRelicFavorite(favorites,r,items)||r.rewards.some(reward=>rewardFavorite(reward.id)))===(favoriteMode==='yes'))&&matchesRelicTenCopies(relicFamilyCount((level?[r]:(allVariants.get(r.base)??[])),snapshot),tenCopies)&&(!era||r.era===era)&&(!level||r.refinement===level)&&matchesRelic(r,q,rewardNames)&&(vault==='all'||r.vaulted===(vault==='yes'))&&(stock!=='owned'||(count(r.id)??0)>0)&&relicOwnershipMatches((level?[r]:(allVariants.get(r.base)??[])).map(v=>count(v.id)),stock,minimum)).sort((a,b)=>sort==='stock'?(count(b.id)??-1)-(count(a.id)??-1)||a.name.localeCompare(b.name):a.name.localeCompare(b.name));
 const value=(r:Relic)=>expectedBest(r,sort==='ducats'||sort==='efficiency'?relicDucatValues(r):quotes,players);
 const score=(g:{base:string;variants:Relic[]})=>{if(sort==='stock'){const n=g.variants.map(r=>count(r.id));return n.some(x=>x===null)?null:n.reduce<number>((a,b)=>a+(b??0),0);}if(sort==='missing'){const n=g.variants[0].rewards.filter(r=>!isFormaReward(r.id)).map(r=>{const n=count(r.id),p=parentOwned(r.id);return missingReward(n,p);});return n.some(x=>x===null)?null:n.filter(x=>x===true).length;}if(sort==='efficiency'||sort==='platEfficiency'){return refinementGain(allVariants.get(g.base)??[],value);}return groupedValue(g.variants.map(value),descending);};
 const groups=groupRelics(rows).sort((a,b)=>{const byName=a.base.localeCompare(b.base,undefined,{numeric:true});if(favoriteMode==='order'){const fav=(g:typeof a)=>isRelicFavorite(favorites,g.variants[0],items)||g.variants[0].rewards.some(r=>rewardFavorite(r.id));const difference=Number(fav(b))-Number(fav(a));if(difference)return difference;}return sort==='name'?(descending?byName:-byName):compareRelicValues(score(a),score(b),descending)||byName;});
 const {items:visibleGroups,limited:resultsLimited}=relicResultWindow(groups,preferences.fullInventoryExperienceEnabled,showAllResults);

 const priceRun=useRef(0),[priceNotice,setPriceNotice]=useState('');
 useEffect(()=>{priceRun.current++;setPricing('');return()=>{priceRun.current++;};},[q,era,level,stock,vault,minimum,sort,descending,rewardFilter,parentFilter,onlyFavorites,snapshot,favoriteMode,tenCopies]);
 async function refreshVisible(){
  const run=++priceRun.current,current=()=>priceRun.current===run;
  const rewards=[...new Map(visibleGroups.flatMap(g=>g.variants[0].rewards).map(r=>[r.id,r])).values()];
  setPriceNotice('');setPricing(`0/${rewards.length}`);
  try{
   const result=await loadRelicQuotes(rewards,slug=>rewardQuote(slug),current,(prices,done)=>{setQuotes(old=>({...old,...prices}));setPricing(`${done}/${rewards.length}`);});
   if(!result)return;
   const notices=[];
   if(result.errors.length)notices.push(L(`${result.errors.length} 项报价查询失败`,`${result.errors.length} quote requests failed`));
   if(result.stale)notices.push(L('部分使用缓存价格','Some cached prices used'));
   setPriceNotice(notices.join(' · '));
  }catch(e){if(current())setPriceNotice(String(e));}finally{if(current())setPricing('');}
 }

 const filterCount=[rewardFilter!=='all',parentFilter!=='all',favoriteMode!=='all',!!level,stock!=='all',vault!=='all',!!tenCopies].filter(Boolean).length;const hasFilters=filterCount>0;
 function clearFilters(){setRewardFilter('all');setParentFilter('all');setFavoriteMode('all');setTenCopies('');setLevel('');setStock('all');setVault('all');setMinimum(1);}
 useEffect(()=>{if(!filtersOpen)return;const close=(event:PointerEvent)=>{if(!(event.target instanceof Element)||!event.target.closest('.relicFilterPopover'))setFiltersOpen(false);};document.addEventListener('pointerdown',close);return()=>document.removeEventListener('pointerdown',close);},[filtersOpen]);
 async function pushToOverlay(){try{const filters:PlannerOverlayFilters={era,refinement:level,vault,favorites:favoriteMode as PlannerOverlayFilters['favorites'],sort,descending,players,search:q.slice(0,500),rewardFilter,parentFilter,tenCopies};localStorage.setItem(accountStorageKey(plannerOverlayKey,scope),JSON.stringify(filters));if(native)await emit(plannerOverlayEvent,{scope,filters});else window.dispatchEvent(new CustomEvent(plannerOverlayEvent,{detail:{scope,filters}}));setPriceNotice(L('已应用到遗物推荐浮层，仅显示已拥有遗物','Filters applied to the relic recommendation overlay, owned relics only'));}catch(e){setPriceNotice(String(e));}}
 const active=items.find(r=>r.id===selected);const choose=(r:Relic)=>{setSelected(r.id);setWanted(new Set());setOverview(r);};
 return <><section className="panel relicPlanner">{(error||favoriteError)&&<p role="alert">{error||favoriteError}</p>}
{relicQA&&!native&&<p className="qaBanner">{L('QA 演示快照 · 非玩家真实库存','QA fixture · not player inventory')}</p>}
<header className="relicPageHeading"><h1>{L('遗物规划','Relic Planner')}</h1><div className="relicTraceBalance" title={L('可用于精炼的虚空光体','Void traces available for refining relics')}><img src="/reference/ui/trace.webp" alt={L('虚空光体','Void traces')}/><strong>{owned(snapshot,voidTraceId)??'—'}</strong></div></header><div className="relicToolbar">
 <div className="relicEraTabs" role="group" aria-label={L('纪元','Era')}>
 {['','Lith','Meso','Neo','Axi'].map(x=><button key={x} className={era===x?'active':''} aria-pressed={era===x} aria-label={x||L('全部纪元','All eras')} onClick={()=>setEra(x)} title={x||L('全部纪元','All eras')}>{x?<img src={relicImage(x)} alt=""/>:<img src="/reference/ui/infinity.png" alt=""/>}<span>{x||L('全部','All')}</span></button>)}
 </div>
 <div className="relicToolbarActions">
 <div className="relicSearch"><img src="/reference/ui/search.png" alt=""/><input aria-label={L('搜索遗物或奖励','Search relics or rewards')} placeholder={L('搜索遗物 / 奖励','Search relics / rewards')} value={q} onChange={e=>setQ(e.target.value)}/>{q&&<button aria-label={L('清空遗物搜索','Clear relic search')} onClick={()=>setQ('')}>×</button>}</div>
 <div className="relicFilterPopover" onKeyDown={e=>{if(e.key==='Escape'){closeFilters();e.currentTarget.querySelector<HTMLButtonElement>('.relicFilterToggle')?.focus();e.stopPropagation();}}}><button className={'relicFilterToggle '+(hasFilters?'active':'')} aria-label={L('遗物筛选','Relic filters')} aria-expanded={filtersOpen} aria-controls="relic-filter-panel" onClick={()=>setFiltersOpen(v=>!v)}><img src="/reference/ui/filter.png" alt=""/><span>{L('筛选','Filters')}</span>{filterCount>0&&<b>{filterCount}</b>}</button>{filtersOpen&&<RelicPlannerFilterPanel en={en} value={{vault,rewards:rewardFilter,parents:parentFilter,tenCopies,refinement:level,favorite:favoriteMode}} onChange={(key,value)=>{({vault:setVault,rewards:setRewardFilter,parents:setParentFilter,tenCopies:setTenCopies,refinement:setLevel,favorite:setFavoriteMode})[key](value);}}/>}</div>
 <button className="relicSortDirection" aria-label={L(descending?'降序，点击升序':'升序，点击降序',descending?'Descending, switch to ascending':'Ascending, switch to descending')} title={L(descending?'降序':'升序',descending?'Descending':'Ascending')} onClick={()=>setDescending(v=>!v)}><img src={'/reference/ui/'+(descending?'ordering.png':'orderingReverse.png')} alt=""/></button><select aria-label={L('排序','Sort')} value={sort} onChange={e=>setSort(e.target.value)}><option value="name">{L('名称排序','Name')}</option><option value="stock">{L('库存排序','Quantity')}</option><option value="plat">{L('白金收益','Platinum value')}</option><option value="ducats">{L('杜卡德收益','Ducat value')}</option><option value="platEfficiency">{L('最佳升级，白金','Best upgrade, platinum')}</option><option value="efficiency">{L('最佳升级，杜卡德','Best upgrade, ducats')}</option><option value="missing">{L('缺少且成品未拥有','Missing rewards and parents')}</option></select>

 </div>
</div>

<div className="relicPlannerOptions"><div className="relicOwnershipQuick" role="group" aria-label={L('遗物拥有状态','Relic ownership')}>{[['all',L('所有遗物','All relics')],['owned',L('已拥有','Owned')],['missing',L('缺少','Missing')]].map(([key,label])=><button key={key} aria-pressed={stock===key} className={stock===key?'selected':''} onClick={()=>{setStock(key);setMinimum(1);}}>{label}</button>)}</div> <label className="relicSquad">{L('开启此遗物的玩家数','Players opening this relic')}<select aria-label={L('规划小队人数','Planner squad size')} value={players} onChange={e=>setPlayers(Number(e.target.value))}>{[1,2,3,4].map(n=><option key={n} value={n}>{n} {L('名玩家',n===1?'player':'players')}</option>)}</select></label><span className="relicValueAssumption">{players===1?L('数值按开启一个遗物计算','Values for opening one relic'):L(`数值按 ${players} 个相同遗物计算`,`Values assume ${players} matching relics`)}</span><button className="relicApplyFilters" onClick={()=>void pushToOverlay()}><img src="/reference/ui/link.png" alt=""/>{L('应用筛选到浮层','Apply filters to overlay')}</button></div>
{hasFilters&&<div className="relicPlannerFilterChips">{[
 [vault!=='all',L(vault==='yes'?'已入库':'未入库',vault==='yes'?'Vaulted':'Unvaulted'),()=>setVault('all')],
 [rewardFilter!=='all',L(rewardFilter==='yes'?'奖励全部已拥有':'缺少奖励',rewardFilter==='yes'?'All rewards owned':'Missing rewards'),()=>setRewardFilter('all')],
 [parentFilter!=='all',L(parentFilter==='yes'?'成品已拥有或精通':'缺少成品',parentFilter==='yes'?'Items owned / mastered':'Missing items'),()=>setParentFilter('all')],
 [!!tenCopies,L(tenCopies==='yes'?'至少 10 个':'少于 10 个',tenCopies==='yes'?'At least 10 copies':'Fewer than 10 copies'),()=>setTenCopies('')],
 [!!level,refinementLabel(level,en),()=>setLevel('')],
 [favoriteMode!=='all',L(favoriteMode==='yes'?'仅收藏':favoriteMode==='no'?'排除收藏':'收藏优先',favoriteMode==='yes'?'Favorites only':favoriteMode==='no'?'Exclude favorites':'Favorites first'),()=>setFavoriteMode('all')]
 ].filter(row=>row[0]).map((row,index)=><button key={index} onClick={row[2] as ()=>void}>{row[1] as string}<span>×</span></button>)}<button className="clear" onClick={clearFilters}>{L('清空筛选','Clear filters')}</button></div>}
<div className="relicListStatus"><span>{visibleGroups.length} {L('种遗物','relics')}{resultsLimited?L(' 已显示',' shown'):''}</span><button disabled={!native||!!pricing} onClick={()=>void refreshVisible()}>{pricing||L('刷新行情 · PC','Refresh prices · PC')}</button>{priceNotice&&<small role="status">{priceNotice}</small>}</div>
<div className="relicPlannerBody"><div className="relicGrid" ref={gridRef}>
{visibleGroups.map(g=>{const first=g.variants[0],favorite=isRelicFavorite(favorites,first,items)||first.rewards.some(r=>rewardFavorite(r.id));return <article className={'relicPlannerCard '+(active?.base===g.base?'selected ':'')+(favorite?'favoriteRelic':'')} key={g.base} onClick={e=>{if(!(e.target as HTMLElement).closest('button'))choose(first);}}>
<div className="relicCardHeader"><div className="relicArtwork"><img src={relicImage(first.era,g.variants.some(r=>r.refinement==='Radiant'&&(count(r.id)??0)>0)?'Radiant':first.refinement)} alt=""/><span className="relicOwnedCount">×{g.variants.some(r=>count(r.id)===null)?'—':g.variants.reduce((n,r)=>n+(count(r.id)??0),0)}</span></div><div className="relicCardTitle"><h3>{g.base}</h3><div className="relicCardBadges"><span className={'relicVaultBadge '+(first.vaulted?'vaulted':'')}><img src={'/reference/ui/'+(first.vaulted===true?'vaulted.png':first.vaulted===false?'notVaulted.png':'question.png')} alt=""/>{first.vaulted===null?L('入库未知','Vault unknown'):first.vaulted?L('已入库','Vaulted'):L('未入库','Unvaulted')}</span><button className="relicFavoriteButton" aria-label={L('收藏 ','Favorite ')+g.base} aria-pressed={isRelicFavorite(favorites,first,items)} onClick={()=>toggleFavorite(first,items)}><img src={'/reference/ui/'+(favorite?'star2.png':'starEmpty.png')} alt=""/></button></div></div><button className="relicOpenButton" aria-label={L('打开遗物详情 ','Open relic details ')+g.base} onClick={()=>choose(first)}><svg viewBox="0 0 24 24"><path d="m9 5 7 7-7 7"/></svg></button></div>
<div className="relicRefinementTable"><div className="relicRefinementTableHeader"><span>{L('精炼','Refinement')}</span><span>{L('拥有','Owned')}</span><span><img src="/reference/ui/platinum.png" alt={L('白金','Platinum')}/>{L('均值','Avg.')}</span><span><img src="/reference/ui/ducats.png" alt={L('杜卡德','Ducats')}/>{L('均值','Avg.')}</span></div>{plannerRefinementRows(g.variants,snapshot,stock).map(r=><button key={r.id} className={'relicRefinementRow '+((count(r.id)??0)===0?'not-owned':'')} title={L('查看精炼奖励：','View refinement rewards: ')+refinementLabel(r.refinement,en)} onClick={()=>choose(r)}><span>{refinementLabel(r.refinement,en)}</span><span>×{count(r.id)??'—'}</span><strong>{expectedBest(r,quotes,players)?.toFixed(1)??'—'}</strong><strong>{expectedBest(r,relicDucatValues(r),players)?.toFixed(1)??'—'}</strong></button>)}</div>
<div className="relicCardRewards">{first.rewards.map(r=><button key={r.id} className={'relicRewardPreview '+((count(r.id)??0)>0?'owned ':'')+(matchesRelicReward(r,q,rewardNames(r.id))?'search-match':'')} title={(en?r.name:rewardNames(r.id)||r.name)} onClick={()=>choose(first)}><span className="relicRewardPicture">{rewardImage(r.id)&&<img src={rewardImage(r.id)} alt=""/>}</span><span className="relicRewardText"><span className="relicRewardName">{en?r.name:rewardNames(r.id)||r.name}</span><span className="relicRewardMeta">{(count(r.id)??0)>0&&<span>{L('已拥有','Owned')} ×{count(r.id)}</span>}{parentOwned(r.id)===true&&<img src="/reference/ui/tick.png" alt={parentState(r.id)==='mastered'?L('成品已精通','Parent mastered'):L('成品已拥有','Parent owned')}/>}{rewardFavorite(r.id)&&<img src="/reference/ui/star2.png" alt={L('已收藏','Favorite')}/>}</span></span></button>)}</div></article>;})}
{resultsLimited&&<div className="relicResultsMore"><span>{L('显示前 50 条匹配结果','Showing the first 50 matches')}</span><button onClick={()=>setShowAllResults(true)}>{L('显示全部匹配结果','Show all matches')}</button></div>}
{!rows.length&&<div className="relicPlannerEmpty"><h3>{L('没有匹配的遗物','No matching relics')}</h3><p>{L('尝试其他搜索条件，或清除筛选。','Try a different search or clear your filters.')}</p><button onClick={()=>{setQ('');setEra('');clearFilters();}}>{L('清除搜索与筛选','Clear search & filters')}</button></div>}
</div></div>
{active&&<details className="relicAdvancedAnalysis"><summary>{L('奖励概率分析','Reward probability analysis')}</summary><RelicExtras en={en} relic={active} players={players} snapshot={snapshot} wanted={wanted} toggleWanted={(id)=>setWanted(old=>{const n=new Set(old);n.has(id)?n.delete(id):n.add(id);return n;})}/></details>}
</section>{overview&&<RelicOverview initialPlayers={players} snapshot={snapshot} relic={overview} variants={items} counts={snapshot?.counts??{}} complete={snapshot?.complete??false} en={en} onClose={()=>setOverview(null)}/>}</>;
}

import {openInventoryTrade} from './inventoryTrade';
import {loadUpgradeBook} from './upgradeQuotes';
import {marketOrderQuotes} from './marketModel';
import {refinementTraceCost} from './relicPlannerFilters';
import './inventoryFamilyParity.css';
import {mergeRelicAliases,relicOwned} from './relicAliases';
import {loadRelicQuotes} from './relicQuotes';
import {useRelicFavorites} from './useRelicFavorites';
import {isRelicFavorite} from './relicFavorites';
import RelicLocations from './RelicLocations';
import {refinementOrder,relicRewardTiers,relicDucatValues} from './relicOverviewModel';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import Artwork from './Artwork';
import {craftingNames} from './itemNames';
import {relicImage} from './relicImage';
import {squadChance,type Relic} from './relicModel';
import {expectedBest,rewardParents,rewardParentState} from './relicExtrasModel';
import type {MasteryItem,Sources} from './masteryModel';
import type {Inventory} from './relicModel';
import {rewardQuote} from './priceService';
import {native} from './api';
import './relicOverview.css';
import {refinementLabel} from './relicLabels';
export {refinementLabel} from './relicLabels';
type CatalogItem=MasteryItem;
export default function RelicOverview({relic,variants,counts,complete,en,onClose,snapshot,initialPlayers=1}:{initialPlayers?:number;snapshot?:Inventory|null;relic:Relic;variants:Relic[];counts:Record<string,number>;complete:boolean;en:boolean;onClose:()=>void}){
 const {favorites,toggleFavorite,favoriteError}=useRelicFavorites();
 const [sources,setSources]=useState<Sources|null>(null);
 const L=(zh:string,english:string)=>en?english:zh;
 const [selected,setSelected]=useState(relic.id),[players,setPlayers]=useState(initialPlayers),[catalog,setCatalog]=useState<CatalogItem[]>([]),[prices,setPrices]=useState<Record<string,number|null>>({}),[error,setError]=useState(''),[loading,setLoading]=useState(false),[stale,setStale]=useState(false);
 const close=useRef<HTMLButtonElement|null>(null),generation=useRef(0),closeAction=useRef(onClose);
 closeAction.current=onClose;
 const levels=useMemo(()=>mergeRelicAliases(variants.filter(r=>r.base===relic.base)).sort((a,b)=>refinementOrder.indexOf(a.refinement)-refinementOrder.indexOf(b.refinement)),[variants,relic.base]),active=levels.find(r=>r.id===selected||r.aliases?.includes(selected))??relic;
 const items=useMemo(()=>new Map(catalog.map(i=>[i.id,i])),[catalog]),name=useMemo(()=>craftingNames(items,en),[items,en]);
 const parentState=(id:string)=>rewardParentState(rewardParents(id,catalog,sources),snapshot??{counts,complete});
 const count=(id:string)=>{const variant=levels.find(r=>r.id===id||r.aliases?.includes(id));return variant?relicOwned({counts,complete},variant):counts[id]??(complete?0:null);};
 useEffect(()=>{const previous=document.activeElement as HTMLElement|null;close.current?.focus();const key=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!(e.target instanceof HTMLInputElement&&e.target.value)){e.preventDefault();e.stopImmediatePropagation();closeAction.current();}};window.addEventListener('keydown',key,true);return()=>{window.removeEventListener('keydown',key,true);previous?.focus();};},[]);
 useEffect(()=>{let live=true;fetch('/mastery-sources.json').then(r=>{if(!r.ok)throw Error('关联目录加载失败');return r.json();}).then(d=>{if(live)setSources(d);}).catch(e=>{if(live)setError(String(e));});fetch('/catalog.json').then(r=>{if(!r.ok)throw Error('物品目录加载失败');return r.json();}).then(d=>{if(live)setCatalog(d.items);}).catch(e=>{if(live)setError(String(e));});return()=>{live=false;generation.current++;};},[]);
 const refresh=useCallback(async()=>{const current=++generation.current;setLoading(true);setError('');
  try{const result=await loadRelicQuotes(active.rewards,rewardQuote,()=>current===generation.current);
   if(result){setPrices(result.prices);setStale(result.stale);setError(result.errors.join(' · '));}
  }finally{if(current===generation.current)setLoading(false);}
 },[active.rewards]);
 useEffect(()=>{setPrices({});setStale(false);if(native)void refresh();return()=>{generation.current++;};},[refresh]);

 const [marketPrice,setMarketPrice]=useState<number|null>(null);
 useEffect(()=>{let live=true;setMarketPrice(null);if(native&&active.marketSlug)void loadUpgradeBook(active.marketSlug,'pc').then(book=>{const order=marketOrderQuotes(book.orders,{subtype:active.refinement.toLowerCase()}).find(row=>row.type==='sell');if(live)setMarketPrice(order?order.platinum/(order.perTrade??1):null);}).catch(()=>{});return()=>{live=false;};},[active.marketSlug,active.refinement]);
 const tiers=relicRewardTiers(active,levels),ducatValues=relicDucatValues(active);
 const host=document.querySelector('.resourceWorkspace')??document.querySelector('.collectionWorldMain')??document.body;
 const coins=(plat:number|null,ducats:number|null,average=true)=><><span><img src="/reference/ui/platinum.png" alt={L('白金','Platinum')}/>{plat?.toFixed(1)??'—'}</span><span><img src="/reference/ui/ducats.png" alt={L('杜卡德','Ducats')}/>{ducats?.toFixed(average?1:0)??'—'}</span></>;
 return createPortal(<div className="relicOverviewShade referenceRelicShade" data-body-host={host===document.body} onMouseDown={e=>{if(e.currentTarget===e.target)onClose();}}><section className="relicOverviewModal referenceRelicDialog" role="dialog" aria-modal="true" aria-label={L('遗物详情','Relic details')} onKeyDown={e=>{if(e.key!=='Tab')return;const nodes=[...e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),select,input,a[href]')];const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}}>
 <header className="referenceRelicHeader"><img className="referenceRelicArt" src={relicImage(active.era,active.refinement)} alt=""/><div><h2>{active.base}</h2><span className="relicVaultBadge"><img src={'/reference/ui/'+(active.vaulted===null?'question.png':active.vaulted?'vaulted.png':'notVaulted.png')} alt=""/>{active.vaulted===null?L('入库未知','Vault unknown'):active.vaulted?L('已入库','Vaulted'):L('未入库','Unvaulted')}</span></div><button className="relicOverviewFavorite" aria-label={L('收藏 ','Favorite ')+active.base} aria-pressed={isRelicFavorite(favorites,active,variants)} onClick={()=>toggleFavorite(active,variants)}><img src={'/reference/ui/'+(isRelicFavorite(favorites,active,variants)?'star2.png':'starEmpty.png')} alt=""/></button><button ref={close} aria-label={L('关闭遗物详情','Close relic details')} className="referenceRelicClose" onClick={onClose}>×</button></header>
 <div className="referenceRelicBody"><section className="relicSimulation"><div className="relicSimulationHeading"><div><strong>{L('比较精炼等级','Compare refinements')}</strong><span>{L('从完整等级开始的光体消耗，每局平均白金与杜卡德','Trace cost from Intact, Average platinum & ducats per run')}</span></div><label>{L('开启此遗物的玩家数','Players opening this relic')} <select aria-label={L('详情小队人数','Details squad size')} value={players} onChange={e=>setPlayers(Number(e.target.value))}>{[1,2,3,4].map(n=><option value={n} key={n}>{n} {L('名玩家',n===1?'player':'players')}</option>)}</select></label></div>
 <div className="relicRefinementChoices">{levels.map(r=><button className={'relicRefinementChoice'+(r.id===active.id?' selected':'')} key={r.id} aria-pressed={r.id===active.id} onClick={()=>setSelected(r.id)}><span className="relicRefinementHeading"><strong>{refinementLabel(r.refinement,en)}</strong><small><img src="/reference/ui/trace.webp" alt=""/>{refinementTraceCost(r.refinement)} {L('光体','traces')}</small></span><span className="relicRefinementMetrics">{coins(expectedBest(r,prices,players),expectedBest(r,relicDucatValues(r),players))}</span></button>)}</div>{error&&<p className="relicPriceStatus">{L('部分价格不可用','Some prices are unavailable')} <button disabled={loading||!native} onClick={()=>void refresh()}>{L('重试','Retry')}</button></p>}</section>
 <div className="relicDetailColumns"><section className="relicRewardSection"><div className="relicSectionHeading"><h3>{L('可能的奖励','Possible rewards')}</h3><span>{players===1?L('获得此奖励的概率','Chance to get this reward'):L('至少一名玩家获得此奖励的概率','Chance at least one player gets this reward')}</span></div><div className="relicRewardTableHeader"><span>{L('奖励','Reward')}</span><span>{L('单件价值','Value per item')}</span><span>{L('概率','Chance')}</span></div>
 {[-1,0,1,2].map(tier=>{const group=tiers.filter(r=>r.tier===tier);return group.length>0&&<div className={'relicRewardGroup '+(['common','uncommon','rare'][tier]??'unknown')} key={tier}><div className="relicRewardGroupLabel">{[L('常见','Common'),L('罕见','Uncommon'),L('稀有','Rare')][tier]??L('奖励','Rewards')}</div>{group.map(r=>{const chance=squadChance(r.chance,players),n=count(r.id);return <div className={'relicRewardRow'+((n??0)>0?' owned':'')} key={r.id}><div className="relicDetailRewardIdentity"><Artwork item={items.get(r.id)}/><span><strong>{items.has(r.id)?name(r.id):r.name}</strong>{((n??0)>0||parentState(r.id)==='owned'||parentState(r.id)==='mastered')&&<small>{(n??0)>0?`${L('已拥有','Owned')} ×${n}`:''}{['owned','mastered'].includes(parentState(r.id))&&<img src="/reference/ui/tick.png" alt={L('成品已拥有或精通','Resulting item owned or mastered')}/>}</small>}</span></div><div className="relicRewardPrices">{coins(prices[r.id]??null,ducatValues[r.id]??null,false)}</div><div className="relicRewardChance"><strong>{+chance.toFixed(2)}%</strong><span><i style={{width:chance+'%'}}/></span></div></div>;})}</div>;})}
 {players>1&&<p className="relicRewardExplanation">{L(`全部 ${players} 名玩家使用此遗物的${refinementLabel(active.refinement)}等级。可以选择任意小队奖励，一局可能出现多种奖励，因此概率之和可能超过 100%。`,`All ${players} players use this relic at ${active.refinement} refinement. Any squad reward can be chosen. Several rewards can appear per run, so chances may total over 100%.`)}</p>}</section>
 <aside className="relicInfoPanel"><section className="relicMarketPanel"><h3>warframe.market</h3><button className="inventoryTradeButton" disabled={!active.marketSlug} onClick={()=>active.marketSlug&&openInventoryTrade({id:active.id,slug:active.marketSlug,name:active.base+' '+refinementLabel(active.refinement,en),englishName:active.name,subtype:active.refinement.toLowerCase()})}>{L('查看卖单','View sell orders')} <strong>{marketPrice??'—'} <img src="/reference/ui/platinum.png" alt=""/></strong></button></section><RelicLocations relic={active} en={en}/></aside></div>{favoriteError&&<p role="alert">{favoriteError}</p>}{stale&&<small>{L('部分使用缓存行情','Some cached prices used')}</small>}</div>
 </section></div>,host);
}

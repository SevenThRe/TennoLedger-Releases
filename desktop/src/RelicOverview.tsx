import {mergeRelicAliases,relicOwned} from './relicAliases';
import {loadRelicQuotes} from './relicQuotes';
import RelicTrade from './RelicTrade';
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
 const [tradeSide,setTradeSide]=useState<'buy'|'sell'|null>(null);
 const L=(zh:string,english:string)=>en?english:zh;
 const [selected,setSelected]=useState(relic.id),[players,setPlayers]=useState(initialPlayers),[catalog,setCatalog]=useState<CatalogItem[]>([]),[prices,setPrices]=useState<Record<string,number|null>>({}),[error,setError]=useState(''),[loading,setLoading]=useState(false),[stale,setStale]=useState(false);
 const close=useRef<HTMLButtonElement|null>(null),generation=useRef(0),closeAction=useRef(onClose);
 closeAction.current=onClose;
 const levels=useMemo(()=>mergeRelicAliases(variants.filter(r=>r.base===relic.base)).sort((a,b)=>refinementOrder.indexOf(a.refinement)-refinementOrder.indexOf(b.refinement)),[variants,relic.base]),active=levels.find(r=>r.id===selected||r.aliases?.includes(selected))??relic;
 const items=useMemo(()=>new Map(catalog.map(i=>[i.id,i])),[catalog]),name=useMemo(()=>craftingNames(items,en),[items,en]);
 const parentState=(id:string)=>rewardParentState(rewardParents(id,catalog,sources),snapshot??{counts,complete});
 const count=(id:string)=>{const variant=levels.find(r=>r.id===id||r.aliases?.includes(id));return variant?relicOwned({counts,complete},variant):counts[id]??(complete?0:null);};
 useEffect(()=>{const previous=document.activeElement as HTMLElement|null;close.current?.focus();const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();closeAction.current();}};window.addEventListener('keydown',key,true);return()=>{window.removeEventListener('keydown',key,true);previous?.focus();};},[]);
 useEffect(()=>{let live=true;fetch('/mastery-sources.json').then(r=>{if(!r.ok)throw Error('关联目录加载失败');return r.json();}).then(d=>{if(live)setSources(d);}).catch(e=>{if(live)setError(String(e));});fetch('/catalog.json').then(r=>{if(!r.ok)throw Error('物品目录加载失败');return r.json();}).then(d=>{if(live)setCatalog(d.items);}).catch(e=>{if(live)setError(String(e));});return()=>{live=false;generation.current++;};},[]);
 const refresh=useCallback(async()=>{const current=++generation.current;setLoading(true);setError('');
  try{const result=await loadRelicQuotes(active.rewards,rewardQuote,()=>current===generation.current);
   if(result){setPrices(result.prices);setStale(result.stale);setError(result.errors.join(' · '));}
  }finally{if(current===generation.current)setLoading(false);}
 },[active.rewards]);
 useEffect(()=>{setPrices({});setStale(false);if(native)void refresh();return()=>{generation.current++;};},[refresh]);

 const ducats=expectedBest(active,relicDucatValues(active),players),plat=expectedBest(active,prices,players);
 const tiers=relicRewardTiers(active,levels),ducatValues=relicDucatValues(active);
 return createPortal(<div className="modalShade relicOverviewShade" onMouseDown={e=>{if(e.currentTarget===e.target)onClose();}}><section className="relicOverviewModal" role="dialog" aria-modal="true" aria-label={L('遗物详情','Relic overview')}><header><h2>{L('遗物详情','Relic overview')}</h2><button ref={close} aria-label={L('关闭遗物详情','Close relic overview')} onClick={onClose}>×</button></header><div className="relicOverviewBody"><div className="relicOverviewTitle"><img src={relicImage(active.era,active.refinement)} alt=""/><h3>{active.base}</h3><button className="relicOverviewFavorite" aria-label={L('收藏 ','Favorite ')+active.base} aria-pressed={isRelicFavorite(favorites,active,variants)} onClick={()=>toggleFavorite(active,variants)}><img src={'/reference/ui/'+(isRelicFavorite(favorites,active,variants)?'star2.png':'starEmpty.png')} alt=""/></button><span>{active.vaulted===null?L('入库状态未知','Vault status unknown'):active.vaulted?L('已入库','Vaulted'):L('未入库','Unvaulted')}</span></div><div className="relicOverviewColumns"><div className="relicOverviewMain"><div className="relicOverviewControls"><label>{L('小队人数','Squad size')}<select value={players} onChange={e=>setPlayers(Number(e.target.value))}>{[1,2,3,4].map(n=><option key={n}>{n}</option>)}</select></label><label>{L('精炼等级','Refinement')}<select value={active.id} onChange={e=>setSelected(e.target.value)}>{levels.map(r=><option key={r.id} value={r.id}>{refinementLabel(r.refinement,en)}</option>)}</select></label><span>{L('拥有','Owned')} ×{count(active.id)??'—'}</span></div><div className="relicOverviewValues"><span>{L('择高期望','Expected best reward')}</span><b>{plat?.toFixed(1)??'—'} <img src="/reference/ui/platinum.png" alt={L('白金','Platinum')}/></b><b>{ducats?.toFixed(1)??'—'} <img src="/reference/ui/ducats.png" alt={L('杜卡德金币','Ducats')}/></b><button disabled={!native||loading} onClick={()=>void refresh()}>{loading?L('查询中…','Loading…'):L('刷新行情 · PC','Refresh prices · PC')}</button>{stale&&<small>{L('缓存行情','Cached prices')}</small>}</div><div className="relicOverviewRewards">{tiers.map(r=><div key={r.id} data-tier={r.tier} className={(count(r.id)??0)>0?'owned':''}><div className="relicRewardImage"><Artwork item={items.get(r.id)}/>{['owned','mastered'].includes(parentState(r.id))&&<img className="relicParentTick" src="/reference/ui/tick.png" alt={parentState(r.id)==='mastered'?L('成品已精通','Parent mastered'):L('成品已拥有','Parent owned')} title={parentState(r.id)==='mastered'?L('成品已精通','Parent mastered'):L('成品已拥有','Parent owned')}/>}</div><span>{items.has(r.id)&&items.get(r.id)!.name!==r.id.split('/').at(-1)?name(r.id):r.name}<small>{L('拥有','Owned')} ×{count(r.id)??'—'}</small></span><b>{prices[r.id]??'—'} <img src="/reference/ui/platinum.png" alt={L('白金','Platinum')}/></b><b>{ducatValues[r.id]??'—'} <img src="/reference/ui/ducats.png" alt={L('杜卡德金币','Ducats')}/></b><strong title={L('至少出现 1 件此奖励的概率','Probability of getting at least 1 copy of this reward')}>{+squadChance(r.chance,players).toFixed(2)}%</strong></div>)}</div></div><div className="relicAcquisition"><div className="relicTradeActions"><button disabled={!active.marketSlug} onClick={()=>setTradeSide('sell')}>{L('出售','Sell')}</button><button disabled={!active.marketSlug} onClick={()=>setTradeSide('buy')}>{L('收购','Buy')}</button></div>{tradeSide?<RelicTrade key={active.id+tradeSide} relic={active} owned={count(active.id)} initialSide={tradeSide} onClose={()=>setTradeSide(null)}/>:<RelicLocations relic={active} en={en}/>}</div></div>{(error||favoriteError)&&<p role="alert">{error||favoriteError}</p>}</div></section></div>,document.body);
}

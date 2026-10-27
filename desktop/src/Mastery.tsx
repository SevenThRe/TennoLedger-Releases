import {loadMarketPrices,useMarketPrices} from './useMarketPrices';
import {parseMasterySources} from './masterySources';
import {masteryRows} from './masteryRows';
import Artwork from './Artwork';
import {useEffect,useMemo,useRef,useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {native} from './api';
import {masteryQuoteIds,batchMasteryQuotes} from './masteryQuotes';
import type {MarketRankingRow} from './marketRankingModel';
import {masteryLockState,progress,summary,candidates,recommend,previewWidths,masteryDisplayPartCount,masteryPercent,type MasteryItem,type MasterySnapshot,type Sources,type Tally} from './masteryModel';
import {masteryQA} from './PlayerCard';
import './mastery.css';
import MasteryBadge from './MasteryBadge';
import {useMasteryPreferences} from './masteryPreferences';
import {founderIds} from './masteryModel';
const emptySources:Sources={items:{},marketSlugs:{}};
export default function Mastery({items,snapshot,en,onOpen,onFavorite,busy}:{items:MasteryItem[];snapshot:MasterySnapshot|null;en:boolean;onOpen:(id:string)=>void;onFavorite:(id:string)=>void;busy:boolean}){
 const L=(zh:string,english:string)=>en?english:zh,[mode,setMode]=useState('normal'),[hover,setHover]=useState<string|null>(null),[sources,setSources]=useState<Sources>(emptySources),[quotes,setQuotes]=useState<Record<string,number>>({}),[loading,setLoading]=useState(false),[error,setError]=useState(''),[quotedAt,setQuotedAt]=useState('');
 const [sourceAttempt,setSourceAttempt]=useState(0),[sourceLoading,setSourceLoading]=useState(true),[sourceError,setSourceError]=useState('');
 useEffect(()=>{let live=true;setSourceLoading(true);setSourceError('');
  void fetch('/mastery-sources.json').then(r=>{if(!r.ok)throw Error(`HTTP ${r.status}`);return r.json();}).then(parseMasterySources).then(value=>{if(live)setSources(value);}).catch(e=>{if(live)setSourceError(String(e));}).finally(()=>{if(live)setSourceLoading(false);});
  return()=>{live=false;};
 },[sourceAttempt]);
 useEffect(()=>{let live=true;if(masteryQA&&!native)void fetch('/qa/mastery-quotes.json').then(r=>r.json()).then(value=>{if(live)setQuotes(value);}).catch(()=>{});return()=>{live=false;};},[]);

 const sharedPrices=useMarketPrices();
 const [preferences]=useMasteryPreferences(),forma=preferences.includeForma;
 const s=summary(items,snapshot,preferences.hideFounders),p=progress(snapshot),all=useMemo(()=>candidates(items,snapshot,sources,quotes),[items,snapshot,sources,quotes]),list=recommend(all.filter(r=>!preferences.hideFounders||!founderIds.has(r.item.id)||r.owned),mode,forma);
 const favXP=list.filter(r=>snapshot?.favorites.includes(r.item.id)).reduce((n,r)=>n+r.xp,0),hoverXP=list.find(r=>r.item.id===hover&&!snapshot?.favorites.includes(r.item.id))?.xp??(mode==='normal'&&hover?.startsWith('intrinsic:')?1500:0);
 const widths=p?previewWidths(p.percent,p.needed,favXP,hoverXP):{fav:0,hover:0};
 const aggregate=(rows:(Tally|null|undefined)[])=>rows.every(r=>r!=null)&&rows.length?{current:rows.reduce((n,r)=>n+r!.current,0),max:rows.reduce((n,r)=>n+r!.max,0)}:null;
 const percent=(r:Tally|null|undefined,total=false)=>{const value=masteryPercent(r,total);return value===null?'—':value+'%';};
 const quoteRun=useRef(0),[quoteProgress,setQuoteProgress]=useState('');
 async function prices(){
  const run=++quoteRun.current,current=()=>quoteRun.current===run;
  setLoading(true);setError('');setQuotedAt('');
  try{
   if(!native)throw Error(L('请在桌面版刷新市场价格','Refresh prices in the desktop app'));
   const ids=masteryQuoteIds(candidates(items,snapshot,sources,{}).filter(r=>!preferences.hideFounders||!founderIds.has(r.item.id)));
   if(!ids.length){if(current())setQuotes({});return;}
   const result=await loadMarketPrices();
   if(!current())return;
   const next=batchMasteryQuotes(ids,sources.marketSlugs,result.rows);
   setQuotes(next);setQuoteProgress(`${Object.keys(next).length} / ${ids.length}`);
   setQuotedAt(new Date(result.fetchedAt).toLocaleTimeString());
  }catch(e){if(current())setError(String(e));}finally{if(current())setLoading(false);}
 }
 useEffect(()=>{
  quoteRun.current++;setLoading(false);setQuoteProgress('');setError('');
  if(native&&!sourceLoading&&!sourceError&&snapshot)void prices();
  return()=>{quoteRun.current++;};
 },[items,snapshot,sources,sourceLoading,sourceError,preferences.hideFounders,mode,sharedPrices.snapshot]);

 const a=snapshot?.masteryAccount,rows=masteryRows(list,mode,snapshot?.masteryAccount);

 const cards=[{title:L('游戏内容','Game content'),icon:'build.png',total:s.content.every(r=>r.known)?aggregate(s.content):null,rows:s.content.map((r,i)=>({label:[L('战甲 / Archwing','Warframes / Archwings'),L('武器','Weapons'),L('同伴','Companions')][i],tally:r.known?r:null}))},{title:L('星图','Star chart'),icon:'galaxy.png',total:aggregate([a?.starNormal,a?.junctions,a?.starSteel,a?.steelJunctions]),rows:[{label:L('普通','Normal'),tally:a?.starNormal},{label:L('枢纽','Junctions'),tally:a?.junctions},{label:L('钢铁之路','Steel path'),tally:a?.starSteel},{label:L('钢铁枢纽','Steel p. junctions'),tally:a?.steelJunctions}]},{title:L('内源之力','Intrinsics'),icon:'IntrinsicPoint.webp',total:aggregate([a?.railjack,a?.duviri]),rows:[{label:'Railjack',tally:a?.railjack},{label:'Duviri',tally:a?.duviri}]}];
 return <div className="masteryDashboard">{masteryQA&&<div className="masteryQA">QA · {L('演示数据，非玩家账户','Fixture data, not a player account')}</div>}{snapshot&&<><div className="masteryTop"><div className="masteryRankGroup"><span className="masteryRank">{snapshot?.masteryRank??'—'}</span><MasteryBadge className="masteryBadge" rank={snapshot?.masteryRank}/></div><div className="masteryProgress"><div className="masteryProgressLabels"><span>{L('距离下一段位','Progress to next rank')}</span><strong>{p?p.percent+'%':'—'}</strong></div><div className="masteryTrack" role="progressbar" aria-label={L('段位经验','Mastery progress')} aria-valuenow={p?.percent} aria-valuemin={0} aria-valuemax={100}><div className="masteryActual" style={{width:(p?.percent??0)+'%'}}/><div className="masteryFav" style={{width:(widths.fav>0?(p?.percent??0)+widths.fav:0)+'%'}} title={`+${favXP} XP`}/><div className="masteryHover" style={{width:(widths.hover>0?(p?.percent??0)+widths.fav+widths.hover:0)+'%'}} title={`+${hoverXP} XP`}/></div><div className="masteryProgressFooter"><span className="masteryXpTotal">{p?`${p.current} / ${p.needed} XP`:'— / — XP'}</span><div className="masteryProgressLegend"><span className="earned">{L('已获得经验','Earned XP')}</span><span className="favorites">{L('收藏物品可获经验','Potential XP from favorites')}</span><span className={'hovered'+(hoverXP>0?' active':'')} title={L('悬停物品预览可获得的精通经验','Hover an item to preview the mastery XP you could gain from it.')}>{L('悬停物品可获经验','Potential XP from hovered item')}</span></div></div></div></div>
 <div className="masterySummaries">{cards.map(c=><section key={c.title} className="masterySummary"><h2><img src={'/reference/ui/'+c.icon} alt=""/>{c.title}<em>{percent(c.total,true)}</em></h2><div className="masterySummaryRows">{c.rows.map(r=><div key={r.label}><span>{r.label}:</span><span>{percent(r.tally)}</span><span>{r.tally?`${r.tally.current}/${r.tally.max}`:'— / —'}</span></div>)}</div></section>)}</div>
 </>}<section className="masteryRecommendations" aria-busy={loading||sourceLoading} title={quotedAt?L('报价获取于 ','Prices fetched at ')+quotedAt+(quoteProgress?' · '+quoteProgress:''):undefined}><div className="masteryRecTop"><h2>{L('获取精通的最佳方式','Best ways to gain mastery')}</h2><div className="masteryModes">{[['normal','pencil.png',L('容易','Easy')],['relics','prime.png',L('遗物','From relics')],['platinum','platinum.png',L('白金','With platinum')]].map(([key,icon,label])=><button key={key} className={mode===key?'selected':''} aria-pressed={mode===key} onClick={()=>{setMode(key);setHover(null);}}><img src={'/reference/ui/'+icon} alt=""/>{label}</button>)}</div></div>
 {sourceLoading&&<p role="status">{L('正在读取推荐数据…','Loading recommendation data…')}</p>}
 {sourceError&&<p role="alert" className="notice" title={sourceError}>{L('部件数据读取失败，推荐可能不完整。','Component data could not be loaded; recommendations may be incomplete.')} <button onClick={()=>setSourceAttempt(n=>n+1)}>{L('重试','Retry')}</button></p>}
 {error&&<p role="alert" className="notice">{error}</p>}
 <div className="masteryRecBody">{rows.map(row=>{if(row.kind==='intrinsic')return <article key={row.id} tabIndex={0} onMouseEnter={()=>setHover(row.id)} onMouseLeave={()=>setHover(null)} onFocus={()=>setHover(row.id)} onBlur={()=>setHover(null)} className="masteryRecCard intrinsicRec"><span className="masteryRecArt"><img src="/reference/ui/IntrinsicPoint.webp" alt=""/><strong>+{row.xp} XP</strong></span><div className="masteryRecInfo"><div><span className="masteryRecName" title={row.name+' Intrinsic'}>{L(row.name+' 内源之力',row.name+' Intrinsic')}</span></div></div><div className="masteryRecParts"/></article>;const r=row.value,lock=masteryLockState(r,mode);return <article tabIndex={0} className="masteryRecCard" key={r.item.id} onClick={()=>onOpen(r.item.id)} onKeyDown={e=>{if(e.target===e.currentTarget&&(e.key==='Enter'||e.key===' ')){e.preventDefault();onOpen(r.item.id);}}} onMouseEnter={()=>setHover(r.item.id)} onMouseLeave={()=>setHover(null)} onFocus={()=>setHover(r.item.id)} onBlur={()=>setHover(null)}><button className="masteryRecArt" ><Artwork item={r.item}/><strong>+{r.xp} XP</strong></button><div className="masteryRecInfo"><div><button className="masteryRecStar" disabled={busy||!native&&!masteryQA} aria-label={L('收藏 ','Favorite ')+r.item.name} aria-pressed={!!snapshot?.favorites.includes(r.item.id)} onClick={e=>{e.stopPropagation();onFavorite(r.item.id);}}><img src={'/reference/ui/'+(snapshot?.favorites.includes(r.item.id)?'star2.png':'starEmpty.png')} alt=""/></button><button className="masteryRecName" >{en?r.item.name:r.item.zh.includes('�')?r.item.name:r.item.zh||r.item.name}</button></div><span>{r.owned?`${L('等级','Level')} ${r.rank}/${r.item.maxRank}`:<><span className="masteryMetric">{r.probability==null?'—':Math.round(r.probability*10000)/100+'%'}<img src="/reference/ui/axi-intact.png" alt={L('遗物获取概率','Relic acquisition probability')}/></span><span className="masteryMetric">{r.cost??'—'}<img className="masteryMetricPlatinum" src="/reference/ui/platinum.png" alt={L('所需白金','Platinum needed')}/></span></>}</span>{lock&&<small className={"masteryRankLock "+lock} title={lock==='blocked'?L('尚未满足该装备的段位要求','This item’s Mastery Rank requirement has not been met'):L('段位、拥有状态或制造队列尚未核实','Mastery Rank, ownership or Foundry queue is unverified')}>{lock==='blocked'?L('需要段位 ','Requires MR ')+r.item.masteryReq:L('段位条件待核实','MR requirement unverified')}</small>}</div><div className="masteryRecParts">{r.owned?<span className="masteryOwned"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="m7 12 3 3 7-7"/></svg>{L('已拥有','Owned')}</span>:(r.item.displayParts??r.item.recipe?.parts??[]).map((part,index,parts)=>{const previous=parts.slice(0,index).filter(p=>p.itemId===part.itemId).reduce((n,p)=>n+p.quantity,0),item=items.find(i=>i.id===part.itemId),count=masteryDisplayPartCount(snapshot,r.item.id,part,sources,previous);return <button key={part.itemId+':'+index} title={item?(en?item.name:item.zh||item.name):part.itemId}  className={count!==null&&count>=part.quantity?'satisfied':''}><Artwork item={item}/></button>;})}</div></article>;})}{!rows.length&&!sourceLoading&&!sourceError&&<div className="masteryEmpty">{!snapshot?L('等待玩家数据','Waiting for player data'):mode==='platinum'&&!Object.keys(quotes).length?loading?L('正在读取缺件报价…','Loading part quotes…'):L('暂无有效完整缺件报价','No complete part quotes available'):L('没有符合条件的推荐，试试其他筛选。','No ideas were found. Try using other filters.')}</div>}</div>
 {mode==='platinum'&&list.length>0&&<div className="masteryCost">{L('合计','Total')}: {list.reduce((n,r)=>n+(r.cost??0),0)} <img src="/reference/ui/platinum.png" alt=""/></div>}</section></div>;
}

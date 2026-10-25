import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import Artwork from './Artwork';
import WikiLinks from './WikiLinks';
import type {DetailItem} from './ItemDetails';
import type {PlannerMod,ModPlannerSnapshot} from './modPlannerModel';
import {modRankOwnership} from './modUpgradePlan';
import {itemName} from './itemNames';
import {searchText} from './searchText';
import './modPlanner.css';
export default function ModDetails({mod,items,snapshot,en,onClose,onFavorite,busy=false}:{mod:PlannerMod;items:Map<string,DetailItem>;snapshot:ModPlannerSnapshot|null;en:boolean;onClose:()=>void;onFavorite?:(id:string,enabled:boolean)=>void;busy?:boolean}){
 const L=(zh:string,english:string)=>en?english:zh;
 const [query,setQuery]=useState('');
 const overlay=useRef<HTMLDivElement>(null),close=useRef<HTMLButtonElement>(null),dismiss=useRef(onClose);dismiss.current=onClose;
 useEffect(()=>{setQuery('');},[mod.id]);
 useEffect(()=>{
  const before=document.activeElement as HTMLElement|null;
  const background=Array.from(document.body.children).filter((e):e is HTMLElement=>e instanceof HTMLElement&&e!==overlay.current).map(e=>({element:e,inert:e.inert}));
  background.forEach(({element})=>{element.inert=true;});close.current?.focus();
  const key=(e:KeyboardEvent)=>{
   if(e.key==='Escape'){e.preventDefault();e.stopPropagation();dismiss.current();}
   if(e.key==='Tab'){
    const controls=Array.from(overlay.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),[tabindex="0"]')??[]).filter(e=>e.getClientRects().length>0);
    const first=controls[0],last=controls.at(-1);
    if(e.shiftKey&&(document.activeElement===first||!overlay.current?.contains(document.activeElement))){e.preventDefault();last?.focus();}
    else if(!e.shiftKey&&(document.activeElement===last||!overlay.current?.contains(document.activeElement))){e.preventDefault();first?.focus();}
   }
  };
  window.addEventListener('keydown',key,true);
  return()=>{window.removeEventListener('keydown',key,true);background.forEach(({element,inert})=>{element.inert=inert;});if(before?.isConnected)before.focus();};
 },[]);
 const item=items.get(mod.id),name=itemName(item,en)||mod.id.split('/').at(-1)||mod.id;
 const ownership=modRankOwnership(snapshot?.upgradeCountsByRank,mod.id,mod.maximumRank),favorite=!!snapshot?.favorites?.includes(mod.id);
 const ranks=Object.entries(snapshot?.upgradeCountsByRank?.[mod.id]??{}).filter(([,count])=>count>0).sort(([a],[b])=>Number(b)-Number(a));
 const level=mod.levels.find(row=>row.rank===mod.maximumRank),sources=mod.sources.filter(s=>searchText(query,s.location,s.reward??'',s.rotation??''));
 return createPortal(<div ref={overlay} className="modPlanShade" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><section className="modPlanDetails" role="dialog" aria-modal="true" aria-label={name}><header><Artwork item={item?.mod?.wikiaThumbnail?{...item,image:item.mod.wikiaThumbnail}:item}/><h3>{name}</h3><button ref={close} onClick={onClose} aria-label={L('关闭 MOD 详情','Close MOD details')}>×</button></header><div><p>{!ownership.known?L('等级分布未读取','Rank breakdown unavailable'):ranks.length?ranks.map(([rank,count])=><span key={rank}>{L('等级','Rank')} {rank} ×{count}　</span>):L('未拥有','Not owned')}</p>{(mod.descriptionZh||mod.description)&&<p>{!en&&mod.descriptionZh?mod.descriptionZh:mod.description}</p>}<h4>{L('满级效果','At max rank')}</h4><p style={{whiteSpace:'pre-line'}}>{(!en&&level?.textZh?level.textZh:level?.text)||L('暂无效果数据','Effect unavailable')}</p>{item&&<WikiLinks name={item.name} zh={item.zh}/>}<h4>{L('获取途径','Acquisition sources')}</h4>{mod.sources.length>0&&<input value={query} onChange={e=>setQuery(e.target.value)} aria-label={L('搜索来源','Search sources')} placeholder={L('搜索来源','Search sources')}/>} {sources.map((s,n)=><p className="modPlanSource" key={n}><strong>{s.location}</strong><span>{s.rotation??''} {s.chance==null?'—':s.chance+'%'}</span></p>)}{!sources.length&&<p>{mod.sources.length?L('没有匹配的来源','No matching sources'):L('暂无来源数据','No sources listed')}</p>}</div><footer><button disabled={!onFavorite||busy} onClick={()=>onFavorite?.(mod.id,!favorite)}>{favorite?L('取消收藏','Remove favorite'):L('加入收藏','Favorite')}</button></footer></section></div>,document.body);
}

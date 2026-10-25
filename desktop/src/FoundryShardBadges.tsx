import {describeShard,type ShardFrame} from './archonModel';
import type {ShardFocus} from './shardFocus';
import {useEffect,useId,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {shardEffectDescription} from './shardEffects';
import './foundryShardBadges.css';
export default function FoundryShardBadges({frames,itemId,en,onOpen}:{frames:ShardFrame[]|null|undefined;itemId:string;en:boolean;onOpen:(target:ShardFocus)=>void}){
 const [hover,setHover]=useState<{id:string;rect:DOMRect}|null>(null),[effects,setEffects]=useState<Record<string,string>>({}),[position,setPosition]=useState({left:8,top:8});
 const tooltip=useRef<HTMLDivElement>(null),tooltipId=useId();
 useEffect(()=>{if(!hover)return;let live=true;fetch('/shard-effects.json').then(r=>{if(!r.ok)throw Error();return r.json();}).then(data=>{if(live)setEffects(data.effects);}).catch(()=>{});return()=>{live=false;};},[!!hover]);
 useEffect(()=>{if(!hover)return;const dismiss=()=>setHover(null),key=(e:KeyboardEvent)=>{if(e.key==='Escape')dismiss();};window.addEventListener('scroll',dismiss,true);window.addEventListener('resize',dismiss);window.addEventListener('keydown',key);return()=>{window.removeEventListener('scroll',dismiss,true);window.removeEventListener('resize',dismiss);window.removeEventListener('keydown',key);};},[!!hover]);
 useLayoutEffect(()=>{if(!hover||!tooltip.current)return;const {width,height}=tooltip.current.getBoundingClientRect();setPosition({left:Math.max(8,Math.min(hover.rect.left,window.innerWidth-width-8)),top:Math.max(8,Math.min(hover.rect.bottom+6,window.innerHeight-height-8))});},[hover,effects]);
 const shown=frames?.find(f=>f.instanceId===hover?.id)?.slots?.map(describeShard).filter(s=>s.installed);
 return <><div className="foundryShardBadges">{frames?.filter(f=>f.itemId===itemId).sort((a,b)=>a.instanceId.localeCompare(b.instanceId)).map((frame,index)=>{
  const slots=frame.slots?.map(describeShard).filter(s=>s.installed);if(!slots?.length)return null;
  return <button key={frame.instanceId} aria-describedby={hover?.id===frame.instanceId?tooltipId:undefined} onMouseEnter={e=>setHover({id:frame.instanceId,rect:e.currentTarget.getBoundingClientRect()})} onMouseLeave={()=>setHover(null)} onFocus={e=>setHover({id:frame.instanceId,rect:e.currentTarget.getBoundingClientRect()})} onBlur={()=>setHover(null)} aria-label={`${en?'Inspect shards · Copy':'查看源力石 · 副本'} ${index+1}`} onClick={()=>{setHover(null);onOpen({itemId,instanceId:frame.instanceId});}}>{slots.map((slot,n)=>slot.color==='unknown'?<span key={n}>?</span>:<img key={n} alt="" src={`/reference/shards/${slot.color}${slot.tau?'_mythic':''}.webp`}/>)}<span>{slots.length}/5</span></button>;
 })}</div>{hover&&shown&&createPortal(<div ref={tooltip} id={tooltipId} role="tooltip" className="foundryShardTooltip" style={position}>{shown.map((slot,n)=><div key={n}>{slot.color==='unknown'?<span>?</span>:<img alt="" src={`/reference/shards/${slot.color}${slot.tau?'_mythic':''}.webp`}/>}<span>{shardEffectDescription(slot.effectId,effects[slot.effectId],en)??(en?'Effect data unavailable':'效果数据暂不可用')}{slot.tau&&<small> ✦</small>}</span></div>)}</div>,document.body)}</>;
}

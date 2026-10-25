import {requestGameSync} from './collectorSync';
import {createPortal} from 'react-dom';
import {ChevronRightIcon,InfoCircledIcon,ArrowRightIcon} from '@radix-ui/react-icons';
import {useCollector} from './Collector';
import {freshAccount} from './dataFreshness';
import {playerPopoverPosition,type PlayerPopoverPosition} from './playerPopover';
import './playerCard.css';
import {useEffect,useState,useRef} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {useTranslation} from 'react-i18next';
import {native} from './api';
import {summary,type MasterySnapshot,type MasteryItem} from './masteryModel';
import './mastery.css';
import {useMasteryPreferences} from './masteryPreferences';
import MasteryBadge from './MasteryBadge';
export const masteryQA=import.meta.env.DEV&&new URLSearchParams(location.search).get('qa')==='mastery';
export default function PlayerCard({onHelp}:{onHelp?:()=>void}){const {i18n}=useTranslation(),en=i18n.language.startsWith('en');const [s,setS]=useState<MasterySnapshot|null>(null),[items,setItems]=useState<MasteryItem[]>([]);useEffect(()=>{
 let live=true,request=0;
 const refresh=()=>{if(native){const sequence=++request;void invoke<MasterySnapshot|null>('load_collection').then(x=>{if(live&&sequence===request)setS(x);}).catch(()=>{});}};
 refresh();
 if(masteryQA&&!native)void fetch('/qa/mastery-snapshot.json').then(r=>{if(!r.ok)throw Error('Fixture unavailable');return r.json();}).then(x=>{if(live)setS(x);}).catch(()=>{});
 void fetch('/catalog.json').then(r=>{if(!r.ok)throw Error('Catalog unavailable');return r.json();}).then(x=>{if(live)setItems(x.items);}).catch(()=>{});
 const off=native?listen('collection-updated',refresh):null;
 const local=(e:Event)=>{
  if(masteryQA&&!native){
   // Page navigation emits an ordinary Event, not a replacement snapshot.
   if(e instanceof CustomEvent&&e.detail&&typeof e.detail==='object'&&Array.isArray(e.detail.favorites))setS(e.detail);
  }else refresh();
 };
 window.addEventListener('myframe-collection-updated',local);
 return()=>{live=false;request++;window.removeEventListener('myframe-collection-updated',local);if(off)void off.then(f=>f());};
},[]);const [preferences]=useMasteryPreferences();const prime=summary(items,s,preferences.hideFounders).prime,p=s?.playerProfile;const fmt=(n:number|null|undefined)=>n==null?'—':n>=1e6?`${Math.round(n/1e4)/100}M`:n>=1e3?`${Math.round(n/10)/100}K`:String(n);
const anchor=useRef<HTMLDivElement>(null),popover=useRef<HTMLDivElement>(null),timer=useRef<ReturnType<typeof setTimeout>|null>(null);
const [position,setPosition]=useState<PlayerPopoverPosition|null>(null),[pinned,setPinned]=useState(false),[now,setNow]=useState(Date.now());
const {status}=useCollector();
const [syncing,setSyncing]=useState(false),[syncError,setSyncError]=useState('');
const paused=native&&!status.enabled&&status.code!=='preview';
async function enableSync(){if(syncing)return;setSyncing(true);setSyncError('');try{await requestGameSync(invoke);}catch(e){setSyncError(String(e));}finally{setSyncing(false);}}
const fresh=freshAccount(status,now,Date.now()),demo=masteryQA&&!native,fetching=status.scanCode==='helper-fetching';
const hasData=!!s,state=fresh||demo?'current':hasData?'cached':'unavailable';
const label=paused?(en?'Sync paused':'同步已暂停'):fresh||demo?(en?'Data up to date':'数据已更新'):hasData?(en?'Using old data':'使用旧数据'):(en?'No game data':'无游戏数据');
const lastUpdated=status.lastReadAt??status.lastInventoryAt??(s as (MasterySnapshot&{capturedAt?:string})|null)?.capturedAt;
const date=lastUpdated&&Number.isFinite(Date.parse(lastUpdated))?new Date(lastUpdated).toLocaleString(i18n.language,{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}):'—';
const detail=demo?(en?'Browser QA fixture; this is not a live account.':'浏览器 QA 资料，并非实时账户数据。'):fresh?(en?'The latest game data was read successfully.':'最近一次游戏数据读取成功。'):fetching?(en?'Reading game data. Last confirmed values remain visible.':'正在读取游戏数据，当前保留上次确认的数值。'):(en?'These values may be from an earlier snapshot. Check the player summary for sync details.':'当前可能显示历史快照，可在玩家摘要查看同步详情。');
const name=p?.name?.trim()||(en?'Name unavailable':'昵称未读取');
const StatusIcon=()=> <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{state==='cached'?<><path d="M12 3 2 21h20L12 3Z"/><path d="M12 9v5"/><circle cx="12" cy="17.5" r="1" fill="currentColor" stroke="none"/></>:<><circle cx="12" cy="12" r="9"/>{state==='current'?<path d="m8 12 3 3 5-6"/>:<path d="M12 7v6m0 4v.5"/>}</>}</svg>;
const cancel=()=>{if(timer.current){clearTimeout(timer.current);timer.current=null;}};
const hide=()=>{cancel();setPosition(null);setPinned(false);};
const open=()=>{cancel();window.dispatchEvent(new Event('myframe-player-menu-open'));const element=anchor.current;if(element)setPosition(playerPopoverPosition(element.getBoundingClientRect(),element.offsetWidth,{width:innerWidth,height:innerHeight}));};
const close=()=>{cancel();timer.current=setTimeout(hide,180);};
useEffect(()=>{const tick=setInterval(()=>setNow(Date.now()),1000);const key=(e:KeyboardEvent)=>{if(e.key==='Escape')hide();};const outside=(e:PointerEvent)=>{if(e.target instanceof Node&&!anchor.current?.contains(e.target)&&!popover.current?.contains(e.target))hide();};const scroll=(e:Event)=>{if(e.target instanceof Node&&popover.current?.contains(e.target))return;hide();};window.addEventListener('myframe-navigation-menu-open',hide);window.addEventListener('keydown',key);window.addEventListener('pointerdown',outside);window.addEventListener('resize',hide);window.addEventListener('scroll',scroll,true);return()=>{cancel();clearInterval(tick);window.removeEventListener('myframe-navigation-menu-open',hide);window.removeEventListener('keydown',key);window.removeEventListener('pointerdown',outside);window.removeEventListener('resize',hide);window.removeEventListener('scroll',scroll,true);};},[]);
return <div ref={anchor} className={'playerCard accountCard '+state+(hasData?' hasData':'')+(position?' accountOpen':'')} onMouseEnter={open} onMouseLeave={()=>{if(!pinned)close();}} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget)&&!popover.current?.contains(e.relatedTarget)&&!popover.current?.matches(':hover'))close();}}>
 <button type="button" className="playerDisclosure" onFocus={e=>{cancel();if(e.currentTarget.matches(':focus-visible'))open();}} onClick={()=>{if(pinned)hide();else{open();setPinned(true);}}} aria-expanded={!!position} aria-controls={position?'player-summary':undefined} aria-label={en?'Player summary':'玩家摘要'}>
  <span className="accountIdentity">{hasData&&<><span className="accountEmblem"><MasteryBadge rank={s?.masteryRank}/><b>{s?.masteryRank??'—'}</b></span><strong className="accountName">{name}</strong></>}<span className={'accountCompactStatus '+state} title={detail}><StatusIcon/><span className="accountStatusCopy"><span>{label}</span>{!hasData&&<small>{paused?(en?'Open account summary':'打开账户摘要'):(en?'Start playing Warframe':'开始游玩 Warframe')}</small>}</span></span><ChevronRightIcon className="accountChevron" aria-hidden="true"/></span>
 </button>
 {position&&createPortal(<div ref={popover} id="player-summary" className="accountPopover" role="region" aria-label={en?'Account summary':'账户摘要'} onMouseEnter={cancel} onMouseLeave={()=>{if(!pinned)close();}} style={{left:position.left,top:position.top,width:position.width,maxHeight:position.maxHeight,transform:`scale(${position.scale})`}}>
  <strong className="accountPopoverName">{name}</strong>
  {hasData&&<><div className="accountPrime"><div><span>{en?'Prime collection':'Prime 收藏进度'}</span><b>{prime==null?'—':`${prime}%`}</b></div><div className="accountPrimeTrack" role="progressbar" aria-label={en?'Prime collection':'Prime 收藏进度'} aria-valuemin={0} aria-valuemax={100} aria-valuenow={prime??undefined}><span style={{width:`${Math.max(0,Math.min(100,prime??0))}%`}}/></div></div>
  <div className="accountAssets">{[['platinum.png',p?.platinum,en?'Platinum':'白金'],['credits.png',s?.credits,en?'Credits':'现金'],['ducats.png',p?.ducats,en?'Ducats':'杜卡德'],['endo.png',p?.endo,en?'Endo':'内融核心']].map(([img,n,currency])=><div className="accountAsset" key={String(img)}><img src={'/reference/ui/'+img} alt=""/><div><span>{String(currency)}</span><strong>{img==='platinum.png'||img==='ducats.png'?(n??'—'):fmt(n as number|null|undefined)}</strong></div></div>)}</div>
  </>}
  <div className={'accountSync '+state}><div className="accountSyncHeading"><StatusIcon/><strong>{label}</strong></div>{state!=='current'&&<p>{paused?(en?'Automatic sync is disabled.':'自动同步尚未启用。'):fetching?(en?'Reading game data.':'正在读取游戏数据。'):hasData?(en?'The game data was loaded from a previous session.':'游戏数据来自先前会话。'):(en?'Start playing Warframe to load your account data.':'开始游玩 Warframe 以读取账户数据。')}</p>}<div className="accountSyncTime">{en?'Last update:':'最后更新：'} <time dateTime={lastUpdated??undefined}>{date}</time></div>{state==='current'?<button type="button" className="accountSyncInfo" title={detail} aria-label={en?'Data details':'数据详情'} onClick={()=>{hide();onHelp?.();}}><InfoCircledIcon/></button>:<button type="button" disabled={syncing} className="accountTroubleshoot" onClick={()=>{if(paused)void enableSync();else{hide();onHelp?.();}}}>{paused?(syncing?(en?'Starting…':'正在启动…'):(en?'Enable sync':'启用同步')):(en?'Troubleshoot data':'排查数据问题')}<ArrowRightIcon/></button>}</div>{syncError&&<p role="alert">{syncError}</p>}
 </div>,document.body)}
</div>;
}

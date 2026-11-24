import {useArbitrationWindow,clampMiniWindowToMonitors} from './useArbitrationWindow';
import {useCallback,useEffect,useRef,useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {getCurrentWindow,LogicalSize} from '@tauri-apps/api/window';
import {DrawingPinIcon,Cross2Icon,ChevronDownIcon,DragHandleDots2Icon,OpenInNewWindowIcon} from '@radix-ui/react-icons';
import {native} from './api';
import {durationLabel,missionSeconds,rangeLabel,runEstimate,type ArbitrationRun} from './arbitrationRunModel';
import {MINI_WIDTH,miniPhaseLabel,miniStatusBadge,miniWindowHeight} from './arbitrationWindowModel';
import {livePhase} from './arbitrationLiveModel';
import {useWorldNodes} from './useArbitrations';
import './arbitrationMini.css';

const miniStateKey='tennoledger.arbitration-mini.state.v1';
function savedMiniState(){
 try{
  const value=JSON.parse(localStorage.getItem(miniStateKey)??'{}');
  return {pinned:value.pinned!==false,collapsed:value.collapsed===true,details:value.details===true};
 }catch{
  return {pinned:true,collapsed:false,details:false};
 }
}

export default function ArbitrationMini({
 run,
 clock,
 en,
 error,
 captureCode,
 onHide,
 onExpandFull,
 previewMode=false,
}:{
 run:ArbitrationRun|null;
 clock:number;
 en:boolean;
 error:string;
 captureCode?:string;
 onHide?:()=>void;
 onExpandFull?:()=>void;
 previewMode?:boolean;
}){
 const L=(zh:string,english:string)=>en?english:zh;
 const nodes=useWorldNodes();
 const [saved]=useState(savedMiniState);
 const [pinned,setPinned]=useState(saved.pinned);
 const [collapsed,setCollapsed]=useState(saved.collapsed);
 const [details,setDetails]=useState(saved.details);
 const [windowError,setWindowError]=useState('');
 const [busy,setBusy]=useState(false);
 const [wakePulse,setWakePulse]=useState(false);

 const intervalCount=run?.intervals.length??0;
 const collapsedRef=useRef(collapsed);collapsedRef.current=collapsed;
 const detailsRef=useRef(details);detailsRef.current=details;
 const pinnedRef=useRef(pinned);pinnedRef.current=pinned;
 const countRef=useRef(intervalCount);countRef.current=intervalCount;

 const act=async(action:()=>Promise<unknown>)=>{
  setWindowError('');
  try{await action();}catch(e){setWindowError(String(e));}
 };

 const resize=useCallback(async(collapse:boolean,detail:boolean)=>{
  if(busy)return;
  setBusy(true);
  try{
   if(native){
    await getCurrentWindow().setSize(new LogicalSize(MINI_WIDTH,miniWindowHeight(collapse,detail,countRef.current)));
   }
   setCollapsed(collapse);
   setDetails(detail);
   setWindowError('');
  }catch(e){
   setWindowError(String(e));
  }finally{
   setBusy(false);
  }
 },[busy]);

 useEffect(()=>{
  if(!native)return;
  void (async()=>{
   await getCurrentWindow().setAlwaysOnTop(saved.pinned);
   await getCurrentWindow().setSize(new LogicalSize(MINI_WIDTH,miniWindowHeight(saved.collapsed,saved.details,countRef.current)));
  })().catch(e=>setWindowError(String(e)));
 },[saved]);

 useEffect(()=>{
  if(!native||collapsed||!details)return;
  void getCurrentWindow().setSize(new LogicalSize(MINI_WIDTH,miniWindowHeight(false,true,intervalCount))).catch(e=>setWindowError(String(e)));
 },[collapsed,details,intervalCount]);

 useEffect(()=>{
  try{localStorage.setItem(miniStateKey,JSON.stringify({pinned,collapsed,details}));}catch(e){setWindowError(String(e));}
 },[pinned,collapsed,details]);

 useArbitrationWindow(setWindowError);

 useEffect(()=>{
  if(!native)return;
  let timer:ReturnType<typeof setTimeout>|undefined;
  const off=listen<{wasHidden?:boolean;preferMini?:boolean}>('arbitration-live-wake',event=>{
   setWakePulse(true);
   clearTimeout(timer);
   timer=setTimeout(()=>setWakePulse(false),700);
   void clampMiniWindowToMonitors(setWindowError);
   void getCurrentWindow().setAlwaysOnTop(pinnedRef.current).catch(e=>setWindowError(String(e)));
   if(event.payload?.wasHidden&&collapsedRef.current){
    void getCurrentWindow().setSize(new LogicalSize(MINI_WIDTH,miniWindowHeight(false,detailsRef.current,countRef.current))).then(()=>setCollapsed(false)).catch(e=>setWindowError(String(e)));
   }
  });
  return()=>{
   clearTimeout(timer);
   void off.then(fn=>fn());
  };
 },[]);

 const phase=run?livePhase(run,clock):null;
 const estimate=run?runEstimate(run):null;
 const last=run?.droneTimes.at(-1);
 const ended=!!run&&run.status!=='recording';
 const intervalKind=run?.intervals.at(-1)?.kind;
 const nodeLabel=run?(en?(run.node||nodes[run.nodeId]?.name||run.nodeId):(run.node||nodes[run.nodeId]?.zh||run.nodeId)):L('等待进入仲裁','Waiting for Arbitration');
 const status=miniStatusBadge(run,clock,captureCode,en);
 const collapsedSummary=run?`${nodeLabel} · ${durationLabel(missionSeconds(run,clock))}`:status.label;

 return (
  <section className={'arbitrationMiniWindow'+(wakePulse?' arbMiniWakePulse':'')+(collapsed?' is-collapsed':'')}>
   <header>
    <button
     type="button"
     className="arbMiniDrag"
     aria-label={L('拖动窗口','Drag window')}
     title={L('按住拖动小窗','Drag monitor')}
     onMouseDown={e=>{if(native&&e.button===0)void act(()=>getCurrentWindow().startDragging());}}
    >
     <DragHandleDots2Icon/>
     <i className={`arbMiniDot ${status.tone}`} aria-hidden="true"/>
     <strong>{L('仲裁监控','Arbitration monitor')}</strong>
     {collapsed&&<span className="arbMiniCollapsedTicker" title={collapsedSummary}>{collapsedSummary}</span>}
    </button>
    <button
     type="button"
     aria-label={L('完整面板','Full dashboard')}
     title={L('完整面板','Full dashboard')}
     onClick={()=>{
      if(native){
       void act(async()=>{
        await getCurrentWindow().setAlwaysOnTop(false);
        await getCurrentWindow().setSize(new LogicalSize(1024,720));
        const url=new URL(location.href);
        url.searchParams.delete('mini');
        location.replace(url.href);
       });
      }else{
       onExpandFull?.();
      }
     }}
    >
     <OpenInNewWindowIcon/>
    </button>
    <button
     type="button"
     aria-label={L('置顶','Always on top')}
     title={pinned?L('取消置顶','Unpin'):L('窗口置顶','Pin on top')}
     aria-pressed={pinned}
     disabled={!native&&!previewMode}
     onClick={()=>{
      if(native){
       void act(async()=>{await getCurrentWindow().setAlwaysOnTop(!pinned);setPinned(!pinned);});
      }else if(previewMode){
       setPinned(!pinned);
      }
     }}
    >
     <DrawingPinIcon/>
    </button>
    <button
     type="button"
     aria-label={collapsed?L('展开','Expand'):L('收起','Collapse')}
     title={collapsed?L('展开小窗','Expand'):L('收起为状态条','Collapse to bar')}
     aria-expanded={!collapsed}
     disabled={busy}
     onClick={()=>void resize(!collapsed,details)}
    >
     <ChevronDownIcon style={{transform:collapsed?'rotate(180deg)':undefined}}/>
    </button>
    <button
     type="button"
     aria-label={L('隐藏窗口','Hide window')}
     title={L('隐藏小窗 · 可在仲裁页或侧栏唤醒','Hide · reopen in Arbitrations or sidebar')}
     onClick={()=>{
      if(native){
       void act(()=>invoke('arbitration_hide_live').catch(()=>getCurrentWindow().hide()));
      }else{
       onHide?.();
      }
     }}
    >
     <Cross2Icon/>
    </button>
   </header>

   {(error||windowError)&&<p role="alert">{windowError||error}</p>}

   {!collapsed&&(
    <div className="arbMiniBody">
     <div className="arbMiniNode">
      <strong>{nodeLabel}</strong>
      <small>{ended?L('已结束','Ended'):run?.isHost==null?'':run.isHost?L('房主','Host'):L('队员','Client')}</small>
     </div>

     <div className="arbMiniMetrics">
      <article>
       <span>{miniPhaseLabel(phase,intervalKind,en)}</span>
       <strong>{durationLabel(phase?.seconds??null)}</strong>
       <small>{phase?.breakSeconds!=null&&!ended?L('间歇 ','Intermission ')+durationLabel(phase.breakSeconds):ended?L('最终记录','Final record'):''}</small>
      </article>
      <article>
       <span>{L('任务时长','Mission time')}</span>
       <strong>{durationLabel(run?missionSeconds(run,clock):null)}</strong>
      </article>
      <article title={run?.isHost===false&&!run.droneTelemetry?L('队员视角：游戏仅在房主端记录无人机生成','Client view: Warframe logs drone spawns on the Host only'):L('距上次仲裁无人机生成已过时间','Elapsed since last Arbitration drone')}>
       <span>{L('无人机间隔','Drone gap')}</span>
       <strong>{durationLabel(run?.droneTelemetry&&last!=null?Math.max(0,clock-last):null)}</strong>
      </article>
      <article className="arbMiniMetricVitus" title={run?.isHost===false&&!run.droneTelemetry?L('队员视角：游戏仅在房主端记录无人机生成，无法估算精华','Client view: Warframe logs drone spawns on the Host only'):undefined}>
       <span>{L('预估精华','Expected VE')}</span>
       <strong>{estimate?rangeLabel(estimate.low,estimate.high):'—'}</strong>
      </article>
     </div>

     <footer>
      <span className={`arbMiniStatus ${status.tone}`} title={status.title}>
       <i className="arbMiniDot" aria-hidden="true"/>
       {status.label}
      </span>
      <button
       type="button"
       aria-expanded={details}
       disabled={busy}
       title={details?L('收起波次记录','Hide intervals'):L('查看波次记录','Show intervals')}
       onClick={()=>void resize(false,!details)}
      >
       {L('波次记录','Intervals')}
       {intervalCount>0&&<small>{intervalCount}</small>}
       <ChevronDownIcon style={{transform:details?'rotate(180deg)':undefined}}/>
      </button>
     </footer>

     {details&&(
      <div className="arbMiniIntervals">
       {run?.intervals.length?run.intervals.slice(-8).map(i=>(
        <div key={i.kind+':'+i.index}>
         <span>#{i.index}</span>
         <strong>{durationLabel((i.end??clock)-i.start)}</strong>
         <span>{i.drones} {L('无人机','drones')}</span>
        </div>
       )):<p>{L('尚无区间记录','No intervals yet')}</p>}
      </div>
     )}
    </div>
   )}
  </section>
 );
}

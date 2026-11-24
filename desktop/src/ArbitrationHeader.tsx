import type {ReactNode} from 'react';
import {OpenInNewWindowIcon} from '@radix-ui/react-icons';
import {CalendarIcon,CounterClockwiseClockIcon,Cross2Icon,MixerHorizontalIcon} from './arbitrationIcons';
import {native} from './api';
import type {ArbitrationView} from './arbitrationRunModel';
import {useArbitrationLiveWindow,type ArbitrationLiveWindowState} from './useArbitrationLiveWindow';

function captureBadge(state:ArbitrationLiveWindowState,en:boolean){
 if(!native){
  return {
   tone:'muted',
   label:en?'Preview':'浏览器预览',
   title:en?'Live log capture requires the desktop app':'实时日志采集与置顶小窗需在桌面端运行',
  };
 }
 if(state.recording){
  return {
   tone:'live',
   label:en?'Recording':'录制中',
   title:en?'Recording an active Arbitration mission':'正在采集当前仲裁对局',
  };
 }
 if(state.captureCode==='waiting-account'){
  return {
   tone:'muted',
   label:en?'No sync':'未同步',
   title:en?'Enable auto-sync and log in to begin recording':'开启自动同步并登录游戏后开始监听',
  };
 }
 if(state.captureCode==='live-unlinked'){
  return {
   tone:'watching',
   label:en?'Live only':'仅监控',
   title:en?'Watching EE.log in live-only mode; enable sync to save run history':'正在实时监听日志；开启自动同步并登录后自动保存历史',
  };
 }
 if(state.captureCode==='log-unavailable'){
  return {
   tone:'warn',
   label:en?'No EE.log':'无日志',
   title:en?'Warframe EE.log not found; start the game':'未找到 Warframe EE.log，请确认游戏已启动',
  };
 }
 return {
  tone:'watching',
  label:en?'Watching':'监听中',
  title:en?'Ready; recording begins upon entering an Arbitration':'已就绪，进入仲裁后自动开始采集',
 };
}

export default function ArbitrationHeader({
 view,
 onView,
 en,
 live:providedLive,
}:{
 view:ArbitrationView;
 onView:(v:ArbitrationView)=>void;
 en:boolean;
 live?:ArbitrationLiveWindowState;
}){
 const ownLive=useArbitrationLiveWindow();
 const live=providedLive??ownLive;
 const L=(zh:string,english:string)=>en?english:zh;
 const badge=captureBadge(live,en);
 const tabs:{key:ArbitrationView;label:string;icon:ReactNode}[]=[
  {key:'schedule',label:L('排期','Schedule'),icon:<CalendarIcon/>},
  {key:'history',label:L('历史','History'),icon:<CounterClockwiseClockIcon/>},
  {key:'preferences',label:L('偏好','Alerts'),icon:<MixerHorizontalIcon/>},
 ];

 return (
  <header className="arbPageHeading arbHeaderBar">
   <div className="arbHeaderLeft">
    <h1>{L('仲裁','Arbitrations')}</h1>
    <div className="arbViewTabs" role="tablist" aria-label={L('仲裁视图','Arbitration views')}>
     {tabs.map(t=>(
      <button
       key={t.key}
       type="button"
       role="tab"
       aria-selected={view===t.key}
       className={view===t.key?'selected':''}
       onClick={()=>onView(t.key)}
      >
       {t.icon}
       <span>{t.label}</span>
      </button>
     ))}
    </div>
   </div>

   <div className="arbHeaderActions">
    <span className={`arbCaptureBadge ${badge.tone}`} title={badge.title}>
     <i className="arbStatusDot" aria-hidden="true"/>
     {badge.label}
    </span>
    {live.liveWindowVisible?(
     <div className="arbLivePillGroup">
      <button
       type="button"
       className="arbLivePill open"
       disabled={!native||live.busy}
       title={L('聚焦置顶监控小窗','Focus floating monitor')}
       onClick={()=>void live.openLive()}
      >
       <i className="arbStatusDot" aria-hidden="true"/>
       <span>{L('小窗已开','Monitor open')}</span>
      </button>
      <button
       type="button"
       className="arbLivePillHide"
       disabled={!native||live.busy}
       aria-label={L('隐藏小窗','Hide monitor')}
       title={L('隐藏置顶小窗','Hide floating monitor')}
       onClick={()=>void live.hideLive()}
      >
       <Cross2Icon/>
      </button>
     </div>
    ):(
     <button
      type="button"
      className={'arbLivePill'+(live.recording?' recording':'')}
      disabled={!native||live.busy}
      title={native?L('打开或唤醒置顶监控小窗','Open or wake floating monitor'):L('仅桌面版支持独立置顶小窗','Floating monitor requires desktop app')}
      onClick={()=>void live.openLive()}
     >
      {live.recording&&<i className="arbStatusDot" aria-hidden="true"/>}
      <OpenInNewWindowIcon/>
      <span>{live.recording?L('唤醒小窗','Wake monitor'):L('置顶小窗','Floating monitor')}</span>
     </button>
    )}
   </div>
  </header>
 );
}

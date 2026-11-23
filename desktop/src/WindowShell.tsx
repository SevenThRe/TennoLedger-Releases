import {useAppPreferences} from './useAppPreferences';
import {ThemeRuntime} from './useTheme';
import {useTranslation} from 'react-i18next';
import {useZoom,useAppearance} from './useUiPreferences';
import {CollectorControl} from './Collector';
import {useEffect,useState,useRef,type ReactNode,type CSSProperties} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {getCurrentWindow} from '@tauri-apps/api/window';
import {native} from './api';
import {resolveWindowCloseDecision} from './appPreferencesModel';
import './windowShell.css';
const clamp=(n:number)=>Math.max(70,Math.min(150,Math.round(n/10)*10));
export default function WindowShell({children}:{children:ReactNode}){
 const {i18n}=useTranslation(),en=i18n.language.startsWith('en'),L=(zh:string,english:string)=>en?english:zh;
 const [preferences,setPreferences]=useAppPreferences(),preferencesRef=useRef(preferences);
 preferencesRef.current=preferences;
 const [confirmClose,setConfirmClose]=useState(false),[rememberClose,setRememberClose]=useState(false),[closingBusy,setClosingBusy]=useState(false),allowClose=useRef(false);
 const [zoom,setZoom]=useZoom(),[appearance]=useAppearance(),[maximized,setMaximized]=useState(false),[error,setError]=useState('');
 const run=(action:()=>Promise<unknown>)=>{void action().catch(e=>setError(String(e)));};
 const handleCloseChoice=async(choice:'minimize'|'close')=>{
  if(closingBusy)return;
  setClosingBusy(true);
  try{
   if(rememberClose){
    await setPreferences({...preferencesRef.current,closeAction:choice,warnOnClose:false});
   }
   setConfirmClose(false);
   if(choice==='minimize'){
    await getCurrentWindow().minimize();
   }else{
    allowClose.current=true;
    await getCurrentWindow().destroy();
   }
  }catch(e){
   setError(String(e));
  }finally{
   setClosingBusy(false);
  }
 };
 useEffect(()=>{document.documentElement.dataset.accent=appearance.accent;document.documentElement.dataset.reducedMotion=String(appearance.reducedMotion);},[appearance]);
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if(!(e.ctrlKey||e.metaKey))return;if(['+','=','-','0'].includes(e.key)){e.preventDefault();setZoom(e.key==='0'?100:clamp(zoom+(e.key==='-'?-10:10)));}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[zoom]);
 useEffect(()=>{if(!native)return;let live=true;const w=getCurrentWindow();const update=()=>{void w.isMaximized().then(v=>{if(live)setMaximized(v);}).catch(e=>{if(live)setError(String(e));});};update();const off=w.onResized(update);return()=>{live=false;void off.then(f=>f()).catch(()=>{});};},[]);
 useEffect(()=>{
  if(!native||getCurrentWindow().label!=='main')return;
  const w=getCurrentWindow();
  const off=w.onCloseRequested(async event=>{
   if(allowClose.current)return;
   const minimized=await w.isMinimized().catch(()=>false);
   const decision=resolveWindowCloseDecision(preferencesRef.current.closeAction,minimized);
   if(decision==='close')return;
   event.preventDefault();
   if(decision==='minimize'){
    await w.minimize().catch(e=>setError(String(e)));
    return;
   }
   setRememberClose(false);
   setConfirmClose(true);
   void invoke('app_focus_main_window').catch(()=>Promise.all([w.unminimize().catch(()=>{}),w.show().catch(()=>{}),w.setFocus().catch(()=>{})]));
  });
  return()=>{void off.then(f=>f());};
 },[]);
 useEffect(()=>{
  if(!confirmClose)return;
  const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!closingBusy)setConfirmClose(false);};
  window.addEventListener('keydown',onKey);
  return()=>window.removeEventListener('keydown',onKey);
 },[confirmClose,closingBusy]);
 return <div className={'windowShell'+(maximized?' maximized':'')} style={{'--ui-scale':zoom/100} as CSSProperties}><ThemeRuntime overlay={new URLSearchParams(location.search).has('arbitrationLive')||new URLSearchParams(location.search).has('overlay')}/>{confirmClose&&<div className="windowCloseConfirm" onMouseDown={e=>{if(e.target===e.currentTarget&&!closingBusy)setConfirmClose(false);}}><section role="dialog" aria-modal="true" aria-label={L('关闭窗口','Close TennoLedger')}><header className="windowCloseHeader"><h2>{L('关闭窗口','Close TennoLedger')}</h2><button type="button" className="windowCloseDismiss" disabled={closingBusy} aria-label={L('取消','Cancel')} title={L('取消','Cancel')} onClick={()=>setConfirmClose(false)}>×</button></header><p>{L('最小化可在后台继续同步与提醒。','Minimize keeps sync and notifications running.')}</p><label className="windowCloseRemember" title={L('后续关闭窗口将直接执行，可在「设置 → 通用」修改','Apply automatically next time. Change in Settings → General.')}><input type="checkbox" checked={rememberClose} disabled={closingBusy} onChange={e=>setRememberClose(e.target.checked)}/><span>{L('记住我的选择','Remember my choice')}</span></label><div className="windowCloseActions"><button type="button" className="windowCloseMinimize" autoFocus disabled={closingBusy} onClick={()=>void handleCloseChoice('minimize')}>{L('最小化','Minimize')}</button><button type="button" className="windowCloseQuit" disabled={closingBusy} onClick={()=>void handleCloseChoice('close')}>{L('关闭应用','Close app')}</button></div></section></div>}<div className="windowTitlebar"><div className="windowDrag" onMouseDown={e=>{if(native&&e.button===0&&e.detail===1)run(()=>getCurrentWindow().startDragging());}} onDoubleClick={()=>{if(native)run(()=>getCurrentWindow().toggleMaximize());}}><img className="brandMark" src="/tenno-ledger.svg" alt=""/><span>TennoLedger</span></div>{new URLSearchParams(location.search).get('arbitrationLive')==='1'&&<span className="windowLiveTitle">{L('实时仲裁','Live Arbitration')}</span>}<CollectorControl backgroundOnly/><div className="windowDragSpace" onMouseDown={e=>{if(native&&e.button===0)run(()=>getCurrentWindow().startDragging());}}/><div className="windowTools"><div className="windowZoom"><button title={L("缩小 (Ctrl −)","Zoom out (Ctrl −)")} aria-label={L("缩小界面","Zoom out")} disabled={zoom<=70} onClick={()=>setZoom(clamp(zoom-10))}><span className="windowZoomIcon zoomOut"/></button><button className="zoomValue" title={L("恢复 100% (Ctrl 0)","Reset 100% (Ctrl 0)")} onClick={()=>setZoom(100)}>{zoom}%</button><button title={L("放大 (Ctrl +)","Zoom in (Ctrl +)")} aria-label={L("放大界面","Zoom in")} disabled={zoom>=150} onClick={()=>setZoom(clamp(zoom+10))}><span className="windowZoomIcon zoomIn"/></button></div><div className="windowControls"><button disabled={!native} aria-label={L('最小化','Minimize')} title={L('最小化','Minimize')} onClick={()=>run(()=>getCurrentWindow().minimize())}><WindowIcon name="minimize"/></button><button disabled={!native} aria-label={maximized?L('还原窗口','Restore'):L('最大化','Maximize')} title={maximized?L('还原窗口','Restore'):L('最大化','Maximize')} onClick={()=>run(()=>getCurrentWindow().toggleMaximize())}><WindowIcon name={maximized?'restore':'maximize'}/></button><button disabled={!native} className="windowClose" aria-label={L('关闭窗口','Close')} title={L('关闭窗口','Close')} onClick={()=>run(()=>getCurrentWindow().close())}><WindowIcon name="close"/></button></div></div></div>{error&&<button className="windowError" role="alert" onClick={()=>setError('')}>{error} ×</button>}<div className="windowContent">{children}</div></div>;
}
function WindowIcon({name}:{name:'minimize'|'maximize'|'restore'|'close'}){return <svg width="30" height="30" fill="currentColor" aria-hidden="true"><use href={`/reference/shell/svg/sprite.svg#window-control_${name}`}/></svg>;}

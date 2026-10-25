import {useMarketPreferences} from './MarketPreferences';
import {marketAutoKey,restoreMarketAuto} from './marketPreferencesModel';
import {useMarketSession} from './MarketAccount';
import {useEffect,useRef,useState} from 'react';
import {useTranslation} from 'react-i18next';
import {invoke} from '@tauri-apps/api/core';
import {native} from './api';
import type {MarketSession} from './MarketAccount';
import {useAppPreferences} from './useAppPreferences';
import {parseMarketPresence,presenceStorageKey,readRememberedPresence,validPresenceStatus,type MarketPresenceStatus,type MarketPresenceView} from './marketPresenceModel';
export default function MarketPresence({session}:{session:MarketSession}){
 const {i18n}=useTranslation(),en=i18n.language.startsWith('en'),L=(zh:string,eng:string)=>en?eng:zh;
 const labels={online:L('在线','Online'),ingame:L('游戏中','In game'),invisible:L('隐身','Invisible'),offline:L('离线','Offline')};
 const {preferences:marketPrefs,update:updateMarketPrefs}=useMarketPreferences();
 const [autoWarning,setAutoWarning]=useState(false),[skipWarning,setSkipWarning]=useState(false);
 const [preferences,,,preferencesReady]=useAppPreferences(),[view,setView]=useState<MarketPresenceView|null>(null),[error,setError]=useState(''),[connecting,setConnecting]=useState(false),[sessionRevision,setSessionRevision]=useState(0),[intent,setIntent]=useState<{status:MarketPresenceStatus;at:number;remember:boolean}|null>(null);
 const generation=useRef(0),intentRef=useRef(intent),rememberRef=useRef(preferences.rememberMarketStatus),restored=useRef(false),pending=useRef(false);intentRef.current=intent;rememberRef.current=preferences.rememberMarketStatus;
 const account=session.accountId??'',platform=session.platform??'pc',key=presenceStorageKey(account,platform),scope=JSON.stringify([account,platform,session.sessionGeneration,session.connected]);
 const request=async(action:string,status?:MarketPresenceStatus)=>parseMarketPresence(await invoke('market_presence',{action,status:status??null,expectedAccount:account,expectedPlatform:platform}),account,platform);
 async function change(status:MarketPresenceStatus,remember=true){
  if(pending.current||!view?.ready||!view.authenticated||view.pending||!validPresenceStatus(status))return;
  pending.current=true;const run=generation.current;setError('');setIntent({status,at:Date.now(),remember});
  try{
   await request('set',status);
  }catch(e){if(run===generation.current){setError(String(e));setIntent(null);}}finally{pending.current=false;}
 }
 async function connect(force=false){if(!native||!account||!session.connected)return;const run=generation.current;setConnecting(true);setError('');try{await request(force?'reconnect':'connect');}catch(e){if(run===generation.current)setError(String(e));}finally{if(run===generation.current)setConnecting(false);}}
 useEffect(()=>{
  let live=true,reading=false;generation.current++;setView(null);setIntent(null);restored.current=false;pending.current=false;setAutoWarning(false);
  if(!native||!session.connected||!account)return;
  const run=generation.current;void connect();
  const poll=async()=>{if(reading)return;reading=true;try{const next=await request('state');if(!live||run!==generation.current)return;setView(next);const waiting=intentRef.current;if(waiting){if(next.ready&&!next.pending&&next.status===waiting.status){setIntent(null);setError('');if(waiting.remember&&rememberRef.current)try{localStorage.setItem(key,JSON.stringify({version:1,status:waiting.status}));}catch{setError(L('市场状态已更新，偏好保存失败','Market status updated, but the preference could not be saved'));}}else if(next.error||Date.now()-waiting.at>20000){setIntent(null);setError(next.error??L('状态回执超时，请重连核对','Status acknowledgement timed out; reconnect to verify'));}}}catch(e){if(live&&run===generation.current)setError(String(e));}finally{reading=false;}};
  void poll();const timer=setInterval(()=>void poll(),1000);
  const invalidate=()=>{generation.current++;setView(null);setIntent(null);setSessionRevision(n=>n+1);};window.addEventListener('market-session-changed',invalidate);
  return()=>{live=false;generation.current++;clearInterval(timer);window.removeEventListener('market-session-changed',invalidate);};
 },[scope,sessionRevision]);
 useEffect(()=>{
  if(!preferencesReady)return;
  if(!preferences.rememberMarketStatus){try{localStorage.removeItem(key);}catch{}restored.current=true;return;}
  if(!view?.ready){restored.current=false;return;}
  if(!view.authenticated||restored.current||!account)return;
  restored.current=true;let saved:MarketPresenceStatus|null=null;try{saved=readRememberedPresence(localStorage.getItem(key));}catch{}
  let savedAuto=false;try{savedAuto=restoreMarketAuto(marketPrefs,localStorage.getItem(marketAutoKey(account,platform)));}catch{}
  if(!view.autoMode&&!savedAuto&&saved&&saved!==view.status)void change(saved,false);
 },[view,preferences.rememberMarketStatus,key,preferencesReady,marketPrefs.autoKeepEnabled]);
 async function toggleAuto(enabled:boolean,remember=true){
  if(!native||pending.current||!view?.ready||!view.authenticated||session.verified!==true)return;
  pending.current=true;setError('');const run=generation.current;
  try{await invoke('market_presence',{action:'auto',status:String(enabled),expectedAccount:account,expectedPlatform:platform});if(run!==generation.current)return;
   if(remember)try{localStorage.setItem(marketAutoKey(account,platform),String(enabled));}catch{setError(L('Auto 已设置，记忆保存失败','Auto mode updated, but the preference could not be saved'));}
   if(enabled&&remember&&!marketPrefs.skipWarningAutoKeep){setSkipWarning(false);setAutoWarning(true);}
  }catch(e){if(run===generation.current)setError(String(e));}finally{pending.current=false;}
 }

 if(!session.connected)return null;
 const status=view?.ready?view.status:null;
 return <div className="marketPresence"><label>{L('市场状态','Market status')}<select aria-label={L('市场在线状态','Market online status')} value={status??''} disabled={!native||!view?.ready||!view.authenticated||!!intent||view.pending||view.autoMode===true||session.verified!==true} onChange={e=>{if(validPresenceStatus(e.target.value))void change(e.target.value);}}><option value="" disabled>{L('待同步','Waiting for status')}</option>{status==='offline'&&<option value="offline" disabled>{L('离线','Offline')}</option>}{Object.entries(labels).filter(([s])=>s!=='offline').map(([s,label])=><option key={s} value={s}>{label}</option>)}</select></label><label title={L('检测到游戏进程时为游戏中，否则隐身','In game while Warframe is running; invisible otherwise')}><input type="checkbox" aria-label={L('市场 Auto 模式','Market Auto mode')} checked={view?.autoMode===true} disabled={!native||!view?.ready||session.verified!==true||!!intent||view.pending} onChange={e=>void toggleAuto(e.target.checked)}/>Auto</label>{autoWarning&&<section className="marketAutoWarning" role="dialog" aria-label={L('记住 Auto 模式','Remember Auto mode')}><p>{L('是否在重启后恢复此市场账号的 Auto 模式？游戏运行时显示游戏中，关闭后隐身。','Remember Auto mode for this market account after restarting? Your status is In game while Warframe is running and Invisible otherwise.')}</p><label><input type="checkbox" checked={skipWarning} onChange={e=>setSkipWarning(e.target.checked)}/>{L('不再询问','Do not ask again')}</label><button onClick={()=>{updateMarketPrefs({autoKeepEnabled:true,...(skipWarning?{skipWarningAutoKeep:true}:{})});setAutoWarning(false);}}>{L('记住 Auto','Remember Auto')}</button><button onClick={()=>{updateMarketPrefs({autoKeepEnabled:false,...(skipWarning?{skipWarningAutoKeep:true}:{})});setAutoWarning(false);}}>{L('仅本次','This session only')}</button></section>}{intent&&<small role="status">{L('等待市场回执…','Waiting for market acknowledgement…')}</small>}{(!view?.connected||!!view.error||!!error)&&<button disabled={connecting||!native} onClick={()=>void connect(true)}>{connecting?L('连接中…','Connecting…'):L('重连状态','Reconnect status')}</button>}{(error||view?.error)&&<small role="status" title={error||view?.error||''}>{L('状态同步失败','Status sync failed')}</small>}</div>;
}

/** Mount once globally so explicitly remembered Auto does not wait for opening the Market page. */
export function MarketAutoRuntime(){
 const session=useMarketSession(),{preferences}=useMarketPreferences(),[,,,preferencesReady]=useAppPreferences();
 useEffect(()=>{
  if(!native||!preferencesReady||!session.connected||!session.accountId||session.verified!==true)return;
  const account=session.accountId,platform=session.platform??'pc';let saved=false;
  try{saved=restoreMarketAuto(preferences,localStorage.getItem(marketAutoKey(account,platform)));}catch{}
  if(!saved)return;let live=true,reading=false,applied=false;
  const request=(action:string,status:string|null=null)=>invoke('market_presence',{action,status,expectedAccount:account,expectedPlatform:platform});
  void request('connect').catch(()=>{});
  const poll=async()=>{if(!live||reading||applied)return;reading=true;try{const view=parseMarketPresence(await request('state'),account,platform);if(live&&view.ready&&view.authenticated){applied=true;let stillEnabled=false;try{stillEnabled=restoreMarketAuto(preferences,localStorage.getItem(marketAutoKey(account,platform)));}catch{}if(stillEnabled&&!view.autoMode)await request('auto','true');}}catch{}finally{reading=false;}};
  void poll();const timer=setInterval(()=>void poll(),1000);return()=>{live=false;clearInterval(timer);};
 },[session.connected,session.accountId,session.platform,session.sessionGeneration,session.verified,preferences.autoKeepEnabled,preferencesReady]);
 return null;
}

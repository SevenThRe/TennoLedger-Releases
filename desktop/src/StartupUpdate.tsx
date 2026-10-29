import {reportClientFault} from './clientDiagnostics';
import {useTranslation} from 'react-i18next';
import {useEffect,useState,type ReactNode} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {checkApplicationUpdate} from './applicationUpdate';
import {native} from './api';
import {runUpdate,type UpdateState} from './updateFlow';
import './startupUpdate.css';

// One startup task even under React StrictMode's development effect replay.
let startup:Promise<void>|undefined;
let readyAcknowledged=false;
let latest:UpdateState={phase:'checking'};
const listeners=new Set<(s:UpdateState)=>void>();
const report=(s:UpdateState)=>{if(s.phase==='error')reportClientFault('updater',s.error);latest=s;listeners.forEach(f=>f(s));};
function start(){return startup??= (async()=>{
 try{
  if(!readyAcknowledged){readyAcknowledged=true;await invoke('incremental_ready');}
  const config=await invoke<{configured:boolean}>('update_configuration');
  if(!config.configured){report({phase:'ready'});return;}
  await runUpdate({check:()=>checkApplicationUpdate(),prepare:()=>invoke('update_prepare'),resume:()=>invoke('update_resume')},report);
 }catch(error){report({phase:'error',error:String(error)});}
})();}
export default function StartupUpdate({children}:{children:ReactNode}){
 const {i18n}=useTranslation(),en=i18n.language.startsWith('en'),L=(a:string,b:string)=>en?b:a;
 const auxiliary=new URLSearchParams(location.search).has('arbitrationLive');
 const [state,setState]=useState(latest),[skip,setSkip]=useState(false);
 useEffect(()=>{if(!native||auxiliary)return;listeners.add(setState);setState(latest);void start();return()=>{listeners.delete(setState);};},[]);
 if(auxiliary||!native||skip||state.phase==='ready'||state.phase==='checking')return children;
 if(state.phase==='error')return <>{children}<aside className="startupUpdateNotice" role="status"><div><strong>{L('暂时无法检查更新','Could not check for updates')}</strong><p>{L('可以继续使用当前版本。','You can continue using this version.')}</p><details><summary>{L('错误详情','Error details')}</summary><p>{state.error}</p></details></div><button onClick={()=>{report({phase:'checking'});startup=undefined;void start();}}>{L('重试','Retry')}</button><button aria-label={L('关闭更新提示','Dismiss update notice')} onClick={()=>setSkip(true)}>×</button></aside></>;
 const progress=state.total?Math.min(100,Math.round((state.downloaded??0)/state.total*100)):undefined;
 return <section className="startupUpdate" aria-live="polite"><img src="/tenno-ledger.svg" alt=""/><h1>{L('天诺手账','TennoLedger')}</h1>
 <p>{state.phase==='downloading'?L(`正在下载 ${state.version}…`,`Downloading ${state.version}…`):state.phase==='installing'?L('正在安装，完成后自动重新打开…','Installing; the app will reopen when ready…'):L('更新未完成','Update incomplete')}</p>
 {state.phase==='downloading'&&<><progress max={100} value={progress}/><small>{progress===undefined?`${((state.downloaded??0)/1048576).toFixed(1)} MB`:`${progress}%`}</small></>}

 </section>;
}

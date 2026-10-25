import {useEffect,useRef,useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {useTranslation} from 'react-i18next';
import {native} from './api';
import {useAccounts} from './AccountProvider';
import {useArbitrationRuns} from './useArbitrationRuns';
type Progress={id:string;bytes:number;runs:number;added:number;duplicates:number};
export default function ArbitrationDataTools(){
 const {scope,switching}=useAccounts(),a=useArbitrationRuns(),{i18n}=useTranslation(),en=i18n.language.startsWith('en'),L=(zh:string,english:string)=>en?english:zh;
 const [busy,setBusy]=useState(false),[progress,setProgress]=useState(0),[notice,setNotice]=useState(''),[error,setError]=useState('');const cancelled=useRef(false),job=useRef('');
 useEffect(()=>()=>{cancelled.current=true;if(job.current)void invoke('arbitration_import_cancel',{id:job.current}).catch(()=>{});},[scope]);
 async function cancel(){cancelled.current=true;if(job.current)await invoke('arbitration_import_cancel',{id:job.current});}
 async function importLog(file?:File){if(!file)return;cancelled.current=false;setBusy(true);setNotice('');setError('');setProgress(0);let id='';try{
  if(file.size>512*1024*1024)throw Error(L('日志超过 512MiB','Log exceeds 512MiB'));id=await invoke<string>('arbitration_import_begin',{expectedScope:scope});job.current=id;const decoder=new TextDecoder();
  for(let offset=0;offset<file.size;offset+=256*1024){if(cancelled.current)throw Error(L('已取消，未写入记录','Cancelled; no records saved'));const bytes=await file.slice(offset,offset+256*1024).arrayBuffer();const chunk=decoder.decode(bytes,{stream:offset+256*1024<file.size});await invoke('arbitration_import_chunk',{expectedScope:scope,id,chunk});setProgress(Math.min(100,Math.round((offset+bytes.byteLength)/file.size*100)));}
  if(cancelled.current)throw Error(L('已取消，未写入记录','Cancelled; no records saved'));const result=await invoke<Progress>('arbitration_import_finish',{expectedScope:scope,id});setNotice(L(`已读取 ${result.runs} 局，新增 ${result.added}，重复 ${result.duplicates}`,`${result.runs} runs; ${result.added} added, ${result.duplicates} duplicates`));a.refresh();
 }catch(e){setError(String(e));}finally{if(id)await invoke('arbitration_import_cancel',{id}).catch(()=>{});job.current='';setBusy(false);}}
 return <details className="settingsBackup" open><summary>{L('仲裁记录','Arbitration runs')}</summary><label className="settingRow"><span>{L('仲裁开始时自动打开实时窗口','Open live window when an arbitration begins')}</span><input type="checkbox" role="switch" checked={a.status.autoOpen} disabled={!a.canEdit||busy} onChange={e=>{void invoke('arbitration_set_auto_live',{enabled:e.target.checked}).then(a.refresh).catch(e=>setError(String(e)));}}/></label><div className="settingsBackupActions"><label className="settingsFile">{L('导入 EE.log','Import EE.log')}<input type="file" accept=".log,.txt" disabled={!native||busy||switching} onChange={e=>{void importLog(e.target.files?.[0]);e.target.value='';}}/></label><button disabled={!native||busy||switching} onClick={()=>{void invoke('export_data',{kind:'arbitration-json',expectedScope:scope}).catch(e=>setError(String(e)));}}>{L('导出仲裁记录','Export runs')}</button>{busy&&<><progress value={progress} max={100} aria-label={L('仲裁导入进度','Import progress')}/><span>{progress}%</span><button onClick={()=>void cancel().catch(e=>setError(String(e)))}>{L('取消','Cancel')}</button></>}</div>{notice&&<p role="status">{notice}</p>}{error&&<p role="alert">{error}</p>}</details>;
}

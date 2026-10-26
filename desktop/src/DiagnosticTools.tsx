import {useEffect,useState} from 'react';
import {useTranslation} from 'react-i18next';
import {invoke} from '@tauri-apps/api/core';
import {native} from './api';
import './diagnostics.css';
export default function DiagnosticTools(){
 const {i18n}=useTranslation(),en=i18n.language.startsWith('en'),L=(a:string,b:string)=>en?b:a;
 const [status,setStatus]=useState<{enabled:boolean;writeFailures:number}|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 useEffect(()=>{let live=true;if(native)void invoke<{enabled:boolean;writeFailures:number}>('diagnostics_log_status').then(s=>{if(live)setStatus(s);}).catch(()=>{});return()=>{live=false;};},[]);
 async function exportReport(){if(busy)return;setBusy(true);setMessage('');try{const path=await invoke<string|null>('diagnostics_export_report');if(path)setMessage(L('诊断报告已保存：','Report saved: ')+path);}catch(e){setMessage(String(e));}finally{setBusy(false);}}
 return <div className="aboutSection diagnosticsTools"><h3>{L('诊断与日志','Diagnostics & logs')}</h3><p>{L('记录错误编号、请求状态和异常。报告不包含密码、令牌或库存内容。','Record request status, error IDs and exceptions. Reports exclude passwords, tokens and inventory contents.')}</p>
 <div><button disabled={!native||busy} onClick={()=>void exportReport()}>{busy?L('导出中…','Exporting…'):L('导出诊断报告','Export diagnostic report')}</button><button disabled={!native||busy} onClick={()=>void invoke('diagnostics_open_logs').catch(e=>setMessage(String(e)))}>{L('打开日志目录','Open log folder')}</button><span>{status?(status.enabled&&status.writeFailures===0?L('本地日志已开启','Local logging enabled'):L('日志写入异常','Logging unavailable')):''}</span></div>{message&&<small role="status">{message}</small>}</div>;
}

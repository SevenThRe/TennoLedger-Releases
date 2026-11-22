import {useState} from 'react';
import {manualUpdateUrl,safeUpdateError,updateErrorSummary} from './updateDiagnostics';
export default function UpdateFailureNotice({error,en}:{error:unknown;en:boolean}){
 const [copyState,setCopyState]=useState('');
 async function copy(value:string){try{await navigator.clipboard.writeText(value);setCopyState(en?'Copied':'已复制');}catch{setCopyState(en?'Copy failed; select the text below':'复制失败，可选中下方文字复制');}}
 return <div className="updateFailureDetails" style={{minWidth:0,maxWidth:360}}><p role="alert">{updateErrorSummary(error,en)}</p><details><summary>{en?'Safe diagnostics':'脱敏诊断'}</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{safeUpdateError(error)}</pre><button onClick={()=>void copy(safeUpdateError(error))}>{en?'Copy diagnostics':'复制诊断'}</button></details><a href={manualUpdateUrl} target="_blank" rel="noopener noreferrer">{en?'Official full installer':'官方完整安装包'}</a><button onClick={()=>void copy(manualUpdateUrl)}>{en?'Copy download page':'复制下载页'}</button><small>{en?'Version 0.1.8 can be upgraded with the full installer.':'旧版 0.1.8 可使用完整安装包升级。'}</small><small role="status">{copyState}</small></div>;
}

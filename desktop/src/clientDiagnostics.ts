import {invoke} from '@tauri-apps/api/core';
import {native} from './api';
import {diagnosticFault} from './clientDiagnosticsModel';
let remaining=10,period=Date.now(),installed=false;
export function reportClientFault(kind:'window_error'|'unhandled_rejection'|'handled_error'|'updater',value:unknown,line?:number,column?:number){
 if(!native)return;if(Date.now()-period>60000){remaining=10;period=Date.now();}if(remaining--<=0)return;
 void invoke('diagnostics_client_event',{kind,code:diagnosticFault(value),line:line??null,column:column??null}).catch(()=>{});
}
export function installClientDiagnostics(){
 if(!native||installed)return;installed=true;
 window.addEventListener('error',e=>reportClientFault('window_error',e.error??e.message,e.lineno,e.colno));
 window.addEventListener('unhandledrejection',e=>reportClientFault('unhandled_rejection',e.reason));
}

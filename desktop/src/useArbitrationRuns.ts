import {useCallback,useEffect,useRef,useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {native} from './api';
import {useAccounts} from './AccountProvider';
import {emptyCapture,type ArbitrationRun,type CaptureStatus,type RunFilter,type RunPage} from './arbitrationRunModel';
export function useArbitrationRuns(filter?:RunFilter){
 const {scope,ready,switching}=useAccounts(),[status,setStatus]=useState<CaptureStatus>(emptyCapture),[page,setPage]=useState<RunPage>({runs:[],total:0}),[error,setError]=useState(''),[loading,setLoading]=useState(false),[revision,setRevision]=useState(0);
 const refresh=useCallback(()=>setRevision(n=>n+1),[]),generation=useRef(0),previousScope=useRef(scope);
 const filterKey=JSON.stringify(filter);
 useEffect(()=>{
  if(!native||!ready||switching){previousScope.current=scope;setStatus(emptyCapture);setPage({runs:[],total:0});return;}
  if(previousScope.current!==scope){previousScope.current=scope;setStatus(emptyCapture);setPage({runs:[],total:0});}
  let alive=true,pending=false,again=false;const request=++generation.current;
  setLoading(true);
  const read=async()=>{if(pending){again=true;return;}pending=true;try{const [s,p]=await Promise.all([invoke<CaptureStatus>('arbitration_capture_status',{expectedScope:scope}),filter?invoke<RunPage>('arbitration_history',{expectedScope:scope,filter}):Promise.resolve(null)]);if(alive&&request===generation.current){setStatus(s);if(p)setPage(p);setError('');}}catch(e){if(alive)setError(String(e));}finally{pending=false;if(alive&&request===generation.current){setLoading(false);if(again){again=false;void read();}}}};
  void read();const timer=setInterval(()=>void read(),2000);const off=listen('arbitration-updated',()=>void read());
  return()=>{alive=false;generation.current++;clearInterval(timer);void off.then(fn=>fn());};
 },[scope,ready,switching,filterKey,revision]);
 return {scope,status,page,error,loading,refresh,canEdit:native&&ready&&!switching};
}
export async function loadRun(scope:string,id:string){return invoke<ArbitrationRun>('arbitration_run',{expectedScope:scope,id});}

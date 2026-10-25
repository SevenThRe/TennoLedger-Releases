import {useCallback,useEffect,useRef,useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {native} from './api';
import {useAccounts} from './AccountProvider';
import {readRunLibrary} from './arbitrationRunView';
import type {ArbitrationRun,RunPage} from './arbitrationRunModel';
export function useArbitrationLibrary(){
 const {scope,ready,switching}=useAccounts(),[data,setData]=useState<{scope:string;runs:ArbitrationRun[]}>({scope:'',runs:[]}),[loading,setLoading]=useState(false),[error,setError]=useState(''),[revision,setRevision]=useState(0),generation=useRef(0);
 const refresh=useCallback(()=>setRevision(n=>n+1),[]);
 useEffect(()=>{const request=++generation.current;let alive=true,pending=false,again=false;
  setData({scope:'',runs:[]});setError('');setLoading(false);if(!native||!ready||switching)return;
  const current=()=>alive&&request===generation.current;
  const read=async()=>{if(pending){again=true;return;}pending=true;setLoading(true);try{const rows=await readRunLibrary(offset=>invoke<RunPage>('arbitration_history',{expectedScope:scope,filter:{search:'',status:'',favoritesOnly:false,offset}}),current);if(rows&&current()){setData({scope,runs:rows});setError('');}}catch(e){if(current())setError(String(e));}finally{pending=false;if(current()){setLoading(false);if(again){again=false;void read();}}}};
  void read();const off=listen('arbitration-updated',()=>void read());const timer=setInterval(()=>void read(),15000);
  return()=>{alive=false;generation.current++;clearInterval(timer);void off.then(stop=>stop());};
 },[scope,ready,switching,revision]);
 return {runs:data.scope===scope&&ready&&!switching?data.runs:[],loading,error,refresh};
}

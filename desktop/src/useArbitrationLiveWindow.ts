import {useCallback,useEffect,useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {native} from './api';
import {useAccounts} from './AccountProvider';
import {emptyCapture,type CaptureStatus} from './arbitrationRunModel';

const syncEvent='myframe-arbitration-live-sync';

export type ArbitrationLiveWindowState={
 liveWindowVisible:boolean;
 captureCode:string;
 recording:boolean;
 autoOpen:boolean;
 busy:boolean;
 error:string;
 refresh:()=>void;
 openLive:()=>Promise<void>;
 hideLive:()=>Promise<void>;
 setAutoOpen:(enabled:boolean)=>Promise<void>;
};

export function useArbitrationLiveWindow():ArbitrationLiveWindowState{
 const {scope,ready,switching}=useAccounts();
 const [status,setStatus]=useState<CaptureStatus>(emptyCapture);
 const [optimisticVisible,setOptimisticVisible]=useState<boolean|null>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [revision,setRevision]=useState(0);

 const refresh=useCallback(()=>setRevision(n=>n+1),[]);

 useEffect(()=>{
  setOptimisticVisible(null);
  setError('');
  if(!native||!ready||switching){
   setStatus(emptyCapture);
   return;
  }
  let alive=true,pending=false;
  const read=async()=>{
   if(pending)return;
   pending=true;
   try{
    const next=await invoke<CaptureStatus>('arbitration_capture_status',{expectedScope:scope});
    if(alive){
     setStatus(next);
     setOptimisticVisible(null);
     setError('');
    }
   }catch(e){
    if(alive)setError(String(e));
   }finally{
    pending=false;
   }
  };
  void read();
  const off=listen('arbitration-updated',()=>void read());
  const onFocus=()=>void read();
  const onLocal=()=>void read();
  window.addEventListener('focus',onFocus);
  window.addEventListener(syncEvent,onLocal);
  return()=>{
   alive=false;
   void off.then(fn=>fn());
   window.removeEventListener('focus',onFocus);
   window.removeEventListener(syncEvent,onLocal);
  };
 },[scope,ready,switching,revision]);

 const openLive=useCallback(async()=>{
  if(!native||busy)return;
  setBusy(true);
  setError('');
  setOptimisticVisible(true);
  try{
   await invoke('arbitration_open_live');
   window.dispatchEvent(new Event(syncEvent));
  }catch(e){
   setOptimisticVisible(null);
   setError(String(e));
  }finally{
   setBusy(false);
  }
 },[busy]);

 const hideLive=useCallback(async()=>{
  if(!native||busy)return;
  setBusy(true);
  setError('');
  setOptimisticVisible(false);
  try{
   await invoke('arbitration_hide_live');
   window.dispatchEvent(new Event(syncEvent));
  }catch(e){
   setOptimisticVisible(null);
   setError(String(e));
  }finally{
   setBusy(false);
  }
 },[busy]);

 const setAutoOpen=useCallback(async(enabled:boolean)=>{
  if(!native||!ready||switching||busy)return;
  setBusy(true);
  setError('');
  try{
   await invoke('arbitration_set_auto_live',{enabled});
   setStatus(prev=>({...prev,autoOpen:enabled}));
   window.dispatchEvent(new Event(syncEvent));
  }catch(e){
   setError(String(e));
  }finally{
   setBusy(false);
  }
 },[busy,ready,switching]);

 const liveWindowVisible=optimisticVisible??Boolean(status.liveWindowVisible);

 return {
  liveWindowVisible,
  captureCode:status.code,
  recording:status.current?.status==='recording',
  autoOpen:status.autoOpen,
  busy,
  error,
  refresh,
  openLive,
  hideLive,
  setAutoOpen,
 };
}

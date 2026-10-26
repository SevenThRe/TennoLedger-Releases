import {useEffect} from 'react';
import {availableMonitors,getCurrentWindow,PhysicalPosition} from '@tauri-apps/api/window';
import {native} from './api';
import {restoreMiniPosition} from './arbitrationWindowModel';
const key='tennoledger.arbitration-mini.position.v1';
export function useArbitrationWindow(onError:(message:string)=>void){
 useEffect(()=>{if(!native)return;let disposed=false,unlisten:(()=>void)|undefined;const win=getCurrentWindow();
  void (async()=>{const text=localStorage.getItem(key);if(text){let saved;try{saved=JSON.parse(text);}catch{localStorage.removeItem(key);}if(saved){const monitors=await availableMonitors();const point=restoreMiniPosition(saved,monitors.map(m=>({x:m.workArea.position.x,y:m.workArea.position.y,width:m.workArea.size.width,height:m.workArea.size.height,scale:m.scaleFactor})));if(point&&!disposed)await win.setPosition(new PhysicalPosition(point.x,point.y));}}
   if(disposed)return;unlisten=await win.onMoved(({payload})=>{try{localStorage.setItem(key,JSON.stringify({x:payload.x,y:payload.y}));}catch(e){onError(String(e));}});if(disposed)unlisten();
  })().catch(e=>{if(!disposed)onError(String(e));});return()=>{disposed=true;unlisten?.();};
 },[onError]);
}

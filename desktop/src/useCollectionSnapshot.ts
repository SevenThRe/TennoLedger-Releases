import type {ShardFrame} from './archonModel';
import {useEffect,useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {native} from './api';
import {useAccounts} from './AccountProvider';
import {rivenInventoryRefresh as latestRefresh} from './rivenInventoryRefresh';
import type {StandingSnapshot} from './standingModel';
import type {VendorSnapshot} from './vendorModel';
export type LiveCollection={unrankedEquipmentCounts?:Record<string,number|null>|null;accountScope?:string|null;archonShardFrames?:ShardFrame[]|null;pendingRecipes?:Record<string,number>|null;masteryAccount?:{ranksComplete?:boolean}|null;standing?:StandingSnapshot|null;vendors?:VendorSnapshot[]|null;favorites?:string[];ranks?:Record<string,number>;helminth?:string[]|null;capturedAt:string;complete:boolean;counts:Record<string,number>;incarnon?:string[]|null;credits?:number|null;playerProfile?:{platinum?:number|null;endo?:number|null;ducats?:number|null}};
export function useCollectionSnapshot(){
 const {scope}=useAccounts();const [current,setCurrent]=useState<{scope:string;snapshot:LiveCollection|null}>(()=>({scope,snapshot:null}));const setSnapshot=(snapshot:LiveCollection|null)=>setCurrent({scope,snapshot});
 useEffect(()=>{
  let alive=true;
  const reader=latestRefresh(()=>invoke<LiveCollection|null>('load_collection'),setSnapshot,()=>{},()=>{});
  const refresh=()=>{if(native)void reader.refresh();};
  if(!native&&import.meta.env.DEV&&['modules','shards','delta'].includes(new URLSearchParams(location.search).get('qa')??''))void fetch(new URLSearchParams(location.search).get('qa')==='shards'?'/qa/shards-snapshot.json':new URLSearchParams(location.search).get('qa')==='delta'?'/qa/workshop-snapshot.json':'/qa/modules-snapshot.json').then(r=>{if(!r.ok)throw Error('QA snapshot unavailable');return r.json();}).then(value=>{if(alive)setSnapshot(value);}).catch(()=>{});
  refresh();
  const off=native?listen('collection-updated',refresh):null;
  window.addEventListener('myframe-collection-updated',refresh);
  return()=>{alive=false;reader.dispose();window.removeEventListener('myframe-collection-updated',refresh);void off?.then(f=>f());};
 },[scope]);
 return current.scope===scope?current.snapshot:null;
}
export function ownsCircuitReward(snapshot:LiveCollection|null,name:string,id:string|undefined,steel:boolean):boolean{
 if(!snapshot)return false;
 if(!steel)return !!id&&(snapshot.counts[id]??0)>0;
 const key=name.replace(/[^a-z0-9]/gi,'').toLowerCase()+'incarnonunlocker';
 return Object.entries(snapshot.counts).some(([id,n])=>n>0&&id.includes('/IncarnonAdapters/')&&id.split('/').at(-1)?.toLowerCase()===key)||!!id&&!!snapshot.incarnon?.includes(id);
}

import {missionZh} from './worldModel';
import {useEffect,useMemo,useState} from 'react';
import {dropLocationTranslator,type LocationData} from './dropLocation';
let pending:Promise<LocationData>|undefined;
function load(){return pending??=fetch('/world-nodes.json').then(r=>{if(!r.ok)throw Error('Node labels unavailable');return r.json() as Promise<LocationData>;}).catch(e=>{pending=undefined;throw e;});}
export function useDropLocation(en:boolean){
 const [data,setData]=useState<LocationData>({nodes:{}});
 useEffect(()=>{let live=true;void load().then(d=>{if(live)setData(d);}).catch(()=>{});return()=>{live=false;};},[]);
 return useMemo(()=>dropLocationTranslator(data,en,missionZh),[data,en]);
}

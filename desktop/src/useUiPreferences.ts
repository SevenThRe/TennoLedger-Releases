import {useEffect,useState} from 'react';
import {normalizeZoom,zoomKey,appearanceKey,readAppearance,type Appearance} from './settingsModel';
function stored(key:string){try{return localStorage.getItem(key);}catch{return null;}}
function useStoredPreference<T>(key:string,read:(raw:string|null)=>T,serialize:(value:T)=>string){
 const [value,setValue]=useState(()=>read(stored(key)));
 useEffect(()=>{const sync=()=>setValue(read(stored(key)));const storage=(e:StorageEvent)=>{if(e.key===key||e.key===null)sync();};window.addEventListener(key,sync);window.addEventListener('storage',storage);return()=>{window.removeEventListener(key,sync);window.removeEventListener('storage',storage);};},[key]);
 return [value,(next:T)=>{localStorage.setItem(key,serialize(next));setValue(next);window.dispatchEvent(new Event(key));}] as const;
}
export const useZoom=()=>useStoredPreference(zoomKey,normalizeZoom,String);
export const useAppearance=()=>useStoredPreference<Appearance>(appearanceKey,readAppearance,JSON.stringify);

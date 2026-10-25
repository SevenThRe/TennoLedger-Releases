import {useEffect,useState,useRef} from 'react';
import {listen,emit} from '@tauri-apps/api/event';
import {invoke} from '@tauri-apps/api/core';
import {native} from './api';
import {themeKey,readTheme,parseTheme,themeProperties,themeSlots,themeLibraryKey,readThemeLibrary,addThemePreset,parseThemeText,serializeAlecaTheme,type Theme} from './themeModel';
const propertyNames=['background','panel','raised','border','text','muted','accent','accentText'].map(k=>'--theme-'+k.replace(/[A-Z]/g,v=>'-'+v.toLowerCase())).concat(themeSlots.map(slot=>'--'+slot));
export function useTheme(){const [theme,setTheme]=useState<Theme|null>(()=>{try{return readTheme(localStorage.getItem(themeKey));}catch{return null;}}),[error,setError]=useState('');
 useEffect(()=>{const reload=()=>{try{setTheme(readTheme(localStorage.getItem(themeKey)));}catch(e){setError(String(e));}};const storage=(e:StorageEvent)=>{if(e.key===themeKey||e.key===null)reload();};window.addEventListener(themeKey,reload);window.addEventListener('storage',storage);let live=true;const off=native?listen<Theme|null>('theme-updated',event=>{if(live){try{setTheme(event.payload===null?null:parseTheme(event.payload));}catch{setError('收到的主题无效');}}}):null;return()=>{live=false;window.removeEventListener(themeKey,reload);window.removeEventListener('storage',storage);void off?.then(f=>f()).catch(()=>{});};},[]);
 return [theme,(next:Theme|null)=>{try{const canonical=next?parseTheme(next):null;if(canonical)localStorage.setItem(themeKey,JSON.stringify(canonical));else localStorage.removeItem(themeKey);setTheme(canonical);setError('');window.dispatchEvent(new Event(themeKey));if(native)void emit('theme-updated',canonical).catch(()=>setError('主题已保存，覆盖层同步暂不可用'));}catch(e){setError(String(e));throw e;}},error] as const;
}
export function ThemeRuntime({overlay=false}:{overlay?:boolean}){const [theme]=useTheme();useEffect(()=>{const properties=themeProperties(theme,overlay);document.documentElement.dataset.customTheme=String(Object.keys(properties).length>0);for(const name of propertyNames){if(properties[name])document.documentElement.style.setProperty(name,properties[name]);else document.documentElement.style.removeProperty(name);}},[theme,overlay]);return null;}
const migratedKey='myframe.theme.native-library.migrated.v1';
type NativeLibrary={files:{fileName:string;content:string}[];errors:{fileName:string;error:string}[]};
export function useThemeLibrary(){
 const [library,setLibrary]=useState<Theme[]>(()=>{try{return readThemeLibrary(localStorage.getItem(themeLibraryKey));}catch{return [];}}),[error,setError]=useState(''),[busy,setBusy]=useState(false),current=useRef(library),files=useRef(new Map<string,string[]>()),queue=useRef(Promise.resolve()),pending=useRef(0),alive=useRef(true);current.current=library;
 const identity=(theme:Theme)=>theme.name+'\0'+theme.author;
 const persist=(next:Theme[])=>{localStorage.setItem(themeLibraryKey,JSON.stringify(next));current.current=next;if(alive.current)setLibrary(next);if(!native)window.dispatchEvent(new Event(themeLibraryKey));};
 const loadNative=async()=>{
  let result=await invoke<NativeLibrary>('theme_presets_list');
  if(localStorage.getItem(migratedKey)!=='true'){
   const known=new Set(result.files.map(file=>{try{return identity(parseThemeText(file.content));}catch{return '';}}));
   for(const theme of current.current){if(!known.has(identity(theme))){await invoke('theme_presets_save',{preset:JSON.parse(serializeAlecaTheme(theme))});known.add(identity(theme));}}
   localStorage.setItem(migratedKey,'true');result=await invoke<NativeLibrary>('theme_presets_list');
  }
  let next:Theme[]=[];const mapping=new Map<string,string[]>(),warnings=result.errors.map(value=>value.fileName+': '+value.error);
  for(const file of result.files){try{const theme=parseThemeText(file.content);next=addThemePreset(next,theme);mapping.set(identity(theme),[...mapping.get(identity(theme))??[],file.fileName]);}catch{warnings.push(file.fileName+': Invalid theme');}}
  files.current=mapping;persist(next);if(alive.current)setError(warnings.join('；'));
 };
 const enqueue=<T,>(action:()=>Promise<T>):Promise<T>=>{pending.current++;if(alive.current)setBusy(true);const task=queue.current.catch(()=>{}).then(action);queue.current=task.then(()=>{},()=>{});return task.catch(e=>{if(alive.current)setError(String(e));throw e;}).finally(()=>{pending.current--;if(alive.current)setBusy(pending.current>0);});};
 const refresh=()=>enqueue(async()=>{if(native)await loadNative();else{const next=readThemeLibrary(localStorage.getItem(themeLibraryKey));current.current=next;if(alive.current){setLibrary(next);setError('');}}});
 useEffect(()=>{alive.current=true;if(native)void refresh().catch(()=>{});const load=()=>{if(!native){const next=readThemeLibrary(localStorage.getItem(themeLibraryKey));current.current=next;setLibrary(next);}};const storage=(event:StorageEvent)=>{if(event.key===themeLibraryKey||event.key===null)load();};window.addEventListener(themeLibraryKey,load);window.addEventListener('storage',storage);return()=>{alive.current=false;window.removeEventListener(themeLibraryKey,load);window.removeEventListener('storage',storage);};},[]);
 return {library,error,busy,refresh,openDirectory:()=>enqueue(async()=>{if(!native)throw Error('请在桌面版打开主题目录');await invoke('theme_presets_open');}),
  add:(theme:Theme)=>enqueue(async()=>{const clean=parseTheme(theme);if(native){await invoke('theme_presets_save',{preset:JSON.parse(serializeAlecaTheme(clean))});await loadNative();}else{persist(addThemePreset(current.current,clean));if(alive.current)setError('');}}),
  remove:(name:string,author:string)=>enqueue(async()=>{if(native){for(const fileName of files.current.get(name+'\0'+author)??[])await invoke('theme_presets_delete',{fileName});await loadNative();}else{persist(current.current.filter(t=>t.name!==name||t.author!==author));if(alive.current)setError('');}})
 };
}

import {createContext,useCallback,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {native} from './api';
import {legacyScope,parseAccountProfiles,validAccountScope,type AccountProfile} from './accountScopeModel';
const preview:AccountProfile[]=[{accountScope:legacyScope,name:null,capturedAt:null,active:true,unassigned:true}];
const accountQA=import.meta.env.DEV&&!native&&new URLSearchParams(location.search).get('qa')==='accounts';
const fixtures:AccountProfile[]=[{accountScope:'acct-v1-'+'a'.repeat(64),name:'QA · Alpha',capturedAt:'2026-10-24T08:00:00Z',active:true,unassigned:false},{accountScope:'acct-v1-'+'b'.repeat(64),name:'QA · Beta',capturedAt:'2026-10-24T09:00:00Z',active:false,unassigned:false},{...preview[0],active:false}];
const Context=createContext({scope:legacyScope,profiles:preview,ready:!native,switching:false,error:'',refresh:async()=>{},select:async(_scope:string)=>{}});
export function useAccounts(){return useContext(Context);}
export default function AccountProvider({children}:{children:ReactNode}){
 const [profiles,setProfiles]=useState<AccountProfile[]>(accountQA?fixtures:preview),[scope,setScope]=useState(accountQA?fixtures[0].accountScope:legacyScope),[ready,setReady]=useState(!native),[switching,setSwitching]=useState(false),[error,setError]=useState('');
 const generation=useRef(0),pending=useRef(false),alive=useRef(true),scopeRef=useRef(scope);scopeRef.current=scope;
 const refresh=useCallback(async()=>{if(!native||pending.current)return;const request=++generation.current;try{const next=parseAccountProfiles(await invoke('account_profiles'));if(alive.current&&request===generation.current){setProfiles(next);setScope(next.find(p=>p.active)!.accountScope);setReady(true);setError('');}}catch(e){if(alive.current&&request===generation.current)setError(String(e));}},[]);
 useEffect(()=>{alive.current=true;void refresh();const changed=()=>void refresh();window.addEventListener('myframe-collection-updated',changed);const off=native?Promise.all(['collection-updated','ledger-updated'].map(name=>listen(name,changed))):null;return()=>{alive.current=false;generation.current++;window.removeEventListener('myframe-collection-updated',changed);void off?.then(list=>list.forEach(stop=>stop()));};},[refresh]);
 const select=useCallback(async(next:string)=>{
  if(pending.current)return;if(!validAccountScope(next))throw Error('账号资料无效');pending.current=true;generation.current++;setSwitching(true);setError('');
  try{if(native)await invoke('select_account',{scope:next,expectedScope:scopeRef.current});else if(!accountQA)throw Error('请在桌面程序切换账号资料');
   if(!alive.current)return;setScope(next);setProfiles(old=>old.map(p=>({...p,active:p.accountScope===next})));setReady(true);window.dispatchEvent(new Event('myframe-account-changed'));window.dispatchEvent(new Event('myframe-collection-updated'));window.dispatchEvent(new Event('trades-updated'));
  }catch(e){if(alive.current)setError(String(e));throw e;}finally{pending.current=false;if(alive.current){setSwitching(false);void refresh();}}
 },[refresh]);
 return <Context.Provider value={{scope,profiles,ready,switching,error,refresh,select}}>{children}</Context.Provider>;
}

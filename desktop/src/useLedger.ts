import {useEffect,useRef,useState} from 'react';
import {empty,loadLedger,native,type Ledger} from './api';
import {listen} from '@tauri-apps/api/event';
import {rivenInventoryRefresh} from './rivenInventoryRefresh';

export function useLedger(page:string,scope='legacy-unassigned'){
 const blank:Ledger={data:empty,stats:{revenue:0,expenses:0,netFlow:0,count:0,items:[]}};
 const [current,setCurrent]=useState<{scope:string;ledger:Ledger}>(()=>({scope,ledger:blank}));
 const [error,setError]=useState(''),[loading,setLoading]=useState(false);
 const reader=useRef<ReturnType<typeof rivenInventoryRefresh<Ledger>>|null>(null);
 useEffect(()=>{
  const active=rivenInventoryRefresh(loadLedger,value=>setCurrent({scope,ledger:value}),setLoading,setError);reader.current=active;void active.refresh();
  const refresh=()=>{void active.refresh();};
  window.addEventListener('trades-updated',refresh);
  const off=native?listen('ledger-updated',refresh):null;
  return()=>{void off?.then(unlisten=>unlisten());active.dispose();if(reader.current===active)reader.current=null;window.removeEventListener('trades-updated',refresh);};
 },[scope]);
 useEffect(()=>{void reader.current?.refresh();},[page]);
 return {...(current.scope===scope?current.ledger:blank),error,loading,refresh:()=>reader.current?.refresh()??Promise.resolve()};
}

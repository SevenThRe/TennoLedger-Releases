import {useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {native} from './api';
import {wikiUrl} from './wiki';
export default function WikiLinks({name,zh}:{name:string;zh?:string}){
 const [error,setError]=useState('');
 return <div className="wikiLinks">{(['english','huiji'] as const).map(provider=><a key={provider} href={wikiUrl(provider,name,zh)} target="_blank" rel="noreferrer" onClick={e=>{if(native){e.preventDefault();setError('');void invoke('open_wiki',{url:wikiUrl(provider,name,zh)}).catch(e=>setError(String(e)));}}}>{provider==='huiji'?'灰机 Wiki':'英文 Wiki'} ↗</a>)}{error&&<span role="alert">{error}</span>}</div>;
}

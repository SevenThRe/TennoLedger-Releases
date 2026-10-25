import {useEffect,useState} from 'react';
import {getVersion} from '@tauri-apps/api/app';
import {native} from './api';
import metadata from '../package.json';
export default function AppVersion(){
 const [version,setVersion]=useState(metadata.version);
 useEffect(()=>{if(native)void getVersion().then(setVersion).catch(()=>{});},[]);
 return <small>v{version} · Windows</small>;
}

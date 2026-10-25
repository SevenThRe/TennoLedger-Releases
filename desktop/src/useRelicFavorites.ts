import {useEffect,useState} from 'react';
import {parseFavorites,serializeFavorites} from './relicExtrasModel';
import {toggleRelicFavorite,type FavoriteRelic} from './relicFavorites';
const key='myframe.relic.favorites',changed='myframe-relic-favorites-changed';
function read(){return parseFavorites(localStorage.getItem(key));}
export function useRelicFavorites(){
 const [favorites,setFavorites]=useState<string[]>(()=>{try{return read();}catch{return [];}});
 const [favoriteError,setError]=useState('');
 useEffect(()=>{const reload=()=>{try{setFavorites(read());setError('');}catch{setError('收藏读取失败');}};const storage=(e:StorageEvent)=>{if(e.key===key||e.key===null)reload();};window.addEventListener(changed,reload);window.addEventListener('storage',storage);return()=>{window.removeEventListener(changed,reload);window.removeEventListener('storage',storage);};},[]);
 function toggleFavorite(relic:FavoriteRelic,variants:FavoriteRelic[]){
  try{const next=toggleRelicFavorite(read(),relic,variants);localStorage.setItem(key,serializeFavorites(next));setFavorites(next);setError('');window.dispatchEvent(new Event(changed));}
  catch{setError('收藏保存失败');}
 }
 return {favorites,toggleFavorite,favoriteError};
}

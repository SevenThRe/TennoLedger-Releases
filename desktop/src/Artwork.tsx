import {useState} from 'react';
import {artworkSources,type ImageItem} from './artworkModel';
export default function Artwork({item}:{item?:ImageItem}){
 const sources=artworkSources(item),fallback=sources.at(-1)!;
 const [failed,setFailed]=useState<string[]>([]);
 const src=sources.find(s=>!failed.includes(s))??fallback;
 return <img key={item?.id} data-artwork-kind={item?.category==='mod'?'mod-card':undefined} loading="lazy" src={src} alt="" onError={()=>setFailed(old=>old.includes(src)?old:[...old,src])}/>;
}

import {useEffect,useRef,useState,type RefObject} from 'react';
import {native} from './api';
import {loadUpgradeBook,rankQuotes} from './upgradeQuotes';
import {orderLowest} from './marketModel';
import type {ChangeDisplayRow,ChangeQuote} from './inventoryChangesModel';
export default function InventoryChangeQuote({row,slug,platform,en,viewport,onQuote}:{row:ChangeDisplayRow;slug?:string;platform:string;en:boolean;viewport:RefObject<HTMLDivElement|null>;onQuote:(key:string,quote:ChangeQuote)=>void}){
 const ref=useRef<HTMLDivElement>(null),[visible,setVisible]=useState(false),[result,setResult]=useState<ChangeQuote|null>(null),[error,setError]=useState('');
 const publish=useRef(onQuote);publish.current=onQuote;
 const valid=!!slug&&(!row.upgraded||row.rank!==null),requestKey=JSON.stringify([slug,platform,row.rank,row.key]);
 useEffect(()=>{if(!ref.current)return;const observer=new IntersectionObserver(entries=>setVisible(entries.some(e=>e.isIntersecting)),{root:viewport.current});observer.observe(ref.current);return()=>observer.disconnect();},[viewport]);
 useEffect(()=>{setResult(null);setError('');if(!native||!visible||!valid||!slug)return;let live=true;void loadUpgradeBook(slug,platform).then(book=>{if(!live)return;const price=row.upgraded?rankQuotes(book.orders,row.rank).sell:orderLowest(book.orders,{});const value={price,fetchedAt:book.fetchedAt,platform};setResult(value);publish.current(row.key,value);}).catch(error=>{if(live)setError(String(error));});return()=>{live=false;};},[requestKey,visible,valid]);
 return <div ref={ref} className="inventoryChangePrice" title={error||(!valid?(en?'Rank or market identity unknown':'等级或市场标识待核实'):result?`${platform.toUpperCase()} · ${row.rank!==null?(en?'rank ':'等级 ')+row.rank+' · ':''}${new Date(result.fetchedAt).toLocaleString()}`:en?'Load the quote when this row is visible':'条目可见时读取报价')}><span>{en?'Price each':'单件价格'}</span><strong>{result?.price==null||result.price<=0?'—':result.price.toLocaleString(en?'en':'zh-CN',{maximumFractionDigits:1})}<img src="/reference/ui/platinum.png" alt=""/></strong>{error&&<small role="status">{en?'Unavailable':'暂不可用'}</small>}</div>;
}

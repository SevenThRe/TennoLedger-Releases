import {useEffect,useRef,useState} from 'react';
export type TradingCategory=readonly [id:string,icon:string,label:string];
/** Same primary categories and More flyout as the shipped trading toolbars. */
export default function TradingCategories({rows,value,onChange,en}:{rows:readonly TradingCategory[];value:string;onChange:(value:string)=>void;en:boolean}){
 const [open,setOpen]=useState(false),root=useRef<HTMLDivElement>(null);
 useEffect(()=>{const outside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setOpen(false);};document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside);},[]);
 const button=([id,icon,label]:TradingCategory,menu=false)=><button type="button" key={id} role={menu?'menuitemradio':undefined} aria-checked={menu?value===id:undefined} aria-pressed={menu?undefined:value===id} className={value===id?'selected':''} onClick={()=>{onChange(id);setOpen(false);}}><img src={'/reference/ui/'+icon+'.png'} alt=""/><span>{label}</span></button>;
 const extra=rows.slice(5),active=extra.find(row=>row[0]===value);
 return <div className="tradingCategories" ref={root} onKeyDown={e=>{if(e.key==='Escape'){setOpen(false);e.stopPropagation();}}}>{rows.slice(0,5).map(row=>button(row))}{extra.length>0&&<div className="tradingCategoryMore" onMouseEnter={()=>setOpen(true)} onMouseLeave={()=>{if(!root.current?.contains(document.activeElement))setOpen(false);}}><button type="button" className={active?'selected':''} aria-haspopup="menu" aria-expanded={open} onClick={()=>setOpen(value=>!value)}>{active?.[2]??(en?'More':'更多')}<span aria-hidden="true">⌄</span></button>{open&&<div role="menu" aria-label={en?'More categories':'更多分类'}>{extra.map(row=>button(row,true))}</div>}</div>}</div>;
}

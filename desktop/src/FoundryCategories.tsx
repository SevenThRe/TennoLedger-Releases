import './layoutCorrections.css';
import {useEffect,useRef,useState} from 'react';
export default function FoundryCategories({category,onChange,en}:{category:string;onChange:(id:string)=>void;en:boolean}){
 const [open,setOpen]=useState(false),root=useRef<HTMLDivElement>(null);
 useEffect(()=>{const close=(e:PointerEvent)=>{if(!root.current?.contains(e.target as Node))setOpen(false);};document.addEventListener('pointerdown',close);return()=>document.removeEventListener('pointerdown',close);},[]);
 const rows=[['all','全部','All','infinity.png'],['warframe','战甲','Warframe','warframe.png'],['primary','主武器','Primary','primary.png'],['secondary','副武器','Secondary','pistol.png'],['melee','近战','Melee','melee.png'],['modular','模块化','Modular','Modular.png'],['archwing','Archwing','Archwing','arch.png'],['pet','同伴','Companions','companion.png']];
 const button=(row:string[])=><button key={row[0]} aria-pressed={category===row[0]} className={category===row[0]?'selected':''} onClick={()=>{onChange(row[0]);setOpen(false);}}><img src={'/reference/ui/'+row[3]} alt=""/>{row[en?2:1]}</button>;
 return <div className="categoryTabs foundryCategories" ref={root} onKeyDown={e=>{if(e.key==='Escape'){setOpen(false);e.stopPropagation();}}}>{rows.slice(0,6).map(button)}<div className="foundryMore"><button aria-expanded={open} aria-haspopup="menu" onClick={()=>setOpen(v=>!v)}>{category==='archwing'||category==='pet'?rows.find(row=>row[0]===category)![en?2:1]:en?'More':'更多'}⌄</button>{open&&<div role="menu">{rows.slice(6).map(button)}</div>}</div></div>;
}

import {useEffect,useId,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {CheckIcon,ChevronDownIcon} from '@radix-ui/react-icons';
import './themeSelect.css';

/** Theme-owned popup: avoids OS select colours and clipping by scroll panels. */
export default function ThemeSelect({label,value,options,onChange}:{label:string;value:string;options:readonly (readonly string[])[];onChange:(value:string)=>void}){
 const id=useId(),trigger=useRef<HTMLButtonElement>(null),menu=useRef<HTMLDivElement>(null);
 const [open,setOpen]=useState(false),[position,setPosition]=useState({left:0,top:0,width:170,maxHeight:320});
 const close=(focus=false)=>{setOpen(false);if(focus)trigger.current?.focus();};
 useLayoutEffect(()=>{
  if(!open)return;
  const place=()=>{const r=trigger.current?.getBoundingClientRect();if(!r)return;const width=Math.min(Math.max(170,r.width),window.innerWidth-16),height=Math.min(options.length*38+12,320),below=window.innerHeight-r.bottom-12,above=r.top-12;const up=below<height&&above>below;setPosition({width,left:Math.max(8,Math.min(r.right-width,window.innerWidth-width-8)),top:up?Math.max(8,r.top-height-5):r.bottom+5,maxHeight:Math.max(40,up?above:below)});};
  place();window.addEventListener('resize',place);window.addEventListener('scroll',place,true);
  return()=>{window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true);};
 },[open,options.length]);
 useEffect(()=>{if(!open)return;menu.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();const outside=(e:PointerEvent)=>{if(!trigger.current?.contains(e.target as Node)&&!menu.current?.contains(e.target as Node))setOpen(false);};document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside);},[open]);
 return <><button ref={trigger} type="button" className="themeSelectTrigger" aria-label={label} aria-haspopup="menu" aria-expanded={open} aria-controls={open?id:undefined} onClick={()=>setOpen(!open)} onKeyDown={e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();setOpen(true);}}}><span>{options.find(o=>o[0]===value)?.[1]??value}</span><ChevronDownIcon/></button>{open&&createPortal(<div ref={menu} id={id} className="themeSelectMenu" role="menu" aria-label={label} style={position} onKeyDown={e=>{
  const buttons=Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('button')??[]),index=buttons.indexOf(document.activeElement as HTMLButtonElement);
  if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close(true);}else if(e.key==='Tab'){e.preventDefault();close(true);}else if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();buttons[e.key==='Home'?0:e.key==='End'?buttons.length-1:(index+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();}
 }}>{options.map(([key,text])=><button type="button" role="menuitemradio" aria-checked={value===key} key={key} onClick={()=>{onChange(key);close(true);}}><span>{text}</span>{value===key&&<CheckIcon/>}</button>)}</div>,document.body)}</>;
}

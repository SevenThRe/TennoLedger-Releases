import {useEffect,useId,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {CheckIcon,ChevronDownIcon} from '@radix-ui/react-icons';
import './themeSelect.css';

/** Theme-owned popup: avoids OS select colours and clipping by scroll panels. */
export default function ThemeSelect({label,value,options,onChange,disabled=false}:{label:string;value:string;options:readonly (readonly string[])[];onChange:(value:string)=>void;disabled?:boolean}){
 const id=useId(),trigger=useRef<HTMLButtonElement>(null),menu=useRef<HTMLDivElement>(null);
 const [open,setOpen]=useState(false),[position,setPosition]=useState({left:0,top:0,minWidth:120,maxWidth:320,maxHeight:320});
 const close=(focus=false)=>{setOpen(false);if(focus)trigger.current?.focus();};
 useLayoutEffect(()=>{
  if(!open)return;
  const place=()=>{
   const r=trigger.current?.getBoundingClientRect(),el=menu.current;
   if(!r||!el)return;
   const maxWidth=Math.max(120,window.innerWidth-16);
   const minWidth=Math.min(r.width,maxWidth);
   const estHeight=Math.min(options.length*36+14,320);
   const below=window.innerHeight-r.bottom-12,above=r.top-12;
   const up=below<estHeight&&above>below;
   const maxHeight=Math.min(320,Math.max(40,up?above:below));
   el.style.minWidth=`${minWidth}px`;
   el.style.maxWidth=`${maxWidth}px`;
   el.style.maxHeight=`${maxHeight}px`;
   el.dataset.scrolling='false';
   el.dataset.scrolling=el.scrollHeight>el.clientHeight+1?'true':'false';
   const menuWidth=Math.min(Math.max(minWidth,el.offsetWidth),maxWidth);
   const menuHeight=Math.min(el.offsetHeight||estHeight,maxHeight);
   const preferredLeft=r.left+menuWidth<=window.innerWidth-8?r.left:r.right-menuWidth;
   const left=Math.max(8,Math.min(preferredLeft,Math.max(8,window.innerWidth-menuWidth-8)));
   const top=up?Math.max(8,r.top-menuHeight-5):r.bottom+5;
   setPosition({left,top,minWidth,maxWidth,maxHeight});
  };
  place();window.addEventListener('resize',place);window.addEventListener('scroll',place,true);
  return()=>{window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true);};
 },[open,options.length]);
 useEffect(()=>{if(!open)return;menu.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();const outside=(e:PointerEvent)=>{if(!trigger.current?.contains(e.target as Node)&&!menu.current?.contains(e.target as Node))setOpen(false);};document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside);},[open]);
 return <><button ref={trigger} type="button" className="themeSelectTrigger" disabled={disabled} aria-label={label} aria-haspopup="menu" aria-expanded={open} aria-controls={open?id:undefined} onClick={()=>{if(!disabled)setOpen(!open);}} onKeyDown={e=>{if(!disabled&&(e.key==='ArrowDown'||e.key==='ArrowUp')){e.preventDefault();setOpen(true);}}}><span>{options.find(o=>o[0]===value)?.[1]??value}</span><ChevronDownIcon/></button>{open&&!disabled&&createPortal(<div ref={menu} id={id} className="themeSelectMenu" role="menu" aria-label={label} style={position} onKeyDown={e=>{
  const buttons=Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('button')??[]),index=buttons.indexOf(document.activeElement as HTMLButtonElement);
  if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close(true);}else if(e.key==='Tab'){e.preventDefault();close(true);}else if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();buttons[e.key==='Home'?0:e.key==='End'?buttons.length-1:(index+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();}
 }}>{options.map(([key,text])=><button type="button" role="menuitemradio" aria-checked={value===key} key={key} onClick={()=>{onChange(key);close(true);}}><span>{text}</span>{value===key&&<CheckIcon/>}</button>)}</div>,document.body)}</>;
}

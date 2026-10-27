import {useEffect,useLayoutEffect,useRef,useState} from 'react';

// Click-only: moving between vendor cards must never stack large inventories.
export function useVendorPopover(id:string){
 const [open,setOpen]=useState(false),[position,setPosition]=useState({top:0,left:0,maxHeight:600});
 const trigger=useRef<HTMLButtonElement>(null),panel=useRef<HTMLDivElement>(null);
 useEffect(()=>{const other=(event:Event)=>{if((event as CustomEvent<string>).detail!==id)setOpen(false);};window.addEventListener('vendor-open',other);return()=>window.removeEventListener('vendor-open',other);},[id]);
 useLayoutEffect(()=>{
  if(!open)return;
  const place=()=>{const r=(trigger.current?.closest(".railVendors")??trigger.current)?.getBoundingClientRect();if(r)setPosition({left:Math.max(8,Math.min(r.right-650,innerWidth-Math.min(650,innerWidth-16)-8)),top:Math.min(r.bottom+8,innerHeight-140),maxHeight:Math.max(110,innerHeight-r.bottom-20)});};
  const close=(event:PointerEvent)=>{if(!panel.current?.contains(event.target as Node)&&!trigger.current?.contains(event.target as Node))setOpen(false);};
  const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){setOpen(false);trigger.current?.focus();}};
  place();window.addEventListener('resize',place);document.addEventListener('scroll',place,true);document.addEventListener('pointerdown',close);document.addEventListener('keydown',key);
  return()=>{window.removeEventListener('resize',place);document.removeEventListener('scroll',place,true);document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',key);};
 },[open]);
 const toggle=()=>{if(!open)window.dispatchEvent(new CustomEvent('vendor-open',{detail:id}));setOpen(!open);};
 return {open,setOpen,position,trigger,panel,toggle};
}

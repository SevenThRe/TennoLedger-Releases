import {useEffect,useRef} from 'react';
/** Keep keyboard actions inside the concrete review; Escape never dismisses an active write. */
export function useMarketBulkDialog(active:boolean,locked:boolean,close:()=>void){
 const ref=useRef<HTMLElement|null>(null),latest=useRef({locked,close});latest.current={locked,close};
 useEffect(()=>{
  if(!active)return;const previous=document.activeElement as HTMLElement|null;
  const nodes=()=>[...(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]')??[])].filter(n=>n.getClientRects().length>0);
  const frame=requestAnimationFrame(()=>nodes()[0]?.focus());
  const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();if(!latest.current.locked)latest.current.close();}else if(event.key==='Tab'){const all=nodes();if(!all.length){event.preventDefault();return;}const index=all.indexOf(document.activeElement as HTMLElement);if(event.shiftKey&&index<=0){event.preventDefault();all[all.length-1].focus();}else if(!event.shiftKey&&(index===all.length-1||index===-1)){event.preventDefault();all[0].focus();}}};
  document.addEventListener('keydown',key,true);
  return()=>{cancelAnimationFrame(frame);document.removeEventListener('keydown',key,true);if(previous?.isConnected)previous.focus();};
 },[active]);
 return ref;
}

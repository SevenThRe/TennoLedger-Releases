import {useLayoutEffect,useRef,type ReactNode} from 'react';
import './foundryLayout.css';
export default function CollectionWorldLayout({foundry,children}:{foundry:boolean;children:ReactNode}){
 const root=useRef<HTMLDivElement>(null);
 useLayoutEffect(()=>{
  const element=root.current;if(!element)return;
  const update=()=>{
   const content=element.closest('.windowContent');
   const scale=Number.parseFloat(getComputedStyle(element).getPropertyValue('--ui-scale'))||1;
   const bottom=content?.getBoundingClientRect().bottom??innerHeight;
   element.style.setProperty('--world-panel-height',`${Math.max(180,(bottom-element.getBoundingClientRect().top)/scale-12)}px`);
  };
  update();const observer=new ResizeObserver(update);
  observer.observe(element.closest('main')??element);
  const header=element.parentElement?.querySelector(':scope > header');if(header)observer.observe(header);
  window.addEventListener('resize',update);
  return()=>{observer.disconnect();window.removeEventListener('resize',update);};
 },[]);
 return <div ref={root} className={'collectionWorldLayout'+(foundry?' foundryWorldLayout':'')}>{children}</div>;
}

import {createContext,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {native} from './api';
import {useAccounts} from './AccountProvider';
import {emptyWorld,enqueueNotice,canAutoDismissNotice,notificationStateHint,noticeForScope,worldPreviewEnabled,previewWorldStatus,type Subscriptions,type WorldNotice,type WorldStatus} from './worldModel';
export const worldQA=worldPreviewEnabled(import.meta.env.DEV,location.search);
const Context=createContext<{status:WorldStatus;loaded:boolean;busy:boolean;testing:boolean;testNotice:()=>Promise<WorldNotice>;save:(settings:Subscriptions)=>Promise<void>}>({status:emptyWorld(),loaded:false,busy:false,testing:false,testNotice:async()=>{throw Error('通知尚未就绪');},save:async()=>{}});
export function useWorld(){return useContext(Context);}
export default function WorldProvider({children}:{children:ReactNode}){
 const {scope}=useAccounts(),scopeRef=useRef(scope);scopeRef.current=scope;
 const scoped=(next:WorldStatus)=>({...next,notifications:next.notifications.filter(notice=>noticeForScope(notice,scopeRef.current))});
 const [loaded,setLoaded]=useState(false),[status,setStatus]=useState(emptyWorld),[busy,setBusy]=useState(false),[testing,setTesting]=useState(false),[queue,setQueue]=useState<WorldNotice[]>([]),[visible,setVisible]=useState(!document.hidden),[focused,setFocused]=useState(document.hasFocus());
 const settingsRevision=useRef(0);
 const seen=useRef(new Set<string>()),testPending=useRef(false);
 const toast=queue[0];
 function trace(stage:string,id?:string){if(!native)return;const node=document.querySelector('.worldToast'),rect=node?.getBoundingClientRect();const x=rect?Math.min(innerWidth-1,Math.max(0,rect.left+rect.width/2)):0,y=rect?Math.min(innerHeight-1,Math.max(0,rect.top+rect.height/2)):0;void invoke('world_notification_trace',{trace:{stage,id:id??null,visible:!document.hidden,focused:document.hasFocus(),width:rect?.width??null,height:rect?.height??null,x:rect?.x??null,y:rect?.y??null,viewportWidth:innerWidth,viewportHeight:innerHeight,hitVisible:!!node&&!!rect&&rect.left>=0&&rect.top>=0&&rect.right<=innerWidth&&rect.bottom<=innerHeight&&node.contains(document.elementFromPoint(x,y))}}).catch(()=>{});}
 useEffect(()=>{if(toast)trace('rendered',toast.id);},[toast?.id]);
 function receive(notice:WorldNotice){if(!noticeForScope(notice,scopeRef.current)||seen.current.has(notice.id))return;trace('received',notice.id);seen.current.add(notice.id);if(seen.current.size>1000)seen.current.delete(seen.current.values().next().value!);setQueue(q=>enqueueNotice(q,notice));}
 useEffect(()=>{let live=true,pending=false;const refresh=async()=>{if(pending)return;pending=true;const revision=settingsRevision.current,requestScope=scopeRef.current;try{const next=native?await invoke<WorldStatus>('world_status'):worldQA?await fetch(new URLSearchParams(location.search).get('worldRewardsFixture')==='1'?'/qa/world-with-rewards-synthetic.json':'/qa/world-snapshot.json').then(r=>{if(!r.ok)throw Error('公共接口快照尚未生成');return r.json();}).then(previewWorldStatus):null;if(live&&next&&requestScope===scopeRef.current){if(!native&&new URLSearchParams(location.search).get('qa')==='arbitrations'){try{const saved=JSON.parse(localStorage.getItem('myframe.qa.arbitrationSubscriptions')||'null');if(saved)next.subscriptions=saved;}catch{}}setStatus(current=>({...scoped(next),subscriptions:revision===settingsRevision.current?next.subscriptions:current.subscriptions}));setLoaded(true);}}catch(e){if(live)setStatus(s=>({...s,error:String(e),stale:true}));}finally{pending=false;}};
 const off=native?listen<WorldNotice>('world-notification',e=>{if(live){receive(e.payload);void refresh();}}):null;
 const updates=native?listen<WorldNotice>('world-notification-update',e=>{if(live){setQueue(q=>q.map(n=>n.id===e.payload.id?e.payload:n));void refresh();}}):null;if(updates)void updates.catch(()=>{});
 if(off)void off.then(()=>{if(live)trace('ready');}).catch(()=>{if(live)setStatus(s=>({...s,error:'应用内通知监听失败'}));});
 void refresh();const timer=native?setInterval(()=>void refresh(),3000):null;
 return()=>{live=false;if(timer)clearInterval(timer);if(off)void off.then(f=>f()).catch(()=>{});if(updates)void updates.then(f=>f()).catch(()=>{});};},[]);
 useEffect(()=>{setQueue([]);seen.current.clear();setStatus(current=>scoped(current));},[scope]);
 useEffect(()=>{const change=()=>{setVisible(!document.hidden);setFocused(document.hasFocus());};document.addEventListener('visibilitychange',change);window.addEventListener('focus',change);window.addEventListener('blur',change);return()=>{document.removeEventListener('visibilitychange',change);window.removeEventListener('focus',change);window.removeEventListener('blur',change);};},[]);
 useEffect(()=>{if(!toast||!canAutoDismissNotice(toast,visible,focused))return;const id=toast.id,age=Math.max(0,Date.now()-Date.parse(toast.createdAt)),timer=setTimeout(()=>setQueue(q=>q.filter(n=>n.id!==id)),Math.max(0,6500-(Number.isFinite(age)?age:6500)));return()=>clearTimeout(timer);},[toast?.id,visible,focused]);
 async function save(settings:Subscriptions){if(!native&&(settings.delivery?.webhookUrl||settings.delivery?.clearWebhook))throw Error('请在桌面程序安全保存或移除 Webhook');settingsRevision.current++;setBusy(true);try{if(native){const next=await invoke<WorldStatus>('world_set_subscriptions',{settings});settingsRevision.current++;setStatus(scoped(next));}else if(worldQA){if(new URLSearchParams(location.search).get('qa')==='arbitrations')localStorage.setItem('myframe.qa.arbitrationSubscriptions',JSON.stringify(settings));setStatus(s=>({...s,subscriptions:settings}));}else throw Error('请在桌面程序中设置提醒');}finally{settingsRevision.current++;setBusy(false);}}
 async function testNotice(){if(testPending.current)throw Error('测试提醒正在等待发送');testPending.current=true;setTesting(true);try{
 let notice:WorldNotice;
 if(native){notice=await invoke<WorldNotice>('world_test_notification');receive(notice);setStatus(scoped(await invoke<WorldStatus>('world_status')));}
 else if(worldQA){await new Promise(resolve=>setTimeout(resolve,5000));notice={id:crypto.randomUUID(),kind:'test',title:'MyFrame 测试提醒',body:'这是一条应用内测试消息。',createdAt:new Date().toISOString(),deliveryError:'浏览器预览不发送 Windows 系统通知'};receive(notice);setStatus(s=>({...s,notifications:[notice,...s.notifications].slice(0,100)}));}
 else throw Error('请在桌面程序中测试提醒');
 return notice;
 }finally{testPending.current=false;setTesting(false);}}
 return <Context.Provider value={{status,loaded,busy,testing,testNotice,save}}>{children}{toast&&createPortal(<div className="worldToast" role="status"><img src="/reference/ui/notification.png" alt=""/><div><b>{toast.title}</b><p>{toast.body}</p>{toast.deliveryError&&<small>{toast.deliveryError}</small>}{notificationStateHint(toast.systemState)&&<small>{notificationStateHint(toast.systemState)}</small>}{queue.length>1&&<small className="worldToastPending">另有 {queue.length-1} 条提醒</small>}</div><button aria-label="关闭全部提醒" title="关闭全部提醒" onClick={()=>{trace('dismissed-all',toast.id);setQueue([]);if(native)void invoke('overlay_dismiss_notifications').catch(()=>{});}}>×</button></div>,document.body)}</Context.Provider>;
}

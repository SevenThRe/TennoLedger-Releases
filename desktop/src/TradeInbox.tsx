import {useEffect,useState,useMemo,useRef} from 'react';
import {useTranslation} from 'react-i18next';
import {tradeItemResolver,type TradeCatalogItem} from './tradeItemResolver';
import {TradeConfirmation} from './tradeConfirmation';
import {tradeCandidateRecord,type TradeCandidate as Candidate} from './tradeCandidateRecord';
import {matchingConfirmedTrades} from './tradeCandidateDedup';
import {parseGameTradeFinished,type GameTradeFinished} from './tradeFinishModel';
import {listen} from '@tauri-apps/api/event';
import {invoke} from '@tauri-apps/api/core';
import {native} from './api';
import {useAccounts} from './AccountProvider';
import {accountStorageKey,legacyScope} from './accountScopeModel';
const storage='myframe.tradeInbox.v1',handledKey='myframe.tradeInbox.handled.v1';
function handled(key:string):string[]{try{const rows=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(rows)?rows.filter((id:unknown)=>typeof id==='string').slice(-2000):[];}catch{return [];}}
function remember(id:string,key:string){localStorage.setItem(key,JSON.stringify([...new Set([...handled(key),id])].slice(-2000)));}
function pending(key:string,known:string):Candidate[]{try{const rows=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(rows)?rows.filter(r=>r&&typeof r.id==='string'&&typeof r.name==='string'&&Number.isSafeInteger(r.quantity)&&r.quantity>0&&Number.isFinite(r.platinum)&&!handled(known).includes(r.id)).slice(-100):[];}catch{return [];}}
export default function TradeInbox(){
 const {i18n}=useTranslation(),en=i18n.language.startsWith('en'),L=(zh:string,eng:string)=>en?eng:zh;
 const {scope}=useAccounts(),pendingStorage=accountStorageKey(storage,scope),handledStorage=accountStorageKey(handledKey,scope);
 const activeScope=useRef(scope);activeScope.current=scope;
 const confirmation=useMemo(()=>new TradeConfirmation(),[scope]);
 const [catalog,setCatalog]=useState<TradeCatalogItem[]>([]),[events,setEvents]=useState<GameTradeFinished[]>([]);
 const resolveItem=useMemo(()=>tradeItemResolver(catalog),[catalog]);
 useEffect(()=>{let live=true;void fetch('/catalog.json').then(r=>{if(!r.ok)throw Error('物品目录未加载');return r.json();}).then(data=>{if(live&&Array.isArray(data.items))setCatalog(data.items);}).catch(()=>{});return()=>{live=false;};},[]);
 // The key travels with the rows: an account switch cannot persist an old render into the new bucket.
 const [bucket,setBucket]=useState(()=>({key:pendingStorage,rows:pending(pendingStorage,handledStorage)}));
 const rows=bucket.key===pendingStorage?bucket.rows:[];
 const setRows=(change:(old:Candidate[])=>Candidate[])=>setBucket(old=>({key:pendingStorage,rows:change(old.key===pendingStorage?old.rows:[])}));
 const [error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{setBucket({key:pendingStorage,rows:pending(pendingStorage,handledStorage)});setError('');setBusy(false);setEvents([]);},[pendingStorage,handledStorage]);
 useEffect(()=>{if(bucket.key!==pendingStorage)return;try{localStorage.setItem(pendingStorage,JSON.stringify(bucket.rows));}catch{setError('待确认记录保存失败');}},[bucket,pendingStorage]);
 useEffect(()=>{
  if(!native)return;let live=true;
  const accept=(value:unknown)=>{const event=parseGameTradeFinished(value,scope);if(live&&activeScope.current===scope&&event)setEvents(old=>old.some(e=>e.id===event.id)?old:[...old.slice(-99),event]);};
  const read=()=>{void Promise.all([invoke<unknown[]>('game_recent_trade_finishes',{expectedScope:scope}),invoke<{data:{trades:{id:string}[];exchanges?:{id:string}[]}}>('load_ledger')]).then(([value,ledger])=>{
   if(!live||activeScope.current!==scope)return;
   const recorded=new Set([...ledger.data.trades,...(ledger.data.exchanges??[])].map(row=>row.id));
   setEvents([]);for(const entry of value){const event=parseGameTradeFinished(entry,scope);if(event&&recorded.has(event.id))accept(entry);}
  }).catch(()=>{if(live&&activeScope.current===scope)setEvents([]);});};read();
  const game=listen('game-trade-finished',()=>read());
  const off=listen<{candidate:Candidate;capturedAt:string;accountScope?:string}>('trade-candidate',e=>{
   if(!live||activeScope.current!==scope||(e.payload.accountScope??legacyScope)!==scope)return;const c=e.payload.candidate;
   if(!c||typeof c.id!=='string'||typeof c.name!=='string'||!Number.isFinite(c.platinum)||confirmation.has(c.id)||handled(handledStorage).includes(c.id))return;
   setRows(old=>old.some(r=>r.id===c.id)?old:[...old.slice(-99),{...c,capturedAt:e.payload.capturedAt}]);
  });
  window.addEventListener('trades-updated',read);
  return()=>{live=false;window.removeEventListener('trades-updated',read);void off.then(f=>f()).catch(()=>{});void game.then(f=>f()).catch(()=>{});};
 },[scope,pendingStorage,handledStorage,confirmation]);
 async function confirm(row:Candidate,side:'sale'|'purchase'){
  if(matchingConfirmedTrades(row,side,resolveItem(row.name),events).length){setError('此笔已由游戏日志确认并入账，请核对现有交易记录。');return;}
  setError('');try{
   const warning=await confirmation.run(row.id,async()=>{setBusy(true);await invoke('confirm_trade',{expectedScope:scope,input:JSON.stringify({trades:[tradeCandidateRecord(row,side,resolveItem(row.name))]})});},()=>{
    if(activeScope.current!==scope)return;
    window.dispatchEvent(new Event('trades-updated'));setRows(old=>old.filter(r=>r.id!==row.id));
   },()=>remember(row.id,handledStorage));
   if(activeScope.current===scope&&warning!==null){setError(warning);setBusy(false);}
  }catch(e){if(activeScope.current===scope){setError(String(e).includes('游戏日志')?'此笔已由游戏日志确认并入账，请核对现有交易记录。':String(e));setBusy(false);}}
 }
 if(!rows.length&&!error)return null;
 return <details className="tradeInboxDisclosure"><summary>{L('交易待确认','Trade confirmation')} · {rows.length}</summary><section className="panel"><p className="muted">{L('核对物品、数量及实际总白金后确认。','Verify the item, quantity and actual total platinum before confirming.')}</p>{error&&<p role="alert">{error}</p>}{rows.map(row=>{
  const id=resolveItem(row.name),sale=matchingConfirmedTrades(row,'sale',id,events),purchase=matchingConfirmedTrades(row,'purchase',id,events);
  return <div key={row.id} className="collectionTools"><span>{row.name}{(sale.length>0||purchase.length>0)&&<small role="status"> · {L('游戏日志已记录'+(sale.length?'卖出':'买入')+'，请核对现有记录','Already recorded by the game log; review existing records')}</small>}</span><label>{L('交易对象','Trading partner')} <input aria-label={L('交易对象','Trading partner')} title={L('可留空','Optional')} value={row.partner??''} disabled={busy} onChange={e=>setRows(old=>old.map(r=>r.id===row.id?{...r,partner:e.target.value}:r))}/></label><label>{L('数量','Quantity')} <input aria-label={L('成交数量','Traded quantity')} disabled={busy} type="number" min="1" value={row.quantity} onChange={e=>setRows(old=>old.map(r=>r.id===row.id?{...r,quantity:Math.max(1,Math.floor(Number(e.target.value)||1))}:r))}/></label><label>{L('总白金','Total platinum')} <input aria-label={L('成交总白金','Total platinum')} disabled={busy} type="number" min="0" value={row.platinum} onChange={e=>setRows(old=>old.map(r=>r.id===row.id?{...r,platinum:Math.max(0,Math.floor(Number(e.target.value)||0))}:r))}/></label><button disabled={busy||!native||sale.length>0} onClick={()=>void confirm(row,'sale')}>{L('确认卖出','Confirm sale')}</button><button disabled={busy||!native||purchase.length>0} onClick={()=>void confirm(row,'purchase')}>{L('确认买入','Confirm purchase')}</button><button disabled={busy} onClick={()=>{try{remember(row.id,handledStorage);setRows(old=>old.filter(r=>r.id!==row.id));}catch{setError('忽略状态保存失败');}}}>{L('忽略','Ignore')}</button></div>;
 })}{!rows.length&&<p className="muted">{L('暂无交易候选','No trade candidates')}</p>}</section></details>;
}

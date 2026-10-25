import {inMarketContext} from './marketRequestContext';
import {relicOwned} from './relicAliases';
import type {Inventory} from './relicModel';
import {useEffect,useState,useSyncExternalStore,useRef,useMemo} from 'react';
import {invoke} from '@tauri-apps/api/core';
import MarketAccount,{useMarketSession,sessionChanged} from './MarketAccount';
import {native} from './api';
import {VeiledSubmissions} from './veiledSubmission';
import {submitRelicOrder,relicOrders,relicWhisper,type RelicMarketItem,type RelicOrder} from './relicTradeModel';
import type {Relic} from './relicModel';
const submissions=new VeiledSubmissions();
export default function RelicTrade({relic,owned,initialSide,onClose}:{relic:Relic;owned:number|null;initialSide:'buy'|'sell';onClose:()=>void}){
 const session=useMarketSession(),platform=session.platform??'pc';
 const [item,setItem]=useState<RelicMarketItem|null>(null),[quotes,setQuotes]=useState<RelicOrder[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(false),[price,setPrice]=useState(1),[quantity,setQuantity]=useState(1),[side,setSide]=useState(initialSide),[revision,setRevision]=useState(0),[copied,setCopied]=useState('');
 useEffect(()=>{if(!copied)return;const timer=setTimeout(()=>setCopied(''),1500);return()=>clearTimeout(timer);},[copied]);
 async function copyQuote(order:RelicOrder){try{await navigator.clipboard.writeText(relicWhisper(relic.base,relic.refinement,order));setCopied(order.id);setError('');}catch(e){setError('复制密语失败：'+String(e));}}
 const key=JSON.stringify([session.ingameName,platform,relic.marketSlug,relic.refinement,side]);
 const context=useMemo(()=>({}),[key,relic.id,session.connected,session.verified]);
 const active=useRef<object|null>(context);active.current=context;
 const isCurrent=()=>active.current===context;
 useEffect(()=>{active.current=context;setError('');return()=>{if(active.current===context)active.current=null;};},[context]);
 const {pending,receipt,error:postError}=useSyncExternalStore(submissions.subscribe,()=>submissions.get(key));
 useEffect(()=>{let live=true;setItem(null);setQuotes([]);setError('');if(!native)return;setLoading(true);void(async()=>{try{
  if(!relic.marketSlug)throw Error('缺少遗物市场映射');
  const catalog=await invoke<{data:RelicMarketItem[]}>('market_request',{action:'items',key:'',platform,token:'',body:{}});
  if(!Array.isArray(catalog.data))throw Error('市场目录格式变化');
  const found=catalog.data.find(i=>i.slug===relic.marketSlug);if(!found)throw Error('市场未找到该遗物');
  const book=await invoke<{data:unknown}>('market_request',{action:'book',key:found.slug,platform,token:'',body:{}});
  if(live){setItem(found);setQuotes(relicOrders(book.data,relic.refinement));}
 }catch(e){if(live)setError(String(e));}finally{if(live)setLoading(false);}})();return()=>{live=false;};},[relic.id,platform,revision]);
 async function submit(){
  if(!native||!session.connected||!session.verified||!item||pending||receipt)return;
  setError('');
  try{await submissions.submit(key,()=>submitRelicOrder(item,relic.refinement,side,price,quantity,
   async()=>relicOwned(await inMarketContext(isCurrent,()=>invoke<Inventory|null>('load_collection')),relic),
   async body=>{try{return await inMarketContext(isCurrent,()=>invoke<{data:{id:string}}>('market_request',{action:'create',key:'',platform,token:'',body}));}catch(e){if(isCurrent())sessionChanged();throw e;}}));
  }catch(e){if(isCurrent())setError(String(e));}
 }

 return <section className="relicTrade" aria-label="遗物交易"><header><h3>遗物交易</h3><button disabled={pending} aria-label="关闭遗物交易" onClick={onClose}>×</button></header><small>{relic.name} · {platform} · 拥有 {owned??'—'}</small><MarketAccount initiallyOpen={false}/>{!native?<p>请在桌面程序中查看报价和交易</p>:<><button disabled={loading||pending} onClick={()=>setRevision(n=>n+1)}>{loading?'读取报价…':'刷新报价'}</button>{['sell','buy'].map(type=><div className="relicTradeQuotes" key={type}><h4>{type==='sell'?'出售报价':'收购报价'}</h4>{quotes.filter(q=>q.type===type).slice(0,5).map(q=><div key={q.id}><span>{q.user?.ingameName}<small>{q.user?.status==='ingame'?'游戏中':'在线'}</small></span><b>{q.platinum} 白金 / {q.perTrade??1} 个</b><small>×{q.quantity}</small><button aria-label={'复制密语 '+q.user?.ingameName} title={copied===q.id?'已复制':'复制交易密语'} disabled={!q.user?.ingameName} onClick={()=>void copyQuote(q)}><img src={'/reference/ui/'+(copied===q.id?'tick':'copy')+'.png'} alt=""/></button></div>)}{!loading&&!quotes.some(q=>q.type===type)&&<small>暂无该精炼等级的在线报价</small>}</div>)}</>}<form onSubmit={e=>{e.preventDefault();void submit();}}><label>方向<select disabled={pending||!!receipt} value={side} onChange={e=>setSide(e.target.value as 'buy'|'sell')}><option value="sell">出售</option><option value="buy">收购</option></select></label><label>单价<input type="number" required min="1" max="900000" disabled={pending||!!receipt} value={price} onChange={e=>setPrice(Number(e.target.value))}/></label><label>数量<input type="number" required min="1" max={side==='sell'?Math.min(owned??0,9999):9999} disabled={pending||!!receipt} value={quantity} onChange={e=>setQuantity(Number(e.target.value))}/></label><button disabled={!native||loading||pending||!!receipt||!item||!session.connected||!session.verified||side==='sell'&&(owned===null||owned<1)}>{pending?'提交中…':side==='sell'?'发布出售':'发布收购'}</button></form>{copied&&<small role="status">交易密语已复制</small>}{receipt&&<p role="status">已发布 · {receipt}</p>}{(error||postError)&&<p role="alert">{error||postError}</p>}</section>;
}

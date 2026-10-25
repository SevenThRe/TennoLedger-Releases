import {useTranslation} from 'react-i18next';
import {useEffect,useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {native} from './api';
import {useAccounts} from './AccountProvider';
import {useMarketSession} from './MarketAccount';
import TradeFinishPanel from './TradeFinishPanel';
import {parseGameTradeFinished,type GameTradeFinished,type FinishMarketItem} from './tradeFinishModel';
import './marketBulk.css';

/** Uses the same exact-match, scoped requests and durable receipts as the main market. */
export default function TradeOverlayActions({event,preview}:{event:unknown;preview:boolean}){
 const {i18n}=useTranslation(),L=(zh:string,en:string)=>i18n.language.startsWith('en')?en:zh;

 const accounts=useAccounts(),session=useMarketSession(),[market,setMarket]=useState<FinishMarketItem[]>([]),[loading,setLoading]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false),[trusted,setTrusted]=useState<GameTradeFinished|null>(null);
 const parsed=parseGameTradeFinished(event,accounts.scope),platform=session.platform??'pc';
 useEffect(()=>{setTrusted(null);if(!native||preview||!accounts.ready||!parsed)return;let live=true;setLoading(true);setError('');void Promise.all([invoke<{data:unknown}>('market_request',{action:'items',key:'',platform,token:'',body:{}}),invoke<unknown[]>('game_recent_trade_finishes',{expectedScope:accounts.scope})]).then(([result,recent])=>{if(!Array.isArray(result.data))throw Error(L("市场目录格式变化","Unexpected market catalog format"));const saved=recent.map(v=>parseGameTradeFinished(v,accounts.scope)).find(v=>v?.id===parsed.id);if(live){setMarket(result.data as FinishMarketItem[]);setTrusted(saved??null);}}).catch(e=>{if(live)setError(String(e));}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};},[preview,accounts.ready,accounts.scope,parsed?.id,platform,session.accountId,session.sessionGeneration]);

 if(preview)return <section className="tradeOverlayActions"><p>{L("预览模式 · 核对市场完成计划与好评备注均须本人明确提交。","Preview mode. Market completion and reviews require your confirmation.")}</p><label>{L("好评备注","Review message")}<textarea aria-label="预览好评备注" placeholder={L("可填写评价内容（预览不会提交）","Add a message (preview does not submit)")} maxLength={500}/></label><button disabled>{L("确认游戏已成交，登记市场完成","Confirm the in-game trade and mark orders complete")}</button><button disabled>{L("提交 WM 好评","Submit positive review")}</button></section>;
 if(!accounts.ready)return <p role="status">{L("读取当前游戏账号…","Loading the current game account…")}</p>;
 if(!parsed)return <p role="alert">{L("此成交不属于当前游戏账号或明细格式待核实，请切回对应资料核对。","This trade belongs to another game account or has unverified details. Switch to the matching profile.")}</p>;
 return <section className="tradeOverlayActions">{!session.connected&&<p>{L("请先在主窗口登录 WM；此处保留游戏成交供核对。","Sign in to the market in the main window. The game trade remains available for review.")}</p>}{loading&&<p role="status">{L("读取市场物品目录…","Loading market items…")}</p>}{error&&<p role="alert">{error}</p>}<TradeFinishPanel session={session} platform={platform} market={market} initialEvent={trusted??event} autoTrusted={trusted!==null} compact readOnly={preview} disabled={loading||busy||!session.connected||!market.length} onRunning={setBusy} onRefresh={async()=>{window.dispatchEvent(new Event('market-orders-changed'));}}/></section>;
}

import {useTranslation} from 'react-i18next';
import {parseCompletionStatus} from './tradeCompletionReceipt';
import {useEffect,useRef,useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {native} from './api';
import type {BulkContext} from './marketBulkModel';
import {reputationRequest} from './tradeReputationModel';
export default function TradeReputation({eventId,scope,partner,context,disabled,onBusy,canWrite}:{eventId:string;scope:string;partner:string;context:BulkContext;disabled:boolean;canWrite:boolean;onBusy:(v:boolean)=>void}){
 const {i18n}=useTranslation(),L=(zh:string,en:string)=>i18n.language.startsWith('en')?en:zh;

 const [open,setOpen]=useState(false),[text,setText]=useState(''),[checked,setChecked]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[finished,setFinished]=useState(false);
 const lock=useRef(false),generation=useRef(0),alive=useRef(true);
 useEffect(()=>{generation.current++;setOpen(false);setText('');setChecked(false);setMessage('');setFinished(false);},[eventId,scope,partner,context.accountId,context.platform]);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;generation.current++;onBusy(false);};},[]);
 useEffect(()=>{if(!open||!native)return;let live=true;let orderId:string;try{orderId=reputationRequest(partner,'').receiptOrderId;}catch{return;}void invoke('trade_completion_status',{eventId,orderId,marketAccount:context.accountId,platform:context.platform,expectedScope:scope}).then(parseCompletionStatus).then(status=>{if(live&&status){setFinished(true);setMessage(status==='accepted'?L("此成交已有好评成功回执","A positive review was already recorded for this trade"):L("此评价已有执行意图或结果待核对，未重复发送","This review has an existing submission or uncertain result; it was not resent"));}}).catch(()=>{});return()=>{live=false;};},[open,eventId,scope,partner,context.accountId,context.platform]);
 async function submit(){
  if(lock.current||!canWrite||disabled||!native||!checked||finished)return;lock.current=true;setBusy(true);onBusy(true);setMessage('');const run=generation.current;
  try{const request=reputationRequest(partner,text),fields={eventId,orderId:request.receiptOrderId,marketAccount:context.accountId,platform:context.platform,expectedScope:scope};
   const receipt=await invoke<{acquired:boolean;status:string}>('trade_completion_intent',fields);
   if(!receipt.acquired){if(alive.current&&run===generation.current){setFinished(true);setMessage(receipt.status==='accepted'?L("此成交的好评已提交","A positive review was already submitted for this trade"):L("已有提交意图或结果待核对，未重复发送","An existing submission or uncertain result was found; it was not resent"));}return;}
   if(!alive.current||run!==generation.current){try{await invoke('trade_completion_result',{...fields,outcome:'uncertain',error:L("会话变化，未发送评价请求","The session changed; no review was sent")});}catch{}return;}
   try{await invoke('market_request_scoped',{action:'review',key:request.key,platform:context.platform,body:request.body,expectedAccount:context.accountId,expectedPlatform:context.platform});}
   catch(e){try{await invoke('trade_completion_result',{...fields,outcome:'uncertain',error:String(e)});}catch{}if(alive.current&&run===generation.current)setFinished(true);throw e;}
   await invoke('trade_completion_result',{...fields,outcome:'accepted',error:null});
   if(alive.current&&run===generation.current){setFinished(true);setMessage(L("市场已确认收到好评","The market confirmed the positive review"));}
  }catch(e){if(alive.current&&run===generation.current)setMessage(String(e)+L("；未自动重试，请在 WM 核对","; no automatic retry was made. Check the market response"));}finally{lock.current=false;if(alive.current){setBusy(false);onBusy(false);}}
 }
 return <div className="tradeReputation"><button disabled={disabled||busy||!partner} onClick={()=>setOpen(!open)}>{L("评价交易对象","Leave a positive review")}</button>{open&&<div><label>{L("交易对象 ","Trading partner ")}<strong>{partner||L("未核实","Unverified")}</strong></label><textarea aria-label={L("给交易对象的好评","Positive review for the trading partner")} placeholder={L("可填写评价内容","Add a message (optional)")} maxLength={500} value={text} disabled={busy||finished} onChange={e=>setText(e.target.value)}/><label><input type="checkbox" checked={checked} disabled={busy||finished} onChange={e=>setChecked(e.target.checked)}/>{L("已核对交易对象，向其提交好评","I checked the trading partner and want to submit a positive review")}</label><button disabled={disabled||!canWrite||busy||!native||!checked||finished} onClick={()=>void submit()}>{busy?L("提交中…","Submitting…"):L("提交 WM 好评","Submit positive review")}</button>{message&&<p role="status">{message}</p>}</div>}</div>;
}

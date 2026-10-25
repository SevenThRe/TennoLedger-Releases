import {useTranslation} from 'react-i18next';
import {parseCompletionStatus} from './tradeCompletionReceipt';
import {useEffect,useMemo,useRef,useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {native} from './api';
import type {BulkContext} from './marketBulkModel';
import {sameBulkContext} from './marketBulkModel';
import type {FinishCandidate} from './tradeFinishModel';
import {parseFinishAuctions,finishAuctionFingerprint,revalidateFinishAuction} from './tradeFinishAuctionModel';
import {fromAuction,type Auction,type RivenCatalog} from './rivenModel';
import {rivenTitles,rivenWeaponResolver,type RivenWeapon} from './rivenPresentation';
import {rivenAttributeName} from './rivenLocalization';
import Artwork from './Artwork';
export default function TradeFinishAuction({candidate,context,disabled,onBusy,onRefresh,onAccepted,canWrite}:{candidate:FinishCandidate;context:BulkContext;disabled:boolean;canWrite:boolean;onBusy:(v:boolean)=>void;onRefresh:()=>Promise<void>;onAccepted:()=>void}){
 const {i18n}=useTranslation(),L=(zh:string,en:string)=>i18n.language.startsWith('en')?en:zh;

 const [open,setOpen]=useState(false),[rows,setRows]=useState<Auction[]>([]),[selected,setSelected]=useState<Auction|null>(null),[checked,setChecked]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[finished,setFinished]=useState(false),[weapons,setWeapons]=useState<RivenWeapon[]>([]),[catalog,setCatalog]=useState<RivenCatalog>({weapons:[],attributes:[]});
 const alive=useRef(true),generation=useRef(0),lock=useRef(false),ctx=useRef(context);ctx.current=context;
 const weaponFor=useMemo(()=>rivenWeaponResolver(weapons,catalog),[weapons,catalog]);
 useEffect(()=>{let live=true;void Promise.all([fetch('/catalog.json').then(r=>r.json()),fetch('/riven-catalog.json').then(r=>r.json())]).then(([items,data])=>{if(live){setWeapons(items.items);setCatalog(data);}}).catch(()=>{});return()=>{live=false;};},[]);
 useEffect(()=>{generation.current++;setOpen(false);setRows([]);setSelected(null);setChecked(false);setMessage('');setFinished(false);},[candidate.id,candidate.accountScope,context.accountId,context.platform]);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;generation.current++;onBusy(false);};},[]);
 const request=(action:string,id='',body:any={})=>invoke<{data:any}>('market_request_scoped',{action,key:id,body,platform:context.platform,expectedAccount:context.accountId,expectedPlatform:context.platform});
 async function own():Promise<Auction[]>{const response=await request('auctions_mine');const parsed=parseFinishAuctions(response.data);if(parsed.unverified&&alive.current)setMessage(parsed.unverified+L(" 条挂售信息不完整，未允许操作"," contracts have incomplete data and cannot be changed"));return parsed.rows;}
 async function load(){if(lock.current||disabled||!native)return;lock.current=true;setBusy(true);onBusy(true);setMessage('');const run=generation.current;try{const latest=await own();if(alive.current&&run===generation.current){setRows(latest.filter(a=>!a.closed));setOpen(true);setSelected(null);setChecked(false);setFinished(false);}}catch(e){if(alive.current&&run===generation.current)setMessage(String(e));}finally{lock.current=false;if(alive.current){setBusy(false);onBusy(false);}}}
 useEffect(()=>{if(!selected||!native)return;let live=true;void invoke('trade_completion_status',{eventId:candidate.id,orderId:'auction:'+selected.id,marketAccount:context.accountId,platform:context.platform,expectedScope:candidate.accountScope}).then(parseCompletionStatus).then(status=>{if(live&&status){setFinished(true);setMessage(status==='accepted'?L("此挂售已有完成回执","This contract already has a completion receipt"):L("此挂售已有执行意图或结果待核对，未重复提交","This contract has an existing submission or uncertain result; it was not resubmitted"));if(status==='accepted')onAccepted();}}).catch(()=>{});return()=>{live=false;};},[selected?.id,candidate.id,candidate.accountScope,context.accountId,context.platform]);
 async function finish(){
  if(!selected||!canWrite||!checked||lock.current||disabled||!native||finished||candidate.side!=='sale')return;lock.current=true;setBusy(true);onBusy(true);setMessage('');const run=generation.current,planned=structuredClone(selected),actor={...context};
  try{
   if(Date.now()-Date.parse(candidate.occurredAt)>15*60000)throw Error(L("本次成交已过期，请到我的挂售手动核对","This trade expired. Review it in My contracts."));
   const fresh=await own(),invalid=revalidateFinishAuction(planned,fresh);if(invalid)throw Error(invalid);
   if(!alive.current||run!==generation.current||!sameBulkContext(actor,ctx.current))return;
   const fields={eventId:candidate.id,orderId:'auction:'+planned.id,marketAccount:actor.accountId,platform:actor.platform,expectedScope:candidate.accountScope};
   const receipt=await invoke<{acquired:boolean;status:string}>('trade_completion_intent',fields);
   if(!receipt.acquired){setFinished(true);setMessage(receipt.status==='accepted'?L("此挂售已登记完成","This contract was already marked complete"):L("上次挂售完成结果待核对，未重复提交","The previous completion needs review; it was not resubmitted"));return;}
   if(!alive.current||run!==generation.current||!sameBulkContext(actor,ctx.current)){try{await invoke('trade_completion_result',{...fields,outcome:'uncertain',error:L("会话变化，未发送挂售完成请求","The session changed; no contract completion was sent")});}catch{}return;}
   try{await request('auction_close',planned.id);}catch(e){try{await invoke('trade_completion_result',{...fields,outcome:'uncertain',error:String(e)});}catch{}if(alive.current&&run===generation.current)setFinished(true);throw e;}
   await invoke('trade_completion_result',{...fields,outcome:'accepted',error:null});
   if(alive.current&&run===generation.current){setFinished(true);setMessage(L("市场已确认结束该紫卡挂售","The market confirmed this Riven contract is complete"));onAccepted();await onRefresh();window.dispatchEvent(new Event('market-orders-changed'));}
  }catch(e){if(alive.current&&run===generation.current)setMessage(String(e)+L("；未自动重试","; no automatic retry was made"));}finally{lock.current=false;if(alive.current){setBusy(false);onBusy(false);}}
 }
 if(candidate.side!=='sale')return null;
 return <div className="tradeFinishAuction"><button disabled={disabled||busy||!native} onClick={()=>void load()}>{busy?L("读取 / 提交中…","Loading / submitting…"):L("核对我的紫卡挂售","Review my Riven contracts")}</button>{open&&<><p>{L("紫卡实例不能从名称推定。请选择并核对实际成交的这张紫卡。","Choose and verify the exact Riven sold in this game trade.")}</p><select aria-label={L("本次成交的确切紫卡挂售","Exact Riven contract for this trade")} value={selected?.id??''} disabled={busy} onChange={e=>{setSelected(rows.find(a=>a.id===e.target.value)??null);setChecked(false);setFinished(false);}}><option value="">{L("请选择我的挂售","Choose one of my contracts")}</option>{rows.map(a=>{const r=fromAuction(a),title=rivenTitles(r,weaponFor(r));return <option key={a.id} value={a.id}>{title.primary} · 等级 {a.item.mod_rank} · {a.buyout_price??a.starting_price} 白金</option>;})}</select>{selected&&(()=>{const r=fromAuction(selected),weapon=weaponFor(r),title=rivenTitles(r,weapon);return <div className="tradeFinishAuctionCard"><Artwork item={weapon}/><div><strong>{title.primary}</strong>{title.secondary&&<small>{title.secondary}</small>}<small>等级 {selected.item.mod_rank} · 段位 {selected.item.mastery_level} · 洗练 {selected.item.re_rolls}</small>{selected.item.attributes.map(a=><p key={a.url_name} className={a.positive?'':'negative'}>{a.value>0?'+':''}{a.value.toFixed(1)} {rivenAttributeName(a.url_name,a.url_name)}</p>)}</div></div>;})()}<label><input type="checkbox" checked={checked} disabled={busy||finished} onChange={e=>setChecked(e.target.checked)}/>{L("已核对武器、名称、等级及全部词条与本次游戏成交一致","I verified the weapon, name, rank and all attributes against the game trade")}</label><button disabled={disabled||!canWrite||busy||!selected||!checked||finished||!finishAuctionFingerprint(selected)} onClick={()=>void finish()}>{L("确认游戏已卖出，结束此挂售","Confirm the in-game sale and close this contract")}</button>{!rows.length&&<p>{L("当前没有可处理的紫卡挂售。","No eligible Riven contracts.")}</p>}</>}{message&&<p role="status">{message}</p>}</div>;
}

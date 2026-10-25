import type {TradeCandidate} from './tradeCandidateRecord.ts';
import type {GameTradeFinished} from './tradeFinishModel.ts';
const asciiLower=(value:string)=>value.replace(/[A-Z]/g,c=>c.toLowerCase());
/** Mirrors game_events::matches_manual. A quote alone never becomes a receipt. */
export function matchingConfirmedTrades(candidate:TradeCandidate,side:'sale'|'purchase',itemId:string|null,events:readonly GameTradeFinished[]):string[]{
 if(!itemId||!candidate.partner?.trim())return [];
 const quoted=Date.parse(candidate.capturedAt);if(!Number.isFinite(quoted))return [];
 return events.filter(event=>{
  const elapsed=Date.parse(event.capturedAt)-quoted;
  if(!event.complete||event.kind!==side||asciiLower(event.partner)!==asciiLower(candidate.partner!.trim())||elapsed<0||elapsed>=901000)return false;
  const items=side==='sale'?event.sent:event.received,cash=side==='sale'?event.received:event.sent;
  return items.length===1&&items[0].itemId===itemId&&items[0].quantity===candidate.quantity&&cash.length===1&&cash[0].itemId==='/AF_Special/Platinum'&&cash[0].quantity===candidate.platinum;
 }).map(e=>e.id);
}

import type {Trade} from './api';
export type TradeCandidate={id:string;name:string;platinum:number;quantity:number;capturedAt:string;partner?:string};
export function tradeCandidateRecord(row:TradeCandidate,side:Trade['side'],itemId:string|null):Trade{
 return {id:'ocr:'+row.id,ts:row.capturedAt,itemId:itemId??'unresolved:'+row.name,name:row.name,side,
  quantity:row.quantity,platinum:row.platinum,partner:typeof row.partner==='string'?row.partner.trim():'',category:'chat-confirmed'};
}

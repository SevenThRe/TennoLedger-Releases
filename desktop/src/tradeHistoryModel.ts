import {searchText} from './searchText.ts';
import type {Trade,Exchange} from './api';
export type HistoryOrder='date'|'platinum'|'partner';
export function filterTradeHistory(trades:readonly Trade[],side:'all'|Trade['side'],query:string,order:HistoryOrder,reversed:boolean,names:ReadonlyMap<string,string>=new Map()):Trade[]{
 const search=query.trim().toLocaleLowerCase();
 const rows=trades.filter(t=>(side==='all'||t.side===side)&&[t.name,t.partner,names.get(t.itemId)??''].some(s=>searchText(search,s)));
 const direction=(order==='partner'?!reversed:reversed)?-1:1;
 return rows.sort((a,b)=>direction*(order==='partner'?a.partner.localeCompare(b.partner):order==='platinum'?a.platinum-b.platinum:(Date.parse(a.ts)||0)-(Date.parse(b.ts)||0)));
}

export const platinumId='/AF_Special/Platinum';
export const exchangeCurrency=(e:Exchange,side:'sent'|'received')=>e[side].filter(i=>i.itemId===platinumId).reduce((n,i)=>n+i.quantity,0);
export function exchangeHistory(trades:readonly Trade[],exchanges:readonly Exchange[],side:'all'|Exchange['kind'],query:string,order:HistoryOrder,reversed:boolean,names:ReadonlyMap<string,string>=new Map()){
 const converted:Exchange[]=trades.map(t=>{const item={itemId:t.itemId,quantity:t.quantity},currency={itemId:platinumId,quantity:t.platinum};return {id:t.id,ts:t.ts,partner:t.partner,kind:t.side,sent:t.side==='sale'?[item]:[currency],received:t.side==='sale'?[currency]:[item]};});
 const search=query.trim().toLocaleLowerCase();
 const legacyNames=new Map(trades.map(t=>[t.itemId,t.name]));
 const rows=[...converted,...exchanges].filter(e=>(side==='all'||e.kind===side)&&[e.partner,...[...e.sent,...e.received].flatMap(i=>[names.get(i.itemId)??'',legacyNames.get(i.itemId)??'',i.itemId])].some(s=>searchText(search,s)));
 const direction=(order==='partner'?!reversed:reversed)?-1:1;
 const total=(e:Exchange)=>exchangeCurrency(e,'sent')+exchangeCurrency(e,'received');
 return rows.sort((a,b)=>direction*(order==='partner'?a.partner.localeCompare(b.partner):order==='platinum'?total(a)-total(b):(Date.parse(a.ts)||0)-(Date.parse(b.ts)||0)));
}

export function exchangeItemName(id:string){return id.startsWith('/AF_Special/Riven/')?id.slice('/AF_Special/Riven/'.length).replaceAll('/',' '):id.startsWith('/AF_Special/Other/')?id.slice('/AF_Special/Other/'.length):id.split('/').at(-1)||id;}

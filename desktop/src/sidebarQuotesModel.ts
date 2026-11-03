import {marketOrderQuotes} from './marketModel.ts';
export type SidebarOrder=Record<string,any>;
export function sidebarQuotes(rows:SidebarOrder[],target:{rank?:number;subtype?:string;charges?:number;amberStars?:number;cyanStars?:number},inGameOnly=true){
 const variant={...target,rank:target.rank??0};
 return marketOrderQuotes(rows.filter(row=>(!inGameOnly||row?.user?.status==='ingame')&&(target.rank===undefined||row.rank===target.rank)),variant,!inGameOnly);
}
export function sidebarEmptyReason(rows:SidebarOrder[],target:Parameters<typeof sidebarQuotes>[1],mode='sell',en=false){
 const matching=marketOrderQuotes(rows,{...target,rank:target.rank??0},true).filter(r=>r.type===mode);
 const online=matching.filter(r=>r.user.status==='online').length,offline=matching.filter(r=>r.user.status==='offline').length;
 const side=mode==='sell'?(en?'sellers':'卖家'):(en?'buyers':'买家');
 if(online)return en?`No in-game ${side} · ${online} online`:`暂无游戏中${side} · ${online} 个在线`;
 if(offline)return en?`No online ${side} · ${offline} offline orders`:`暂无在线${side} · ${offline} 个离线订单`;
 return en?'No orders for this variant':'此规格暂无订单';
}
export const quoteLocale=(value:unknown)=>typeof value==='string'&&value.trim()?(({en:'EN',zh:'ZH-S','zh-hans':'ZH-S','zh-cn':'ZH-S','zh-hant':'ZH-T','zh-tw':'ZH-T',tc:'ZH-T',sc:'ZH-S'} as Record<string,string>)[value.toLowerCase()]??value.toUpperCase()):'—';
export function quotePlatform(value:unknown){const code=String(value??'');return ({pc:'PC',ps4:'PS',psn:'PS',xbox:'XB',switch:'SW',mobile:'MOBILE'} as Record<string,string>)[code]??(code?code.toUpperCase():'—');}

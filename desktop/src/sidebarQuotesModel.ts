import {marketOrderQuotes} from './marketModel.ts';
export type SidebarOrder=Record<string,any>;
export function sidebarQuotes(rows:SidebarOrder[],target:{rank?:number;subtype?:string;charges?:number;amberStars?:number;cyanStars?:number},inGameOnly=true){
 const variant={...target,rank:target.rank??0};
 return marketOrderQuotes(rows.filter(row=>(!inGameOnly||row?.user?.status==='ingame')&&(target.rank===undefined||row.rank===target.rank)),variant,!inGameOnly);
}
export const quoteLocale=(value:unknown)=>typeof value==='string'&&value.trim()?(({en:'EN',zh:'ZH-S','zh-hans':'ZH-S','zh-cn':'ZH-S','zh-hant':'ZH-T','zh-tw':'ZH-T',tc:'ZH-T',sc:'ZH-S'} as Record<string,string>)[value.toLowerCase()]??value.toUpperCase()):'—';
export function quotePlatform(value:unknown){const code=String(value??'');return ({pc:'PC',ps4:'PS',psn:'PS',xbox:'XB',switch:'SW',mobile:'MOBILE'} as Record<string,string>)[code]??(code?code.toUpperCase():'—');}

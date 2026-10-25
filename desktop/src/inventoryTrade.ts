export type InventoryTradeTarget={id:string;slug:string;name:string;englishName:string;rank?:number;subtype?:string;platform?:string;charges?:number;amberStars?:number;cyanStars?:number;perTrade?:number};
export const inventoryTradeEvent='myframe-inventory-trade';
export function inventoryTradeTarget(value:unknown):InventoryTradeTarget|null{
 if(!value||typeof value!=='object')return null;
 const v=value as Record<string,unknown>;
 if(typeof v.id!=='string'||!v.id||typeof v.slug!=='string'||! /^[a-z0-9_]+$/.test(v.slug)||typeof v.name!=='string'||!v.name||typeof v.englishName!=='string'||!v.englishName)return null;
 if(v.rank!==undefined&&(!Number.isInteger(v.rank)||Number(v.rank)<0||Number(v.rank)>100))return null;
 if(v.subtype!==undefined&&(typeof v.subtype!=='string'||!['intact','exceptional','flawless','radiant'].includes(v.subtype)))return null;
 if(v.platform!==undefined&&(typeof v.platform!=='string'||!['pc','ps4','xbox','switch'].includes(v.platform)))return null;
 const extras:Partial<InventoryTradeTarget>={};
 for(const field of ['charges','amberStars','cyanStars','perTrade'] as const){if(v[field]===undefined)continue;const value=v[field];if(typeof value!=='number'||!Number.isInteger(value)||value<(field==='perTrade'?1:0)||value>(field==='perTrade'?6:field==='charges'?9999:10))return null;extras[field]=value;}
 return {...extras,id:v.id,slug:v.slug,name:v.name,englishName:v.englishName,...(v.rank!==undefined?{rank:v.rank as number}:{}),...(v.subtype!==undefined?{subtype:v.subtype as string}:{}),...(v.platform!==undefined?{platform:v.platform as string}:{})};
}
export function openInventoryTrade(value:InventoryTradeTarget){const target=inventoryTradeTarget(value);if(target)window.dispatchEvent(new CustomEvent(inventoryTradeEvent,{detail:target}));}

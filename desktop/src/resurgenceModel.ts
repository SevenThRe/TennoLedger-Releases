import type {VoidTrader} from './worldModel';
import {vendorId} from './vendorCatalogModel.ts';
export type ResurgenceOffer={ItemType:string;PrimePrice?:number;RegularPrice?:number};
export type ResurgenceTrader=Omit<VoidTrader,'Manifest'> & {Completed?:boolean;Manifest?:ResurgenceOffer[];EvergreenManifest?:ResurgenceOffer[]};
export function activeResurgence(traders:ResurgenceTrader[],now:number){
 return traders.find(t=>!t.Completed&&Number(t.Activation?.$date?.$numberLong)<=now&&Number(t.Expiry?.$date?.$numberLong)>now);
}
export function resurgenceOffers(trader:ResurgenceTrader|undefined){
 return (['Manifest','EvergreenManifest'] as const).flatMap(section=>(trader?.[section]??[]).map((offer,index)=>({
  ...offer,id:vendorId(offer.ItemType),section,key:`${section}:${index}:${offer.ItemType}`,
 })));
}
export function rotationCountdown(expiry:number,now:number,en=false){
 if(!Number.isFinite(expiry)||!Number.isFinite(now))return '—';
 const minutes=Math.max(0,Math.floor((expiry-now)/60000)),hours=Math.floor(minutes/60),days=Math.floor(hours/24);
 return days?(en?`${days}d ${hours%24}h`:`${days}天 ${hours%24}小时`):(en?`${hours}h ${minutes%60}m`:`${hours}小时 ${minutes%60}分钟`);
}

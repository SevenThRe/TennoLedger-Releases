import type {Wanted} from './rivenModel';
import {rivenMarketStats} from './rivenMarketExport.ts';
export type RivenSource='all'|'wfm'|'riven-market';
export type RivenMarketListing={id:string;weapon:string;name:string;price:number;rank:number;masteryLevel:number;rerolls:number;attributes:{code:string;value:number;positive:boolean}[];source:'riven.market';link:string;age?:string};
export function parseRivenMarketListings(input:unknown):RivenMarketListing[]{
 if(!Array.isArray(input))throw Error('Riven.market 挂牌格式变化');
 return input.filter((r):r is RivenMarketListing=>{
  if(!r||typeof r!=='object'||r.source!=='riven.market'||typeof r.id!=='string'||!/^\d+$/.test(r.id)||typeof r.weapon!=='string'||typeof r.name!=='string'||!Number.isFinite(r.price)||r.price<=0||!Number.isInteger(r.rank)||r.rank<0||r.rank>8||!Number.isInteger(r.masteryLevel)||r.masteryLevel<0||!Number.isInteger(r.rerolls)||r.rerolls<0||!Array.isArray(r.attributes)||!r.attributes.length)return false;
  try{const url=new URL(r.link);if(url.protocol!=='https:'||url.hostname!=='riven.market'||!url.pathname.startsWith('/list/')||url.username||url.password||url.port)return false;}catch{return false;}
  return r.attributes.every((a:unknown)=>!!a&&typeof a==='object'&&'code'in a&&typeof a.code==='string'&&'value'in a&&typeof a.value==='number'&&Number.isFinite(a.value)&&'positive'in a&&typeof a.positive==='boolean');
 });
}
export function matchingRivenMarketListings(rows:readonly RivenMarketListing[],wanted:Wanted){
 const code=(slug:string)=>Object.hasOwn(rivenMarketStats,slug)?rivenMarketStats[slug]:undefined;
 return rows.filter(row=>{
  const positive=new Set(row.attributes.filter(a=>a.positive).map(a=>a.code)),negative=new Set(row.attributes.filter(a=>!a.positive).map(a=>a.code));
  return !(wanted.minSimilarity??0)&&(!wanted.negativeRequired||negative.size>0)&&(wanted.minPrice==null||row.price>=wanted.minPrice)&&(wanted.minRerolls==null||row.rerolls>=wanted.minRerolls)&&(wanted.maxPrice===null||row.price<=wanted.maxPrice)&&(wanted.maxRerolls===null||row.rerolls<=wanted.maxRerolls)&&(wanted.maxMastery===null||row.masteryLevel<=wanted.maxMastery)&&wanted.required.every(slug=>!!code(slug)&&positive.has(code(slug)!))&&(!wanted.negative||wanted.negativeOptional||!!code(wanted.negative)&&negative.has(code(wanted.negative)!));
 }).map(row=>({...row,score:100+wanted.optional.filter(slug=>!!code(slug)&&row.attributes.some(a=>a.positive&&a.code===code(slug))).length*10})).sort((a,b)=>b.score-a.score||a.price-b.price);
}

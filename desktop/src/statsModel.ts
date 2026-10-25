import type {Point,Trade,Exchange} from './api';
import {historySeries,type HistoryField} from './assetHistoryModel.ts';

export const dayMs=86400000;
export const balanceFields=['plat','ducats','endo','credits','aya','vitus'] as const;
export type BalanceField=typeof balanceFields[number];
export type StatsField=BalanceField|'played'|'relicOpened'|'trades';
export type CalendarGroup='daily'|'weekly'|'monthly'|'yearly';
export type DateRange={start:number;end:number}; // Inclusive UTC days.
export const validAmount=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
export function utcDay(value:string|number){const n=typeof value==='number'?value:Date.parse(value);return Number.isFinite(n)?Math.floor(n/dayMs)*dayMs:NaN;}
export function dateKey(value:number){return new Date(value).toISOString().slice(0,10);}
export function parseDateInput(value:string){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
 const time=Date.parse(value+'T00:00:00Z');
 return Number.isFinite(time)&&dateKey(time)===value?time:null;
}
export function dateRange(start:string,end:string):DateRange|null{
 const min=parseDateInput(start),max=parseDateInput(end);
 return min!==null&&max!==null&&min<=max?{start:min,end:max}:null;
}
export function inDateRange(ts:string,range:DateRange){const time=Date.parse(ts);return Number.isFinite(time)&&time>=range.start&&time<range.end+dayMs;}
export function presetRange(points:readonly Point[],days:number,now:number):DateRange{
 const end=utcDay(now),dates=points.map(p=>utcDay(p.ts)).filter(Number.isFinite);
 return {start:days?end-(days-1)*dayMs:dates.length?dates.reduce((a,b)=>Math.min(a,b),Infinity):end,end};
}
export function confirmedEvents(trades:readonly Trade[],exchanges:readonly Exchange[]){
 // New structured records replace a legacy record with the same stable ID.
 const unique=new Map<string,Trade|Exchange>();
 for(const event of [...trades,...exchanges])if(event.id&&Number.isFinite(Date.parse(event.ts)))unique.set(event.id,event);
 return [...unique.values()].sort((a,b)=>Date.parse(a.ts)-Date.parse(b.ts));
}
export type ActivityDay={time:number;points:Point[];events:(Trade|Exchange)[];relics:number|null;trades:number|null;tradesPartial:boolean;relicsPartial?:boolean};
export function activityDays(points:readonly Point[],trades:readonly Trade[],exchanges:readonly Exchange[]){
 const buckets=new Map<number,ActivityDay>();
 const get=(time:number)=>{let d=buckets.get(time);if(!d){d={time,points:[],events:[],relics:null,trades:null,tradesPartial:true};buckets.set(time,d);}return d;};
 for(const p of [...points].sort((a,b)=>Date.parse(a.ts)-Date.parse(b.ts))){const time=utcDay(p.ts);if(Number.isFinite(time))get(time).points.push(p);}
 for(const event of confirmedEvents(trades,exchanges))get(utcDay(event.ts)).events.push(event);
 for(const d of buckets.values()){
  const relics=d.points.map(p=>p.relicOpened),counts=d.points.map(p=>p.trades);
  const knownRelics=relics.filter(validAmount);d.relics=knownRelics.length?knownRelics.reduce((n,v)=>n+v,0):null;d.relicsPartial=knownRelics.length<relics.length;
  const knownCounts=counts.filter(validAmount);const historical=knownCounts.length?knownCounts.reduce((n,v)=>n+v,0):null;
  // Historical daily counters and confirmed local records overlap. Never add them.
  d.trades=historical===null?(d.events.length||null):Math.max(historical,d.events.length);
  d.tradesPartial=historical===null||knownCounts.length<counts.length;
 }
 return [...buckets.values()].sort((a,b)=>a.time-b.time);
}
export function activitySummary(days:readonly ActivityDay[],range:DateRange){
 const selected=days.filter(d=>d.time>=range.start&&d.time<=range.end);
 const total=(field:'relics'|'trades')=>{
  const known=selected.map(d=>d[field]).filter(validAmount);
  return {value:known.length?known.reduce((a,b)=>a+b,0):null,partial:known.length<selected.length||(field==='trades'&&selected.some(d=>d.tradesPartial))||(field==='relics'&&selected.some(d=>d.relicsPartial))};
 };
 return {days:selected.length,relics:total('relics'),trades:total('trades')};
}
export function statsSeries(points:readonly Point[],days:readonly ActivityDay[],field:StatsField,range:DateRange,mode:'balance'|'change'){
 if(field==='played'||field==='relicOpened'||field==='trades')return days.filter(d=>d.time>=range.start&&d.time<=range.end).map(d=>[d.time,field==='played'?1:field==='relicOpened'?d.relics:d.trades] as [number,number|null]);
 const daily=historySeries(points,field as HistoryField).values;
 return daily.map(([time,value],i)=>[time,mode==='balance'?value:i===0||value===null||daily[i-1][1]===null?null:value-daily[i-1][1]!] as [number,number|null]).filter(([time])=>time>=range.start&&time<=range.end);
}
export type CalendarDay={time:number;day:number;inRange:boolean;inMonth:boolean;recorded:boolean};
export function calendarMonths(year:number,range:DateRange,days:readonly ActivityDay[]){
 const recorded=new Set(days.map(d=>d.time));
 return Array.from({length:12},(_,month)=>{
  const start=Date.UTC(year,month,1),end=Date.UTC(year,month+1,0),offset=(new Date(start).getUTCDay()+6)%7;
  const cells:CalendarDay[]=Array.from({length:new Date(end).getUTCDate()},(_,n)=>{const time=start+n*dayMs;return {time,day:n+1,inMonth:true,inRange:time>=range.start&&time<=range.end,recorded:recorded.has(time)};});
  const weeks=Array.from({length:Math.ceil((offset+cells.length)/7)},(_,w)=>{
   const from=start-offset*dayMs+w*7*dayMs,to=from+6*dayMs;
   return {start:from,end:to,recorded:days.some(d=>d.time>=Math.max(from,range.start,start)&&d.time<=Math.min(to,range.end,end)),days:Array.from({length:7},(_,n)=>{const time=from+n*dayMs;return {time,day:new Date(time).getUTCDate(),inMonth:time>=start&&time<=end,inRange:time>=range.start&&time<=range.end,recorded:recorded.has(time)};})};
  });
  return {month,start,end,offset,cells,weeks,count:cells.filter(d=>d.recorded&&d.inRange).length};
 }).filter(m=>m.end>=range.start&&m.start<=range.end);
}
export function calendarPeriods(group:'monthly'|'yearly',year:number,range:DateRange,days:readonly ActivityDay[]){
 const first=new Date(range.start).getUTCFullYear(),last=new Date(range.end).getUTCFullYear();
 const periods=group==='yearly'?Array.from({length:last-first+1},(_,i)=>({start:Date.UTC(first+i,0,1),end:Date.UTC(first+i+1,0,0)})):Array.from({length:12},(_,m)=>({start:Date.UTC(year,m,1),end:Date.UTC(year,m+1,0)}));
 return periods.filter(p=>p.end>=range.start&&p.start<=range.end).map(p=>({...p,count:days.filter(d=>d.time>=Math.max(p.start,range.start)&&d.time<=Math.min(p.end,range.end)).length}));
}

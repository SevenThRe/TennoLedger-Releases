import type {Point} from './api';
export const historyFields=['plat','ducats','endo','credits','aya','vitus','relicOpened','trades','played'] as const;
export type HistoryField=typeof historyFields[number];
export function historySeries(points:readonly Point[],field:HistoryField){
 const sorted=points.filter(p=>Number.isFinite(Date.parse(p.ts))).slice().sort((a,b)=>Date.parse(a.ts)-Date.parse(b.ts));
 const days=new Map<number,Point[]>();
 for(const point of sorted){const day=Math.floor(Date.parse(point.ts)/86400000)*86400000;const bucket=days.get(day)??[];bucket.push(point);days.set(day,bucket);}
 const values=[...days].map(([day,rows])=>{
  if(field==='played')return [day,1] as [number,number|null];
  const valid=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
  if(field==='trades'||field==='relicOpened'){
   const entries=rows.map(row=>row[field]);
   return [day,entries.every(valid)?entries.reduce((sum,n)=>sum+n,0):null] as [number,number|null];
  }
  const observations=rows.filter(row=>Object.hasOwn(row,field));
  const last=observations.at(-1)?.[field];
  return [day,valid(last)?last:null] as [number,number|null];
 });
 const changes=values.map(([time,value],i)=>[time,value===null?null:i===0?0:values[i-1][1]===null?null:value-values[i-1][1]!] as [number,number|null]);
 return {values,changes};
}
export function historyRange(points:readonly Point[],days:number,now:number){
 const times=points.map(p=>Date.parse(p.ts)).filter(Number.isFinite);
 return {min:days?now-days*86400000:times.length?Math.floor(times.reduce((min,time)=>Math.min(min,time),Infinity)/86400000)*86400000:now-30*86400000,max:now};
}

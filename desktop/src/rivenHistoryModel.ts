export type RivenHistoryPoint={time:number;average:number|null;baseline:number|null;samples:number|null;daysAveraged:number|null};
export function normalizeRivenHistory(input:unknown):RivenHistoryPoint[]{
 if(!Array.isArray(input))throw Error('历史来源格式已变化');
 const points=new Map<number,RivenHistoryPoint>();
 const positive=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)&&value>0?value:null;
 for(const raw of input){
  if(!raw||typeof raw!=='object')continue;
  const value=raw as Record<string,unknown>,stamp=value.endts??value.time;
  const time=typeof stamp==='number'?stamp:typeof stamp==='string'?Date.parse(/^\d{4}-\d{2}-\d{2}T[\d:.]+$/.test(stamp)?stamp+'Z':stamp):NaN;
  if(!Number.isFinite(time))continue;
  points.set(time,{time,average:positive(value.price),baseline:positive(value.basePrice),samples:positive(value.samples),daysAveraged:positive(value.daysAveraged)});
 }
 return [...points.values()].sort((a,b)=>a.time-b.time);
}
export function rivenHistoryWindow(points:readonly RivenHistoryPoint[],days:number){
 const end=points.at(-1)?.time??null;
 return {start:end===null?null:days?end-days*86400000:points[0].time,end};
}
export function rivenHistoryAttributes(input:unknown){
 const last=normalizeRivenHistory(input).at(-1);if(!last||!Array.isArray(input))return [];
 const raw=[...input].reverse().find(value=>normalizeRivenHistory([value])[0]?.time===last.time) as Record<string,unknown>|undefined;
 const prices=raw?.attrPriceAvg,popularity=raw?.attrPopulatity;
 if(!prices||typeof prices!=='object'||Array.isArray(prices))return [];
 return Object.entries(prices).slice(0,100).map(([tag,value])=>{const usage=popularity&&typeof popularity==='object'?(popularity as Record<string,unknown>)[tag]:null;return {tag,time:last.time,price:typeof value==='number'&&Number.isFinite(value)&&value>0?value:null,usage:typeof usage==='number'&&Number.isFinite(usage)&&usage>=0&&usage<=1?usage:null};});
}

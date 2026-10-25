import {intervalStats,runEstimate,expectedVitus} from './arbitrationRunModel.ts';
import type {ArbitrationRun,RunPage} from './arbitrationRunModel';
export type DroneHistory=Pick<ArbitrationRun,'droneTelemetry'|'gameplayStart'|'gameplayEnd'|'startLogSeconds'|'lastLogSeconds'|'droneTimes'>;
export type DroneTrendPoint={seconds:number;rate:number};
/** View-only 3.0.4 rolling spawn-rate series. Filter the returned series after measuring. */
export function droneTrend(run:DroneHistory,windowSeconds:number):DroneTrendPoint[]{
 if(!run.droneTelemetry||!Number.isFinite(run.lastLogSeconds)||!Number.isFinite(windowSeconds)||windowSeconds<=0)return [];
 const start=run.gameplayStart??run.startLogSeconds,end=Math.min(run.lastLogSeconds,run.gameplayEnd??run.lastLogSeconds);
 if(!Number.isFinite(start)||end<=start)return [];
 const times=run.droneTimes.filter(time=>Number.isFinite(time)&&time>=start&&time<=end).slice().sort((a,b)=>a-b);
 const step=Math.max(5,Math.ceil(windowSeconds/30)*5,Math.ceil((end-start)/1800/5)*5),points:DroneTrendPoint[]=[];
 let left=0,right=0;
 for(let seconds=Math.min(start+step,end);;seconds=Math.min(seconds+step,end)){
  const from=Math.max(start,seconds-windowSeconds);
  while(right<times.length&&times[right]<=seconds)right++;
  while(left<right&&times[left]<=from&&from>start)left++;
  points.push({seconds,rate:(right-left)*60/(seconds-from)});
  if(seconds===end)return points;
 }
}

export type RunOrder='newest'|'oldest'|'duration'|'intervals'|'pace'|'vitus'|'vitusRate';
export type LibraryFilters={nodeId?:string;missionType?:string;status?:string;captureQuality?:string;perspective?:string;favorite?:string;date?:string};
export const captureSeconds=(r:ArbitrationRun)=>Math.max(0,r.lastLogSeconds-r.startLogSeconds);
export function filterRunLibrary(runs:readonly ArbitrationRun[],search:string,filters:LibraryFilters,order:RunOrder,now=Date.now(),localized:Readonly<Record<string,string>>={}){
 const query=search.trim().normalize('NFKC').toLocaleLowerCase(),cutoff=filters.date?now-Number(filters.date)*86400000:0,date=(r:ArbitrationRun)=>Date.parse(r.startUtc??r.endUtc??'')||0;
 const values=runs.filter(r=>r.status!=='recording'&&(!query||[r.node,r.nodeId,r.planet,r.missionType,r.metadata.role,r.metadata.notes,localized[r.nodeId]??''].join(' ').normalize('NFKC').toLocaleLowerCase().includes(query))&&(!filters.nodeId||r.nodeId===filters.nodeId)&&(!filters.missionType||r.missionType===filters.missionType)&&(!filters.status||r.status===filters.status)&&(!filters.captureQuality||filters.captureQuality===(r.hasGap?'partial':'complete'))&&(!filters.perspective||filters.perspective===(r.isHost===true?'host':r.isHost===false?'client':'unknown'))&&(filters.favorite!=='yes'||r.metadata.favorite)&&(!cutoff||date(r)>=cutoff));
 const estimates=new Map(values.map(r=>[r.id,runEstimate(r)]));
 return values.slice().sort((left,right)=>{
  const time=date(right)-date(left),tie=time||left.id.localeCompare(right.id);
  if(order==='oldest')return -time||left.id.localeCompare(right.id);
  if(order==='duration')return captureSeconds(right)-captureSeconds(left)||tie;
  if(order==='intervals')return (right.wavesCompleted||right.rewardCycles||0)-(left.wavesCompleted||left.rewardCycles||0)||tie;
  if(order==='pace')return (intervalStats(left)?.median??Infinity)-(intervalStats(right)?.median??Infinity)||tie;
  if(order==='vitus'||order==='vitusRate'){const key=order==='vitus'?'low':'lowRate';return (estimates.get(right.id)?.[key]??-Infinity)-(estimates.get(left.id)?.[key]??-Infinity)||tie;}
  return tie;
 });
}
/** Read all existing 50-record pages without presenting a partially sorted library. */
export async function readRunLibrary(read:(offset:number)=>Promise<RunPage>,current:()=>boolean):Promise<ArbitrationRun[]|null>{
 for(let attempt=0;attempt<2;attempt++){
  let offset=0,total:number|null=null,changed=false;const runs=new Map<string,ArbitrationRun>();
  while(current()){
   const page=await read(offset);if(!current())return null;
   if(!page||!Array.isArray(page.runs)||!Number.isSafeInteger(page.total)||page.total<0||page.runs.length>50)throw Error('Incomplete run library response');
   if(total!==null&&page.total!==total){changed=true;break;}total=page.total;
   for(const run of page.runs){if(!run||typeof run.id!=='string'||!run.id)throw Error('Invalid run identity');if(runs.has(run.id))changed=true;runs.set(run.id,run);}
   offset+=page.runs.length;
   if(offset>=total){if(!changed&&runs.size===total)return [...runs.values()];changed=true;break;}
   if(!page.runs.length)throw Error('Run library page was incomplete');
  }
  if(!current())return null;
  if(!changed)break;
 }
 throw Error('Run library changed while reading; retry');
}
export type ReportInterval={index:number;kind:string;start:number;end:number;duration:number;active:number|null;pause:number|null;drones:number|null};
export function reportIntervals(run:ArbitrationRun):ReportInterval[]{
 const raw=run.intervals.filter(i=>i.complete&&i.end!==null&&Number.isFinite(i.start)&&Number.isFinite(i.end)&&i.end!>i.start).slice().sort((a,b)=>a.start-b.start),origin=run.startLogSeconds;
 return raw.map(i=>{const next=run.intervals.filter(n=>n.kind===i.kind&&n.start>i.start).sort((a,b)=>a.start-b.start)[0],end=next&&next.start>=i.end!?next.start:i.end!,observedActive=i.kind==='wave'&&(!next||i.end!<next.start)?i.end!-i.start:null;
 return {index:i.index,kind:i.kind,start:i.start-origin,end:end-origin,duration:end-i.start,active:observedActive,pause:observedActive!==null&&next?Math.max(0,next.start-i.end!):null,drones:run.droneTelemetry?i.drones:null};});
}
export function firstIntervalsRange(run:ArbitrationRun,count:number):[number,number]|null{
 if(!Number.isInteger(count)||count<1)return null;const rows=reportIntervals(run).slice(0,count);
 return rows.length===count&&rows.every((r,i)=>r.index===i+1&&r.kind===rows[0].kind)?[rows[0].start,rows.at(-1)!.end]:null;
}
export const median=(values:readonly number[])=>{const v=values.filter(Number.isFinite).slice().sort((a,b)=>a-b);return v.length?v.length%2?v[Math.floor(v.length/2)]:(v[v.length/2-1]+v[v.length/2])/2:null;};
export type ObservationMetric='enemies'|'drones'|'enemyRate'|'droneRate'|'live';
export function observationSeries(run:ArbitrationRun,metric:ObservationMetric){
 if((metric==='drones'||metric==='droneRate')&&!run.droneTelemetry||(metric==='enemies'||metric==='enemyRate')&&run.enemySpawns===null)return [];
 const rows=run.samples.filter(s=>Number.isFinite(s.seconds)).slice().sort((a,b)=>a.seconds-b.seconds),field=metric==='enemyRate'?'enemies':metric==='droneRate'?'drones':metric;
 return rows.map((sample,index)=>{let value:number|null=sample[field];if(metric==='enemyRate'||metric==='droneRate'){const previous=rows[index-1],span=previous?sample.seconds-previous.seconds:0;value=previous&&Number.isFinite(value)&&Number.isFinite(previous[field])&&span>0&&value>=previous[field]?(value-previous[field])*60/span:null;}return {x:sample.seconds-run.startLogSeconds,y:value!==null&&Number.isFinite(value)?value:null};});
}
export function droneCadence(run:ArbitrationRun,from:number,to:number){
 const times=run.droneTelemetry?run.droneTimes.map(t=>t-run.startLogSeconds).filter(t=>Number.isFinite(t)&&t>=from&&t<=to).slice().sort((a,b)=>a-b):[],gaps=times.slice(1).map((end,index)=>({start:times[index],end,seconds:end-times[index]})),sorted=gaps.map(g=>g.seconds).sort((a,b)=>a-b);
 let peak=0,peak10=0,left=0,left10=0;times.forEach((time,right)=>{while(time-times[left]>=60)left++;peak=Math.max(peak,right-left+1);while(time-times[left10]>=10)left10++;peak10=Math.max(peak10,right-left10+1);});
 const width=Math.max(1,Math.ceil((sorted.at(-1)||1)/20)),bins=Array.from({length:sorted.length?Math.floor(sorted.at(-1)!/width)+1:0},(_,index)=>({from:index*width,to:(index+1)*width,count:0}));for(const gap of sorted)bins[Math.floor(gap/width)].count++;
 return {known:run.droneTelemetry,count:times.length,gaps,bins,peak,peak10,median:median(sorted),mean:sorted.length?sorted.reduce((n,v)=>n+v,0)/sorted.length:null,p90:sorted.length?sorted[Math.max(0,Math.ceil(sorted.length*.9)-1)]:null,longest:gaps.slice().sort((a,b)=>b.seconds-a.seconds).slice(0,3),maximumBin:Math.max(1,...bins.map(b=>b.count))};
}
export function waveRecap(run:ArbitrationRun){
 if(run.status!=='recording'||run.gameplayEnd!==null)return null;
 const waves=run.intervals.filter(i=>i.kind==='wave'),last=waves.at(-1);
 if(!last?.complete||last.end===null||!Number.isFinite(last.end)||last.end<=last.start||last.end>run.lastLogSeconds)return null;
 const seconds=last.end-last.start,observed=run.droneTelemetry&&run.droneTimes.length===run.droneSpawns,rows=reportIntervals(run),previous=rows.filter(i=>i.kind==='wave'&&i.index<last.index&&i.active!==null),drones=observed?run.droneTimes.filter(t=>t>=last.start&&t<=last.end!).length:null,previousSeconds=previous.reduce((n,i)=>n+i.active!,0),previousDrones=previous.reduce((n,i)=>n+run.droneTimes.filter(t=>t>=i.start+run.startLogSeconds&&t<=i.start+run.startLogSeconds+i.active!).length,0),rate=drones!==null?drones*60/seconds:null,averageRate=observed&&previousSeconds>0?previousDrones*60/previousSeconds:null;
 const mirror=run.missionType==='Mirror Defense'||['SolNode719','SolNode450'].includes(run.nodeId)||['Munio','Tyana Pass'].includes(run.node),cycleLength=mirror?2:3,cycles=run.rewardCycles;let before:number|null=null;const rewards=run.timeline.filter(e=>(e.kind==='reward'||e.kind==='rotation')&&e.seconds<=last.end!);if(cycles!==null&&Number.isInteger(cycles)&&cycles>=0){if(rewards.length===cycles&&cycles>0)before=rewards.filter(e=>e.seconds<last.start).length;else if(waves.every((w,i)=>w.complete&&w.index===i+1)&&run.gameplayStart!==null&&run.gameplayStart<=waves[0].start&&Math.floor(waves.length/cycleLength)===cycles)before=Math.floor((waves.length-1)/cycleLength);}const rewardVitus=before!==null&&cycles!==null?expectedVitus(0,cycles,false,mirror)-expectedVitus(0,before,false,mirror):null,vitus=drones!==null?{low:expectedVitus(drones,0,false,mirror)+(rewardVitus??0),high:expectedVitus(drones,0,true,mirror)+(rewardVitus??0)}:null;
 return {key:`${run.id}:${last.index}:${last.start}`,index:last.index,seconds,drones,rate,averageRate,rewardVitus,vitus,delta:rate!==null&&averageRate!==null&&averageRate>0?(rate/averageRate-1)*100:null,previousCount:previous.length,start:last.start,end:last.end};
}

export function runPhases(run:ArbitrationRun){
 const duration=captureSeconds(run),rows=reportIntervals(run).filter(i=>i.kind==='wave'),parts:{key:string;seconds:number;color:string}[]=[];
 const union=(ranges:[number,number][])=>{let total=0,end=-Infinity;for(const [from,to] of ranges.sort((a,b)=>a[0]-b[0])){const left=Math.max(0,from,end),right=Math.min(duration,to);if(right>left)total+=right-left;end=Math.max(end,right);}return total;};
 const setup=run.gameplayStart===null?0:Math.max(0,Math.min(duration,run.gameplayStart-run.startLogSeconds)),active=union(rows.filter(i=>i.active!==null).map(i=>[i.start,i.start+i.active!])),pause=union(rows.filter(i=>i.active!==null&&i.pause!==null).map(i=>[i.start+i.active!,i.end]));
 if(active>0)parts.push({key:'active',seconds:active,color:'#79d8c6'});if(pause>0)parts.push({key:'pause',seconds:pause,color:'#b9acfa'});if(setup>0)parts.push({key:'setup',seconds:setup,color:'#e2c18d'});const other=Math.max(0,duration-parts.reduce((n,p)=>n+p.seconds,0));if(other>1)parts.push({key:'other',seconds:other,color:'#637188'});return parts;
}

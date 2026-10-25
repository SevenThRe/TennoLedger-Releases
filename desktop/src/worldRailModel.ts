import type {WorldEvent} from './worldModel';

export const fissureTierOrder=['lith','meso','neo','axi','requiem','omnia'] as const;
/** Stable tier grouping from worldTimers.js; the input order inside a tier is retained. */
export function groupRailFissures(rows:readonly WorldEvent[]){
 const groups=new Map<string,WorldEvent[]>();
 for(const row of rows){const tier=(row.tier??'unknown').toLowerCase();groups.set(tier,[...groups.get(tier)??[],row]);}
 return [...groups].sort(([a],[b])=>{
  const order=(tier:string)=>{const index=fissureTierOrder.indexOf(tier as typeof fissureTierOrder[number]);return index<0?fissureTierOrder.length:index;};
  return order(a)-order(b);
 }).map(([tier,missions])=>({tier,missions}));
}
export function railTime(expiry:string|number,now:number){
 const seconds=Math.max(0,Math.floor(((typeof expiry==='number'?expiry:Date.parse(expiry))-now)/1000));
 if(!Number.isFinite(seconds))return '—';
 const d=Math.floor(seconds/86400),h=Math.floor(seconds%86400/3600),m=Math.floor(seconds%3600/60),s=seconds%60;
 return d?`${d}d ${h}h`:h?`${h}h ${m}m`:`${m}m ${s}s`;
}
/** WorldStateHelper.GetWorldStateTimerData: UTC daily/Monday; sortie noon Eastern, including DST. */
export function worldResetTimes(now:number){
 const day=86400000,date=new Date(now),midnight=Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate());
 const daily=midnight+day,weekly=midnight+((8-date.getUTCDay())%7||7)*day;
 const easternParts=(at:number)=>Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'numeric',day:'numeric',hour:'numeric',minute:'numeric',second:'numeric',hourCycle:'h23'}).formatToParts(at).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));
 const local=easternParts(now);let noon=Date.UTC(local.year,local.month-1,local.day,12);
 if(local.hour>=12)noon+=day;
 let sortie=noon;
 for(let i=0;i<3;i++){const part=easternParts(sortie);sortie+=noon-Date.UTC(part.year,part.month-1,part.day,part.hour,part.minute,part.second);}
 return {daily,weekly,sortie};
}

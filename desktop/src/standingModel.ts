export type Affiliation={tag:string;rank:number|null;standing:number|null};
export type StandingSnapshot={capturedAt:string;affiliations:Affiliation[];dailyRemaining:Record<string,number>};
export type SyndicateMeta={tag:string;zh:string;name:string;image:string;dailyKey:string|null;group:string;weekly:boolean;titles:{level:number;minStanding:number;maxStanding:number}[]};
export function nextDailyReset(now:number){return new Date((Math.floor(now/86400000)+1)*86400000).toISOString();}
export function dailyIsCurrent(capturedAt:string,now:number){const at=Date.parse(capturedAt);return Number.isFinite(at)&&at<=now+120000&&Math.floor(at/86400000)===Math.floor(now/86400000);}
export function rankProgress(meta:SyndicateMeta,entry?:Affiliation){
 if(entry?.standing==null)return null;
 const rank=entry.rank;
 if(rank==null)return {value:entry.standing,max:null,ratio:null};
 const title=meta.titles.find(t=>t.level===rank);
 const base=title?(rank<0?title.maxStanding:title.minStanding):rank===0?0:null;
 const max=title?title.maxStanding-title.minStanding:rank===0?Math.min(...meta.titles.filter(t=>t.level>0).map(t=>t.minStanding)):null;
 const value=base==null?entry.standing:entry.standing-base;
 return {value,max:max!=null&&Number.isFinite(max)&&max>0?max:null,ratio:max!=null&&max>0?Math.max(0,Math.min(1,Math.abs(value)/max)):null};
}
export function dailyRemaining(snapshot:StandingSnapshot|null|undefined,key:string|null,now:number):number|null{
 if(!snapshot||!key||!dailyIsCurrent(snapshot.capturedAt,now))return null;
 const n=snapshot.dailyRemaining[key];return Number.isFinite(n)&&n>=0?n:null;
}
export function assetCount(snapshot:{complete:boolean;counts:Record<string,number>}|null,id:string):number|null{
 return snapshot?(snapshot.counts[id]??(snapshot.complete?0:null)):null;
}

import {searchText} from './searchText.ts';
export type Reward={id:string;name:string;chance:number;ducats?:number|null;marketSlug?:string};
export type Relic={id:string;aliases?:string[];name:string;base:string;era:string;refinement:string;vaulted:boolean|null;rewards:Reward[];marketSlug?:string|null;drops?:{location:string;chance:number}[]};
export type Inventory={favorites?:string[];complete:boolean;counts:Record<string,number>;ranks?:Record<string,number>;masteryAccount?:{ranksComplete?:boolean}|null};
export function relicResultWindow<T>(rows:readonly T[],fullInventoryExperienceEnabled:boolean,showAllResults:boolean){
 const limited=!fullInventoryExperienceEnabled&&!showAllResults&&rows.length>50;
 return {items:limited?rows.slice(0,50):rows,limited};
}
/** Missing without a tier means no copies at any tier; unknown counts are not missing. */
export function relicOwnershipMatches(counts:readonly (number|null)[],filter:string,minimum=1){
 if(filter==='all')return true;
 if(filter==='unknown')return counts.some(n=>n===null);
 if(filter==='missing')return counts.length>0&&counts.every(n=>n===0);
 return counts.some(n=>n!==null&&n>=minimum);
}
export function owned(s:Inventory|null,id:string):number|null {return s?(s.counts[id]??(s.complete?0:null)):null;}
export function squadChance(percent:number,players:number):number {if(!Number.isFinite(percent)||percent<0||percent>100||!Number.isInteger(players)||players<1||players>4)throw new Error('Invalid probability or squad size');return 100*(1-(1-percent/100)**players);}
export function desiredChance(relic:Relic,ids:Set<string>,players:number):number {return squadChance(Math.min(100,relic.rewards.filter(r=>ids.has(r.id)).reduce((n,r)=>n+r.chance,0)),players);}
export function matchesRelic(r:Relic,q:string,localizedName?:(id:string)=>string):boolean {const hay=[r.name,...r.rewards.flatMap(x=>[x.name,localizedName?.(x.id)??''])].join(' ').toLowerCase();return searchText(q,hay);}
export function matchesRelicReward(reward:Pick<Reward,'name'>,q:string,localizedName=''):boolean {
 const words=q.trim().toLowerCase().split(/\s+/).filter(Boolean);
 const hay=(reward.name+' '+localizedName).toLowerCase();
 return words.length>0&&words.every(word=>hay.includes(word));
}

export function groupRelics(items:Relic[]):{base:string;variants:Relic[]}[]{
 const groups=new Map<string,Relic[]>();
 for(const item of items){const variants=groups.get(item.base)??[];variants.push(item);groups.set(item.base,variants);}
 const levels=['Intact','Exceptional','Flawless','Radiant'];
 return [...groups].map(([base,variants])=>({base,variants:variants.sort((a,b)=>levels.indexOf(a.refinement)-levels.indexOf(b.refinement))}));
}

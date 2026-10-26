import type {Relic} from './relicModel.ts';
import {relicOwned} from './relicAliases.ts';
import type {Inventory} from './relicModel.ts';
export function relicFamilyCount(variants:readonly Relic[],inventory:Pick<Inventory,'counts'|'complete'>|null){let total=0;for(const variant of variants){const n=relicOwned(inventory,variant);if(n===null)return null;total+=n;}return Number.isSafeInteger(total)?total:null;}
export function matchesRelicTenCopies(amount:number|null,filter:string){return !filter||amount!==null&&(filter==='yes'?amount>=10:amount<10);}
export function refinementTraceCost(level:string){return ({Intact:0,Exceptional:25,Flawless:50,Radiant:100} as Record<string,number>)[level]??null;}
/** Owned analysis enumerates only refinements actually owned, like the shipped DTO. */
export function plannerRefinementRows(variants:readonly Relic[],inventory:Pick<Inventory,'counts'|'complete'>|null,stock:string){return stock==='owned'?variants.filter(r=>(relicOwned(inventory,r)??0)>0):[...variants];}
export type PlannerOverlayFilters={era:string;refinement:string;vault:string;favorites:'all'|'yes'|'no'|'order';sort:string;descending:boolean;players:number;search:string;rewardFilter:string;parentFilter:string;tenCopies:string};
export const plannerOverlayKey='tennoledger.relic.overlay.filters.v1';
export const plannerOverlayEvent='tennoledger-relic-overlay-filters';
export function readPlannerOverlayFilters(value:unknown):PlannerOverlayFilters|null{
 if(!value||typeof value!=='object')return null;const v=value as Record<string,unknown>;
 if(!['','Lith','Meso','Neo','Axi','Requiem'].includes(String(v.era))||!['','Intact','Exceptional','Flawless','Radiant'].includes(String(v.refinement))||!['all','yes','no'].includes(String(v.vault))||!['all','yes','no','order'].includes(String(v.favorites))||!['plat','ducats','stock','name','missing','efficiency','platEfficiency'].includes(String(v.sort))||typeof v.descending!=='boolean'||!Number.isInteger(v.players)||Number(v.players)<1||Number(v.players)>4||typeof v.search!=='string'||v.search.length>500||!['all','yes','no'].includes(String(v.rewardFilter))||!['all','yes','no'].includes(String(v.parentFilter))||!['','yes','no'].includes(String(v.tenCopies)))return null;
 return v as unknown as PlannerOverlayFilters;
}

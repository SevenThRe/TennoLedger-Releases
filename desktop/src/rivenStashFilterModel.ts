import type {Auction,Riven,RivenCatalog} from './rivenModel.ts';
import {fromAuction} from './rivenModel.ts';
import {rivenGrade,type RivenGrade} from './rivenQuality.ts';
export type RivenStashFilters={grade?:RivenGrade;rolled?:'yes'|'no';listed?:'yes'|'no'};
function identity(r:Riven){return JSON.stringify([r.weaponSlug,r.name,r.rank,r.rerolls,r.masteryLevel,r.polarity,[...r.attributes].map(a=>[a.slug,a.positive,Math.round(a.value*1000)]).sort((a,b)=>String(a[0]).localeCompare(String(b[0])))]);}
export function stashListedState(r:Riven,auctions:readonly Auction[]|null,posted:Readonly<Record<string,string>>):boolean|null{
 if(posted[r.id])return true;
 if(auctions===null)return null;
 const key=identity(r);return auctions.some(a=>!a.closed&&a.item?.type==='riven'&&identity(fromAuction(a,{}))===key);
}
export function matchesRivenStashFilters(r:Riven,filters:RivenStashFilters,weapon:RivenCatalog['weapons'][number]|undefined,listed:boolean|null){
 if(filters.grade&&rivenGrade(r,weapon)!==filters.grade)return false;
 if(filters.rolled&&(r.rerolls>0)!==(filters.rolled==='yes'))return false;
 if(filters.listed&&(listed===null||listed!==(filters.listed==='yes')))return false;
 return true;
}

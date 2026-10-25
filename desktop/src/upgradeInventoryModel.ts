export type UpgradeRanks=Record<string,Record<string,number>|null>|null|undefined;
export type ArcaneProgressFilter='all'|'incomplete'|'ready'|'maxed'|'missing'|'unknown';
export type UpgradeInventoryItem={id:string;category:string;mod?:{fusionLimit?:number};arcane?:{maximumRank:number;category?:string}};
export const arcaneCopies=(rank:number)=>Number.isSafeInteger(rank)&&rank>=0&&rank<=20?(rank+1)*(rank+2)/2:null;
/** Missing whole map and explicit null entries are unknown; an absent ID in a known map is unowned. */
export function upgradeOwnership(data:UpgradeRanks,id:string,maximumRank?:number){
 const unknown={known:false,owned:null,highestRank:null,maxed:null,ranks:null} as const;
 if(data==null||data[id]===null)return unknown;
 const ranks:Record<string,number>={};let owned=0,highestRank=0,maxed=0;
 for(const [key,count] of Object.entries(data[id]??{})){
  const rank=Number(key);
  if(!/^(0|[1-9]\d*)$/.test(key)||arcaneCopies(rank)===null||maximumRank!==undefined&&(arcaneCopies(maximumRank)===null||rank>maximumRank)||!Number.isSafeInteger(count)||count<0)return unknown;
  if(!count)continue;
  owned+=count;if(!Number.isSafeInteger(owned))return unknown;
  ranks[key]=count;highestRank=Math.max(highestRank,rank);if(rank===maximumRank)maxed+=count;
 }
 return {known:true,owned,highestRank,maxed:maximumRank===undefined?null:maxed,ranks};
}
export function arcaneProgress(item:UpgradeInventoryItem,data:UpgradeRanks){
 const maximumRank=item.arcane?.maximumRank,ownership=upgradeOwnership(data,item.id,maximumRank);
 const required=maximumRank===undefined?null:arcaneCopies(maximumRank);
 let equivalent:number|null=null;
 if(ownership.known&&required!==null){equivalent=Object.entries(ownership.ranks!).reduce((n,[rank,count])=>n+arcaneCopies(Number(rank))!*count,0);if(!Number.isSafeInteger(equivalent))equivalent=null;}
 const known=equivalent!==null&&required!==null;
 return {...ownership,known,maximumRank:required===null?null:maximumRank!,required,equivalent,remaining:known?Math.max(0,required!-equivalent!):null,percent:known?Math.min(100,100*equivalent!/required!):null};
}
export type ArcaneProgress=ReturnType<typeof arcaneProgress>;
export function matchesArcaneProgress(row:ArcaneProgress,filter:ArcaneProgressFilter){
 if(filter==='all')return true;if(filter==='unknown')return !row.known;if(!row.known)return false;
 return filter==='incomplete'?row.remaining!>0:filter==='ready'?row.remaining===0&&!row.maxed:filter==='maxed'?row.maxed!>0:row.owned===0;
}
export function compareArcaneProgress(a:ArcaneProgress,b:ArcaneProgress,descending=false){
 // Original groups remain fixed when reversed: ready, collecting, not owned, maxed, unknown.
 const group=(r:ArcaneProgress)=>!r.known?4:r.maxed!>0?3:!r.remaining?0:r.owned!>0?1:2;
 const grouped=group(a)-group(b);if(grouped)return grouped;
 if(a.remaining===null||b.remaining===null)return 0;
 return descending?b.remaining-a.remaining:a.remaining-b.remaining;
}
export function upgradeInstances(item:UpgradeInventoryItem,data:UpgradeRanks,fallbackCount:number|null){
 const max=item.category==='mod'?item.mod?.fusionLimit:item.arcane?.maximumRank;
 const ownership=upgradeOwnership(data,item.id,max);
 if(!ownership.known)return [{rank:null,count:fallbackCount,known:false}];
 const rows=Object.entries(ownership.ranks!).map(([rank,count])=>({rank:Number(rank),count,known:true}));
 return rows.length?rows:[{rank:null,count:0,known:true}];
}

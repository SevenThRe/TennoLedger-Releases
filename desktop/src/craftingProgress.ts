import type {DemandSnapshot} from './resourceDemand.ts';

export type CraftingProgressItem={id:string;maxRank?:number;masteryReq?:number};
export type CollectionChoice='all'|'missing'|'owned';

export function craftingProgress(item:CraftingProgressItem,snapshot:DemandSnapshot|null){
 const valid=(n:unknown):n is number=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0;
 const count=snapshot?.counts[item.id];
 const owned=valid(count)?count:count===undefined&&snapshot?.complete?0:null;
 const maximum=item.maxRank??0,rank=snapshot?.ranks?.[item.id];
 const mastered=maximum<=0?false:valid(rank)?rank>=maximum:rank===undefined&&snapshot?.masteryAccount?.ranksComplete?false:null;
 const required=item.masteryReq??0,level=snapshot?.masteryRank;
 const masteryBlocked=required<=0?false:valid(level)?level<required:null;
 return {owned,mastered,masteryBlocked};
}

export function matchesCraftingCollection(choice:CollectionChoice,item:CraftingProgressItem,snapshot:DemandSnapshot|null){
 if(choice==='all')return true;
 const {owned,mastered}=craftingProgress(item,snapshot);
 return choice==='owned'?owned!==null&&owned>0:owned===0&&mastered===false;
}

import {modRankOwnership,modUpgradePlan} from './modUpgradePlan.ts';
export type PlannerMod={id:string;category:string;rarity:string;maximumRank:number;rarityMultiplier:number;upgradeSupported:boolean;hidden:boolean;description:string;descriptionZh?:string;levels:{rank:number;text:string;textZh?:string}[];sources:{location:string;chance:number|null;reward?:string|null;rotation?:string|null}[]};
export type ModGoal={id:string;targetRank:number;paused?:boolean};
export type ModPlannerSnapshot={upgradeCountsByRank?:Record<string,Record<string,number>|null>|null;looseUnrankedMods?:Record<string,number|null>|null;favorites?:string[];credits?:number|null;playerProfile?:{endo?:number|null}|null};
export function visiblePlannerMods<T extends {hidden:boolean;owned:number|null;favorite:boolean}>(items:readonly T[],includeHidden=false){
 return items.filter(m=>!m.hidden||(m.owned??0)>0||includeHidden||m.favorite);
}
export function buildModPlan(catalog:readonly PlannerMod[],snapshot:ModPlannerSnapshot|null,request:{useFavorites:boolean;goals:readonly ModGoal[];reservedEndo?:number;reservedCredits?:number},names:ReadonlyMap<string,string>=new Map()){
 if(!request.useFavorites&&request.goals.length>100)throw Error('MOD plan exceeds 100 goals');
 const inventoryKnown=snapshot?.upgradeCountsByRank!=null;
 const items=catalog.map(mod=>({...mod,...modRankOwnership(snapshot?.upgradeCountsByRank,mod.id,mod.maximumRank),favorite:!!snapshot?.favorites?.includes(mod.id)}));
 const byId=new Map(items.map(item=>[item.id,item]));
 const compare=(a:string,b:string)=>a<b?-1:a>b?1:0;
 const goals=request.useFavorites?items.filter(item=>item.favorite&&item.upgradeSupported).sort((a,b)=>compare((names.get(a.id)??a.id).toLowerCase(),(names.get(b.id)??b.id).toLowerCase())||compare(a.id,b.id)).map(item=>({id:item.id,targetRank:item.maximumRank})):request.goals;
 const targets=goals.map(goal=>{const item=byId.get(goal.id);return {id:goal.id,currentRank:item?.highestRank??0,targetRank:Number.isSafeInteger(goal.targetRank)?Math.max(0,Math.min(20,goal.targetRank)):NaN,maximumRank:item?.maximumRank??0,rarityMultiplier:item?.rarityMultiplier??0,owned:(item?.owned??0)>0,known:item?.known??false,paused:'paused' in goal?goal.paused:false};});
 const plan=modUpgradePlan(targets,{endo:snapshot?.playerProfile?.endo??null,credits:snapshot?.credits??null,reservedEndo:request.useFavorites?0:request.reservedEndo,reservedCredits:request.useFavorites?0:request.reservedCredits},inventoryKnown);
 return {inventoryKnown,items,plan};
}

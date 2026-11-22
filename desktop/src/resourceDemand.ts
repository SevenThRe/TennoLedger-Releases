import type {ResourceDrop} from './resourceSourceModel';
import {planResources,type ResourceRecipe} from './resourcePlan.ts';
import {pendingCrafts,type PendingOutput} from './pendingCrafts.ts';
export type DemandCatalog={descriptionsZh?:Record<string,string>;dropSources?:Record<string,ResourceDrop[]>;ids:string[];resourceIds?:string[];blueprintIds:string[];goalIds:string[];recipes:Record<string,ResourceRecipe>;pendingRecipeOutputs?:Record<string,PendingOutput>};
export type DemandSnapshot={complete:boolean;counts:Record<string,number>;masteryRank?:number|null;credits?:number|null;pendingRecipes?:Record<string,number>|null;favorites?:string[];ranks?:Record<string,number>;masteryAccount?:{ranksComplete?:boolean}|null};
export function resourceDemand(catalog:DemandCatalog,snapshot:DemandSnapshot|null,items:Map<string,{name:string;maxRank?:number}>,craftResources:ReadonlySet<string>=new Set()){
 const prepared=pendingCrafts(catalog.recipes,new Set(catalog.blueprintIds),snapshot?.pendingRecipes,snapshot?.counts??{},catalog.pendingRecipeOutputs);
 const stock:Record<string,number>={...prepared.stock,credits:snapshot?.credits??0};
 // Reference defaults to buying/farming resource ingredients, not recursively crafting them.
 const resources=new Set((catalog.resourceIds??catalog.ids).filter(id=>!craftResources.has(id)));
 const goals=[...catalog.goalIds].sort((a,b)=>(items.get(a)?.name??a).localeCompare(items.get(b)?.name??b)||a.localeCompare(b));
 const goalSet=new Set(goals);
 const parentsByPart=new Map<string,string[]>();
 for(const gid of goals){
  for(const part of catalog.recipes[gid]?.parts??[]){
   if(!part.reusable&&goalSet.has(part.itemId)&&part.itemId!==gid){
    const parents=parentsByPart.get(part.itemId)??[];parents.push(gid);parentsByPart.set(part.itemId,parents);
   }
  }
 }
 const isGoalSatisfied=(id:string)=>(stock[id]>0)||((items.get(id)?.maxRank??0)>0&&(snapshot?.ranks?.[id]??0)>=(items.get(id)?.maxRank??0));
 const baseKnown=!!snapshot?.complete&&prepared.known&&snapshot.credits!=null;
 const favorites=planResources(goals.filter(id=>snapshot?.favorites?.includes(id)).map(itemId=>({itemId,quantity:1})),catalog.recipes,stock,prepared.outputs,baseKnown&&Array.isArray(snapshot?.favorites),resources);
 const remaining=planResources(goals.filter(id=>{
  if(isGoalSatisfied(id))return false;
  if(!((items.get(id)?.maxRank??0)>0)){
   const parents=parentsByPart.get(id);
   if(parents?.length&&parents.every(isGoalSatisfied))return false;
  }
  return true;
 }).map(itemId=>({itemId,quantity:1})),catalog.recipes,stock,prepared.outputs,baseKnown&&snapshot?.masteryAccount?.ranksComplete===true,resources);
 return {favorites,remaining};
}

import type {ResourceDrop} from './resourceSourceModel';
import {planResources,type ResourceRecipe} from './resourcePlan.ts';
import {pendingCrafts,type PendingOutput} from './pendingCrafts.ts';
export type DemandCatalog={descriptionsZh?:Record<string,string>;dropSources?:Record<string,ResourceDrop[]>;ids:string[];resourceIds?:string[];blueprintIds:string[];goalIds:string[];recipes:Record<string,ResourceRecipe>;pendingRecipeOutputs?:Record<string,PendingOutput>};
export type DemandSnapshot={complete:boolean;missingOwnedGroups?:string[]|null;counts:Record<string,number>;masteryRank?:number|null;credits?:number|null;pendingRecipes?:Record<string,number>|null;favorites?:string[];ranks?:Record<string,number>;masteryAccount?:{ranksComplete?:boolean}|null};
export const OPTIONAL_PROGRESSION_OWNED_GROUPS:ReadonlySet<string>=new Set(['Sentinels','SentinelWeapons','SpaceSuits','SpaceGuns','SpaceMelee','KubrowPets','MoaPets','Hoverboards','MechSuits','SpecialItems','OperatorAmps','CrewShipHarnesses','LevelKeys','FlavourItems','WeaponSkins']);
export function isInventoryAvailable(snapshot:{complete?:boolean;missingOwnedGroups?:readonly string[]|null}|null|undefined):boolean{
 if(!snapshot)return false;
 if(snapshot.complete===true)return true;
 return Array.isArray(snapshot.missingOwnedGroups)&&snapshot.missingOwnedGroups.length>0&&snapshot.missingOwnedGroups.every(g=>OPTIONAL_PROGRESSION_OWNED_GROUPS.has(g));
}
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
 const baseKnown=isInventoryAvailable(snapshot)&&prepared.queueCaptured&&prepared.ambiguous.length===0&&snapshot?.credits!=null;
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

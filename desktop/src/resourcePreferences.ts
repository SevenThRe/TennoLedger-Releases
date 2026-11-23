import type {GoalResult} from './resourcePlan.ts';
export type ResourceInventoryFilter='all'|'owned'|'missing';
export type ResourceInventoryOrder='name'|'quantity'|'shortage'|'needed';
export type CraftingScope='favorites'|'remaining';
export type ResourcePreferences={view:'inventory'|'plan'|'mining'|'shards';ownedOnly:boolean;inventoryFilter:ResourceInventoryFilter;inventoryOrder:ResourceInventoryOrder;materialType:''|'resource'|'blueprint'|'component';materialOrder:'priority'|'name'|'shortage'|'owned';missingOnly:boolean;craftingScope:CraftingScope};
export const resourceDefaults:ResourcePreferences={view:'plan',ownedOnly:true,inventoryFilter:'owned',inventoryOrder:'name',materialType:'',materialOrder:'priority',missingOnly:true,craftingScope:'favorites'};
export function parseResourcePreferences(raw:string|null):ResourcePreferences{
 const value:unknown=raw===null?{}:JSON.parse(raw);
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid resource preferences');
 const result={...resourceDefaults},saved=value as Record<string,unknown>;
 const options:Record<keyof ResourcePreferences,unknown[]>={view:['inventory','plan','mining','shards'],ownedOnly:[true,false],inventoryFilter:['all','owned','missing'],inventoryOrder:['name','quantity','shortage','needed'],materialType:['','resource','blueprint','component'],materialOrder:['priority','name','shortage','owned'],missingOnly:[true,false],craftingScope:['favorites','remaining']};
 for(const key of Object.keys(result) as (keyof ResourcePreferences)[]){
  if(options[key].includes(saved[key]))Object.assign(result,{[key]:saved[key]});
 }
 if(!options.inventoryFilter.includes(saved.inventoryFilter)&&typeof saved.ownedOnly==='boolean'){
  result.inventoryFilter=saved.ownedOnly?'owned':'all';
 }
 return result;
}
export function craftingGoalStatus(goal:GoalResult){
 return goal.unknown?'unknown':goal.owned>=goal.quantity?'complete':goal.missing.length?'missing':goal.waiting?'waiting':'ready';
}
export function sortCraftingGoals(goals:readonly GoalResult[],name:(id:string)=>string){
 const order={complete:0,waiting:1,ready:2,missing:3,unknown:4};
 return [...goals].sort((a,b)=>order[craftingGoalStatus(a)]-order[craftingGoalStatus(b)]||name(a.itemId).localeCompare(name(b.itemId))||a.itemId.localeCompare(b.itemId));
}

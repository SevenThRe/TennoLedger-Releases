import type {GoalResult} from './resourcePlan.ts';
export type ResourcePreferences={view:'inventory'|'plan'|'shards';ownedOnly:boolean;inventoryOrder:'name'|'quantity';materialType:''|'resource'|'blueprint'|'component';materialOrder:'priority'|'name'|'shortage'|'owned';missingOnly:boolean};
export const resourceDefaults:ResourcePreferences={view:'plan',ownedOnly:true,inventoryOrder:'name',materialType:'',materialOrder:'priority',missingOnly:true};
export function parseResourcePreferences(raw:string|null):ResourcePreferences{
 const value:unknown=raw===null?{}:JSON.parse(raw);
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid resource preferences');
 const result={...resourceDefaults},saved=value as Record<string,unknown>;
 for(const key of Object.keys(result) as (keyof ResourcePreferences)[]){
  const options:Record<string,unknown[]>={view:['inventory','plan','shards'],ownedOnly:[true,false],inventoryOrder:['name','quantity'],materialType:['','resource','blueprint','component'],materialOrder:['priority','name','shortage','owned'],missingOnly:[true,false]};
  if(options[key].includes(saved[key]))Object.assign(result,{[key]:saved[key]});
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

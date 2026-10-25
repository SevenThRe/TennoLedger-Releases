import type {ResourceDrop} from './resourceSourceModel.ts';
import type {GoalResult,ResourceRequirement} from './resourcePlan.ts';

export type CraftingEmptyState='goals'|'inventory'|'owned'|'unavailable'|'filtered'|'rows';
export function craftingEmptyState(goals:readonly GoalResult[],inventoryKnown:boolean,requirements:Record<string,ResourceRequirement>,visible:number):CraftingEmptyState{
 if(!goals.length)return 'goals';
 if(!inventoryKnown)return 'inventory';
 if(visible)return 'rows';
 if(!Object.keys(requirements).length)return goals.every(g=>!g.unknown&&g.owned>=g.quantity)?'owned':'unavailable';
 return 'filtered';
}
export function materialLocationText(drops:readonly ResourceDrop[]|undefined,translate:(value:string)=>string){return [...new Set((drops??[]).flatMap(d=>[d.location,translate(d.location),d.reward??'',d.rotation??'']))].join(' ');}
export function craftingAction(row:ResourceRequirement,output:number){return row.crafts>0?{kind:'craft' as const,batches:row.crafts,quantity:row.crafts*Math.max(1,output)}:row.missing>0?{kind:'missing' as const,quantity:row.missing}:{kind:'covered' as const,quantity:0};}

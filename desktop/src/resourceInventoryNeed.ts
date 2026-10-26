import type {ResourceRequirement} from './resourcePlan.ts';
export function resourceInventoryNeed(plan:{inventoryKnown:boolean;incomplete:boolean;requirements:Record<string,ResourceRequirement>}|null|undefined,id:string){
 if(!plan?.inventoryKnown)return {kind:'unavailable' as const,quantity:null,covered:false};
 const row=plan.requirements[id];
 if(plan.incomplete)return row&&row.missing>0?{kind:'atLeast' as const,quantity:row.missing,covered:false}:{kind:'unverified' as const,quantity:null,covered:false};
 if(!row?.needed)return {kind:'none' as const,quantity:0,covered:false};
 return row.missing>0?{kind:'missing' as const,quantity:row.missing,covered:false}:{kind:'keep' as const,quantity:row.needed,covered:true};
}

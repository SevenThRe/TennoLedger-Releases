import type {ResourceRecipe} from './resourcePlan';
export type PendingOutput={itemId:string;output:number;reusable:boolean};
/** Resolve captured blueprint queue entries to outputs; ambiguous mappings stay unknown. */
export function pendingCrafts(recipes:Record<string,ResourceRecipe>,blueprintIds:Set<string>,queue:Record<string,number>|null|undefined,counts:Record<string,number>,metadata:Record<string,PendingOutput>={}){
 const stock={...counts},outputs:Record<string,number>={},unresolved:string[]=[];
 if(queue==null)return {stock,outputs,known:false,unresolved};
 for(const [id,n] of Object.entries(queue)){
  if(!Number.isSafeInteger(n)||n<1){unresolved.push(id);continue;}
  const matches=Object.entries(recipes).filter(([,r])=>r.parts.some(p=>p.itemId===id&&blueprintIds.has(id)));
  if(matches.length>1||(!matches.length&&!metadata[id])){unresolved.push(id);continue;}
  const resolved=matches.length?{itemId:matches[0][0],output:matches[0][1].output,reusable:!!matches[0][1].parts.find(p=>p.itemId===id)!.reusable}:metadata[id];
  const output=resolved.itemId,produced=resolved.output*n;
  if(!output||!Number.isSafeInteger(produced)||produced<1||!Number.isSafeInteger((outputs[output]??0)+produced)){unresolved.push(id);continue;}
  outputs[output]=(outputs[output]??0)+produced;
  if(!resolved.reusable)stock[id]=Math.max(0,(stock[id]??0)-n);
 }
 return {stock,outputs,known:unresolved.length===0,unresolved};
}

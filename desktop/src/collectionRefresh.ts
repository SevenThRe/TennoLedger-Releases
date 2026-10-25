/** A failed crafting query must not discard a successful account snapshot. */
export async function refreshCollectionState<S,R>(load:()=>Promise<S>,readiness:()=>Promise<R>,current:()=>boolean,applySnapshot:(value:S)=>void,applyReadiness:(value:R)=>void){
 const results=await Promise.allSettled([load(),readiness()]);
 if(!current())return null;
 const errors:string[]=[];
 if(results[0].status==='fulfilled')applySnapshot(results[0].value);else errors.push(String(results[0].reason));
 if(results[1].status==='fulfilled')applyReadiness(results[1].value);else errors.push(String(results[1].reason));
 return errors;
}

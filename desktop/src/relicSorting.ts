export function groupedValue(values:(number|null)[],descending:boolean):number|null{
 const known=values.filter((v):v is number=>v!==null&&Number.isFinite(v));
 return known.length?(descending?Math.max(...known):Math.min(...known)):null;
}
export function compareRelicValues(a:number|null,b:number|null,descending:boolean){
 // Unknown inventory/price is not zero and stays after known values in either direction.
 if(a===null)return b===null?0:1;
 if(b===null)return -1;
 return descending?b-a:a-b;
}

export function refinementGain<T extends {refinement:string}>(variants:readonly T[],value:(variant:T)=>number|null):number|null{
 const intact=variants.find(r=>r.refinement==='Intact'),radiant=variants.find(r=>r.refinement==='Radiant');
 if(!intact||!radiant)return null;
 const from=value(intact),to=value(radiant);
 return from===null||to===null||!Number.isFinite(from)||!Number.isFinite(to)?null:(to-from)/100;
}

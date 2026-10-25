export type SaleComponent={id:string;needed:number;output:number;kind:'other'|'blueprint';components:SaleComponent[]|null};
export type SaleRecipe={id:string;name?:string;components:SaleComponent[]|null};
export type CraftStock={id:string;owned:number};
export type CraftReservation={safeToSell:number|null;keepForCrafting:number;neededForItems:string[]};
const cap=2147483647;
const valid=(v:number)=>Number.isSafeInteger(v)&&v>=0&&v<=cap;
const clamp=(v:bigint)=>Number(v>BigInt(cap)?BigInt(cap):v);
const add=(a:number,b:number)=>clamp(BigInt(a)+BigInt(b));
const multiply=(a:number,b:number)=>clamp(BigInt(a)*BigInt(b));
/** Independent implementation of InventorySaleSafety.Apply; no inventory mutations. */
export function reserveCraftingStock<T extends CraftStock>(rows:readonly T[],recipes:readonly SaleRecipe[]|null,isCompleted:(recipe:SaleRecipe)=>boolean|null,countOwned:(id:string)=>number|null,pendingBlueprints:ReadonlySet<string>|null):(T&CraftReservation)[]{
 const output=rows.map(row=>({...row,safeToSell:null,keepForCrafting:0,neededForItems:[]} as T&CraftReservation));
 if(recipes===null||pendingBlueprints===null||rows.some(r=>!valid(r.owned)))return output;
 const confirmedPendingBlueprints=pendingBlueprints;
 const targets=new Map<string,(T&CraftReservation)[]>();for(const row of output){if(!row.id)continue;if(!targets.has(row.id))targets.set(row.id,[]);targets.get(row.id)!.push(row);}
 const stock=new Map([...targets].map(([id,items])=>[id,items.reduce((n,r)=>add(n,r.owned),0)]));
 const reserved=new Map([...targets.keys()].map(id=>[id,0])),parents=new Map([...targets.keys()].map(id=>[id,new Set<string>()]));
 const allParts=new Set<string>(),unknown=new Set<string>(),pendingOutputs=new Map<string,number>();
 type Plan={recipe:SaleRecipe;valid:boolean;parts:Set<string>;relevant:Set<SaleComponent>};
 const plans:Plan[]=[];
 const isPending=(components:SaleComponent[]|null)=>!!components?.some(c=>c&&c.kind!=='other'&&pendingBlueprints.has(c.id));
 function inspect(c:SaleComponent,plan:Plan,path:Set<SaleComponent>):boolean{
  if(!c||path.size>=64||path.has(c)){plan.valid=false;return false;}
  path.add(c);let relevant=targets.has(c.id);if(relevant)plan.parts.add(c.id);
  if(c.components===null)plan.valid=false;
  for(const child of c.components??[])relevant=inspect(child,plan,path)||relevant;
  path.delete(c);
  if(relevant){plan.relevant.add(c);if(!c.id||!valid(c.needed)||c.needed===0||!valid(c.output))plan.valid=false;
   if(c.id&&isPending(c.components)&&valid(c.output))pendingOutputs.set(c.id,Math.max(1,c.output));
  }return relevant;
 }
 for(const recipe of [...recipes].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0)){
  const plan:Plan={recipe,valid:!!recipe.id&&recipe.components!==null,parts:new Set(),relevant:new Set()};
  for(const c of recipe.components??[])inspect(c,plan,new Set());
  plan.parts.forEach(id=>allParts.add(id));if(!plan.parts.size)continue;
  let completed:boolean|null=null;try{completed=isCompleted(recipe);}catch{}
  if(!plan.valid||typeof completed!=='boolean')plan.parts.forEach(id=>unknown.add(id));
  else if(!completed&&!isPending(recipe.components))plans.push(plan);
 }
 function available(id:string){if(!stock.has(id)){let n=countOwned(id);if(n===null||!valid(n))throw Error('Unknown crafting stock');if(confirmedPendingBlueprints.has(id))n=Math.max(0,n-1);stock.set(id,add(n,pendingOutputs.get(id)??0));}return stock.get(id)!;}
 function reserve(c:SaleComponent,crafts:number,plan:Plan){
  if(!plan.relevant.has(c))return;
  const needed=multiply(c.needed,crafts),used=Math.min(needed,available(c.id));stock.set(c.id,stock.get(c.id)!-used);
  if(reserved.has(c.id)){reserved.set(c.id,add(reserved.get(c.id)!,used));if(used>0)parents.get(c.id)!.add(plan.recipe.name??plan.recipe.id);}
  const missing=needed-used;if(!missing)return;
  const batch=Math.max(1,c.output),runs=Math.ceil(missing/batch);
  for(const child of c.components??[])reserve(child,runs,plan);
  if(c.components?.length)stock.set(c.id,clamp(BigInt(stock.get(c.id)!)+BigInt(runs)*BigInt(batch)-BigInt(missing)));
 }
 try{for(const plan of plans)for(const c of plan.recipe.components!)reserve(c,1,plan);}catch{return output;}
 for(const [id,items] of targets){if(!allParts.has(id)||unknown.has(id))continue;let keep=reserved.get(id)!;
  for(const row of items){row.keepForCrafting=Math.min(row.owned,keep);keep-=row.keepForCrafting;row.safeToSell=row.owned-row.keepForCrafting;row.neededForItems=[...parents.get(id)!].sort();}
 }return output;
}

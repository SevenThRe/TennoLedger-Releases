/** Independent demand allocator; see docs/ALECAFRAME-3.0.4-UPGRADE.md.
 * Pending and planned batch output are distinct from currently owned stock.
 */
export type ResourceRecipe={output:number;credits?:number;parts:{itemId:string;quantity:number;reusable?:boolean}[]};
export type ResourceGoal={itemId:string;quantity:number;paused?:boolean};
export type ResourceRequirement={needed:number;owned:number;allocated:number;pending:number;fromBatches:number;missing:number;crafts:number;usedBy:string[];reusable?:boolean};
export type GoalResult=ResourceGoal&{owned:number;pending:number;toCraft:number;missing:string[];unknown:boolean;waiting:boolean};
type Dependency={materials:Set<string>;missing:Set<string>;unknown:boolean;waiting:boolean};
export function planResources(goals:ResourceGoal[],recipes:Record<string,ResourceRecipe>,counts:Record<string,number>,pending:Record<string,number>={},inventoryKnown=true,unexpandedResources:ReadonlySet<string>=new Set()){
 const stock={...counts},queue={...pending},surplus:Record<string,number>={},dependencies:Record<string,Dependency>={},reusable:Record<string,number>={};
 const requirements:Record<string,ResourceRequirement>={};
 const valid=(n:number)=>Number.isSafeInteger(n)&&n>=0;
 const checked=(n:number)=>{if(!valid(n))throw Error('Resource quantity exceeds safe integer range');return n;};
 const amount=(pool:Record<string,number>,id:string)=>{const n=pool[id]??0;if(!valid(n))throw Error('Invalid inventory quantity');return n;};
 const take=(pool:Record<string,number>,id:string,n:number)=>{const v=Math.min(amount(pool,id),n);pool[id]=amount(pool,id)-v;return v;};
 const merge=(a:Dependency,b:Dependency)=>{for(const id of b.materials)a.materials.add(id);for(const id of b.missing)a.missing.add(id);a.unknown ||= b.unknown;a.waiting ||= b.waiting;};
 const rows:GoalResult[]=goals.map(g=>({...g,owned:0,pending:0,toCraft:0,missing:[],unknown:!inventoryKnown,waiting:false}));
 // Reserve all finished targets first: a later target must not be consumed by an earlier recipe.
 for(const g of rows){
  if(!g.itemId||!valid(g.quantity)||g.quantity<1){g.unknown=true;continue;}
  if(g.paused||!inventoryKnown)continue;
  try{g.owned=take(stock,g.itemId,g.quantity);g.pending=take(queue,g.itemId,g.quantity-g.owned);g.toCraft=g.quantity-g.owned-g.pending;g.waiting=g.pending>0;}catch{g.unknown=true;}
 }
 function share(state:Dependency,dependency:Dependency,owner:string){
  merge(state,dependency);
  for(const id of dependency.materials){const row=requirements[id];if(row&&!row.usedBy.includes(owner))row.usedBy.push(owner);}
 }
 function consume(id:string,n:number,isReusable:boolean,owner:string,state:Dependency,path:Set<string>){
  if(!id||!valid(n)||path.size>48){state.unknown=true;return;}
  const row=requirements[id]??={needed:0,owned:amount(counts,id),allocated:0,pending:0,fromBatches:0,missing:0,crafts:0,usedBy:[]};
  if(!row.usedBy.includes(owner))row.usedBy.push(owner);
  state.materials.add(id);
  if(isReusable)row.reusable=true;
  let demand=n;
  if(isReusable){demand=Math.max(0,n-(reusable[id]??0));reusable[id]=Math.max(n,reusable[id]??0);}
  row.needed=checked(row.needed+demand);
  const owned=take(stock,id,demand),waiting=take(queue,id,demand-owned),batch=take(surplus,id,demand-owned-waiting);
  row.allocated=checked(row.allocated+owned);row.pending=checked(row.pending+waiting);row.fromBatches=checked(row.fromBatches+batch);
  state.waiting ||= waiting>0;
  if(batch&&dependencies[id])share(state,dependencies[id],owner);
  const deficit=demand-owned-waiting-batch;
  if(deficit){
   if(recipes[id]&&!isReusable&&!unexpandedResources.has(id)){
    if(path.has(id)){state.unknown=true;return;}
    row.crafts=checked(row.crafts+Math.ceil(deficit/Math.max(1,recipes[id].output)));
    craft(id,deficit,owner,state,new Set([...path,id]));
   }else{row.missing=checked(row.missing+deficit);state.missing.add(id);}
  }
  if(isReusable&&row.missing)state.missing.add(id);
 }
 function craft(id:string,n:number,owner:string,state:Dependency,path:Set<string>){
  const recipe=recipes[id];
  if(!recipe||!valid(recipe.output)||recipe.output<1||!recipe.parts?.length||path.size>48){state.unknown=true;return;}
  const runs=Math.ceil(n/recipe.output),batchState:Dependency={materials:new Set(),missing:new Set(),unknown:false,waiting:false};
  if(recipe.credits!==undefined)consume('credits',checked(recipe.credits*runs),false,owner,batchState,path);
  for(const part of recipe.parts){
   if(!part||!part.itemId||!valid(part.quantity)||part.quantity<1){batchState.unknown=true;continue;}
   consume(part.itemId,checked(part.quantity*(part.reusable?1:runs)),!!part.reusable,owner,batchState,path);
  }
  merge(state,batchState);
  surplus[id]=checked((surplus[id]??0)+checked(runs*recipe.output)-n);
  dependencies[id]=batchState;
 }
 for(const g of rows){
  if(g.paused||g.unknown||!g.toCraft)continue;
  const state:Dependency={materials:new Set(),missing:new Set(),unknown:false,waiting:g.waiting};
  try{
   const batch=take(surplus,g.itemId,g.toCraft);g.toCraft-=batch;
   if(batch&&dependencies[g.itemId])share(state,dependencies[g.itemId],g.itemId);
   if(g.toCraft)craft(g.itemId,g.toCraft,g.itemId,state,new Set([g.itemId]));
  }catch{state.unknown=true;}
  g.missing=[...state.missing];g.unknown=state.unknown;g.waiting=state.waiting;
 }
 return {goals:rows,requirements,incomplete:rows.some(g=>!g.paused&&g.unknown),inventoryKnown};
}

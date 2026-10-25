import {reserveCraftingStock,type CraftStock,type SaleRecipe} from './saleCrafting.ts';
import {craftingProgress} from './craftingProgress.ts';
import type {DemandSnapshot} from './resourceDemand.ts';

type SaleItem={id:string;maxRank?:number};
/** Reference InventoryHelpers completion rules, with explicit unknown capture states. */
export function saleGoalCompleted(id:string,items:ReadonlyMap<string,SaleItem>,snapshot:DemandSnapshot|null,onlyFavorites:boolean):boolean|null{
 if(onlyFavorites){
  if(!Array.isArray(snapshot?.favorites))return null;
  if(!snapshot.favorites.includes(id))return true;
 }
 const item=items.get(id);if(!item)return null;
 const state=craftingProgress(item,snapshot);
 if(state.owned!==null&&state.owned>0)return true;
 if(!onlyFavorites&&state.mastered===true)return true;
 if(state.owned===null||(!onlyFavorites&&state.mastered===null))return null;
 return false;
}

export function saleSnapshot<T extends CraftStock>(rows:readonly T[],recipes:readonly SaleRecipe[]|null,items:ReadonlyMap<string,SaleItem>,snapshot:DemandSnapshot|null,onlyFavorites=false){
 const queue=snapshot?.pendingRecipes;
 const queueKnown=queue!=null&&Object.entries(queue).every(([id,n])=>!!id&&Number.isSafeInteger(n)&&n>0);
 const pending=queueKnown?new Set(Object.keys(queue!)):null;
 // The reference removes one blueprint per pending ID before computing availability.
 // Allocate that removal once across duplicate rows, without changing the snapshot.
 const removed=new Set<string>();
 const available=rows.map(row=>{
  const take=!!pending?.has(row.id)&&!removed.has(row.id)&&row.owned>0;
  if(take)removed.add(row.id);
  return {...row,owned:row.owned-(take?1:0)};
 });
 const count=(id:string)=>{
  const n=snapshot?.counts[id];
  return n===undefined?(snapshot?.complete?0:null):Number.isSafeInteger(n)&&n>=0?n:null;
 };
 return reserveCraftingStock(available,snapshot?.complete?recipes:null,r=>saleGoalCompleted(r.id,items,snapshot,onlyFavorites),count,pending);
}

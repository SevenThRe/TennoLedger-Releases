export type InventoryOrder='name'|'platPrice'|'ducats'|'amount'|'ducanator'|'complete';
export type InventoryViewPreferences={view:'cards'|'compact';order:InventoryOrder;descending:boolean};
export const inventoryViewKey='tennoledger.inventory.view.v1';
export const defaultInventoryView:InventoryViewPreferences={view:'cards',order:'amount',descending:true};
export function readInventoryView(raw:string|null):InventoryViewPreferences{
 try{const value=JSON.parse(raw??'null');return {view:value?.view==='compact'?'compact':'cards',order:['name','platPrice','ducats','amount','ducanator','complete'].includes(value?.order)?value.order:'amount',descending:typeof value?.descending==='boolean'?value.descending:true};}catch{return {...defaultInventoryView};}
}
export type InventorySortRow={id:string;name:string;amount:number|null;price:number|null;ducats:number|null;completion:number|null};
const valid=(n:number|null)=>n!==null&&Number.isFinite(n)&&n>=0;
/** Reference InventoryHelpers uses the share of component kinds whose required quantity is met. */
export function inventoryCompletion(parts:readonly {itemId:string;quantity:number}[]|undefined,count:(id:string)=>number|null):number|null{
 if(!parts?.length)return null;
 const quantities=new Map<string,number>();
 for(const part of parts){if(!Number.isSafeInteger(part.quantity)||part.quantity<=0)return null;const total=(quantities.get(part.itemId)??0)+part.quantity;if(!part.itemId||!Number.isSafeInteger(total))return null;quantities.set(part.itemId,total);}
 let satisfied=0;
 for(const [id,needed] of quantities){const n=count(id);if(!valid(n))return null;if(n!>=needed)satisfied++;}
 return satisfied/quantities.size;
}
export function inventoryScore(row:InventorySortRow,order:InventoryOrder):number|null{
 if(order==='ducanator')return valid(row.ducats)&&valid(row.price)?Math.fround(row.ducats!)/Math.max(row.price!,0.0001):null;
 const n=order==='amount'?row.amount:order==='platPrice'?row.price:order==='ducats'?row.ducats:row.completion;
 return valid(n)?n:null;
}
export function compareInventory(a:InventorySortRow,b:InventorySortRow,preferences:InventoryViewPreferences):number{
 const names=()=>a.name.localeCompare(b.name,undefined,{numeric:true})||a.id.localeCompare(b.id);
 if(preferences.order==='name')return (preferences.descending?1:-1)*(a.name.localeCompare(b.name,undefined,{numeric:true}))||a.id.localeCompare(b.id);
 const av=inventoryScore(a,preferences.order),bv=inventoryScore(b,preferences.order);
 // Unknown data stays last regardless of direction; reversing never invents zero values.
 if(av===null||bv===null)return av===bv?names():av===null?1:-1;
 return (preferences.descending?bv-av:av-bv)||names();
}

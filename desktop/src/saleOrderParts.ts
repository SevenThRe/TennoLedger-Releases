import type {SaleOrder} from './saleListings.ts';

export type SaleMarketItem={id:string;gameRef?:string;slug?:string;tags?:string[]};
export type SaleMarketOrder=SaleOrder&{itemId?:string;item?:SaleMarketItem};
export type SalePartIdentity={id:string;slug?:string};
export type SaleSet={id:string;slug:string;parts:readonly {itemId:string;quantity:number;slug?:string}[]|null};
const comparable=(slug:string)=>slug.replace(/_blueprint/g,'');

/** InventoryHelpers.ResolveListedParts: match identities, never choose an ambiguous name. */
export function saleOrderParts(parts:readonly SalePartIdentity[],market:readonly SaleMarketItem[]|null,sets:readonly SaleSet[]|null){
 const byMarketId=new Map<string,SaleMarketItem[]>();
 for(const item of market??[]){const bucket=byMarketId.get(item.id)??[];bucket.push(item);byMarketId.set(item.id,bucket);}
 function match(ids:readonly string[],slug?:string):string[] {
  let result=[...new Set(parts.filter(p=>ids.includes(p.id)).map(p=>p.id))];
  if(!result.length&&slug)result=[...new Set(parts.filter(p=>p.slug&&comparable(p.slug)===comparable(slug)).map(p=>p.id))];
  return result;
 }
 return (order:SaleMarketOrder):ReadonlyMap<string,number>|null=>{
  const candidates=order.itemId?byMarketId.get(order.itemId):undefined;
  if(candidates&&candidates.length!==1)return null;
  const item=candidates?.[0]??order.item;
  if(!item||(!item.gameRef&&!item.slug))return null;
  if(order.itemId&&item.id!==order.itemId)return null;
  const result=new Map<string,number>();
  if(!item.tags?.includes('set')&&!item.slug?.endsWith('_set')){
   const ids=match(item.gameRef?[item.gameRef]:[],item.slug);
   if(ids.length>1)return null;
   // A resolved non-component order (MOD, relic...) consumes no tracked parts.
   if(ids.length===1)result.set(ids[0],1);
   return result;
  }
  if(sets===null)return null;
  const matches=sets.filter(s=>!!item.slug&&s.slug===item.slug);
  const options=matches.length?matches:sets.filter(s=>!!item.gameRef&&s.id===item.gameRef);
  if(options.length!==1||options[0].parts===null||!options[0].parts.length)return null;
  for(const part of options[0].parts){
   if(!part.itemId||!Number.isSafeInteger(part.quantity)||part.quantity<=0||part.quantity>2147483647)return null;
   const ids=match([part.itemId,part.itemId.replace(/Component/g,'Blueprint')],part.slug);
   if(ids.length>1)return null;
   if(ids.length===1)result.set(ids[0],Math.min(2147483647,(result.get(ids[0])??0)+part.quantity));
  }
  return result;
 };
}

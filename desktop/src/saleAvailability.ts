import {saleSnapshot} from './saleSnapshot.ts';
import {applyListingReservations} from './saleListings.ts';
import {saleOrderParts,type SaleMarketItem,type SaleMarketOrder,type SaleSet} from './saleOrderParts.ts';
import type {SaleRecipe,CraftStock} from './saleCrafting.ts';
import type {DemandSnapshot} from './resourceDemand.ts';
type Item={id:string;name:string;maxRank?:number};
type Sources={marketSlugs:Record<string,string>;items:Record<string,{parts:{itemId:string;quantity:number}[]}>};
const slug=(name:string)=>name.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');

/** Compose captured stock, crafting requirements and account orders; performs no writes. */
export function saleAvailability<T extends CraftStock>(rows:readonly T[],catalog:readonly Item[],recipes:readonly SaleRecipe[]|null,sources:Sources|null,snapshot:DemandSnapshot|null,market:readonly SaleMarketItem[]|null,orders:readonly SaleMarketOrder[]|null,onlyFavorites=false){
 const items=new Map(catalog.map(i=>[i.id,i]));
 const identities=rows.map(r=>({id:r.id,slug:sources?.marketSlugs[r.id]??(items.has(r.id)?slug(items.get(r.id)!.name):undefined)}));
 const sets:SaleSet[]|null=sources?Object.entries(sources.items).map(([id,row])=>({id,slug:slug(items.get(id)?.name??'')+'_set',parts:row.parts.map(p=>({...p,slug:sources.marketSlugs[p.itemId]??(items.has(p.itemId)?slug(items.get(p.itemId)!.name):undefined)}))})):null;
 const reserved=saleSnapshot(rows,recipes,items,snapshot,onlyFavorites);
 return applyListingReservations(reserved,orders,saleOrderParts(identities,market,sets));
}

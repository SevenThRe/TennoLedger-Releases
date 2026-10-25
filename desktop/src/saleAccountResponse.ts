import type {SaleMarketItem,SaleMarketOrder} from './saleOrderParts.ts';
/** Reject malformed transport data before it can be mistaken for zero sell orders. */
export function saleAccountResponse(catalog:unknown,response:unknown):{market:SaleMarketItem[];orders:SaleMarketOrder[]}{
 const data=response as {sell?:unknown;buy?:unknown}|null;
 const rows=Array.isArray(response)?response:Array.isArray(data?.sell)&&Array.isArray(data?.buy)?[...data.sell,...data.buy]:null;
 if(!Array.isArray(catalog)||catalog.some(i=>!i||typeof i.id!=='string'||!i.id)||rows===null)throw Error('Invalid market response');
 if(rows.some(r=>!r||typeof r.id!=='string'||!r.id||!['sell','buy'].includes(r.type)||!Number.isSafeInteger(r.quantity)||r.quantity<0))throw Error('Invalid account order');
 return {market:catalog,orders:rows};
}

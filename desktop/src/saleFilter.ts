import type {ListingReservation} from './saleListings.ts';
export function matchesSaleFilter(id:string,active:boolean,rows:ReadonlyMap<string,Pick<ListingReservation,'safeToList'>>):boolean{
 if(!active)return true;
 const n=rows.get(id)?.safeToList;
 return typeof n==='number'&&Number.isSafeInteger(n)&&n>0;
}

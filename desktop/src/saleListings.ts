/** 3.0.4 InventorySaleSafety.ApplyListings. This never publishes or changes orders. */
export type SaleStockRow={id:string;owned:number;safeToSell:number|null};
export type SaleOrder={id:string;type:string;quantity:number;visible?:boolean};
export type ListingReservation={listedForSale:number|null;safeToList:number|null;ordersPlaced:boolean|null};
const cap=2147483647;
const validCount=(n:number)=>Number.isSafeInteger(n)&&n>=0&&n<=cap;
export function applyListingReservations<T extends SaleStockRow,O extends SaleOrder>(
 stock:readonly T[],orders:readonly O[]|null,resolveParts:(order:O)=>ReadonlyMap<string,number>|null,
):(T&ListingReservation)[]{
 const output=stock.map(row=>({...row,listedForSale:null,safeToList:null,ordersPlaced:null} as T&ListingReservation));
 if(orders===null)return output;
 const totals=new Map<string,number>(),seen=new Set<string>();
 try{
  for(const order of orders){
   if(!order||order.type!=='sell'||order.quantity<=0)continue;
   if(!order.id||!validCount(order.quantity))return output;
   if(seen.has(order.id))continue;
   seen.add(order.id);
   const parts=resolveParts(order);if(parts===null)return output;
   for(const [id,count] of parts){
    if(!id||!validCount(count)||count===0)return output;
    const sum=BigInt(totals.get(id)??0)+BigInt(count)*BigInt(order.quantity);
    totals.set(id,Number(sum>BigInt(cap)?BigInt(cap):sum));
   }
  }
 }catch{return output;}
 const groups=new Map<string,(T&ListingReservation)[]>();
 for(const row of output){if(!row.id)continue;if(!groups.has(row.id))groups.set(row.id,[]);groups.get(row.id)!.push(row);}
 for(const [id,rows] of groups){
  // A malformed local row cannot support an allocation for this item.
  if(rows.some(row=>!validCount(row.owned)||(row.safeToSell!==null&&(!validCount(row.safeToSell)||row.safeToSell>row.owned))))continue;
  rows.sort((a,b)=>(b.safeToSell??0)-(a.safeToSell??0));
  let remaining=totals.get(id)??0;
  rows.forEach((row,index)=>{
   const assigned=index===rows.length-1?remaining:Math.min(remaining,row.safeToSell??row.owned);
   remaining-=assigned;
   row.listedForSale=assigned;row.ordersPlaced=assigned>0;
   row.safeToList=row.safeToSell===null?null:Math.max(0,row.safeToSell-assigned);
  });
 }
 return output;
}

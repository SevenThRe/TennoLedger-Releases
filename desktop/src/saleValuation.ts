export function saleValuation(rows:readonly {quantity:number|null;price:number|null|undefined}[],allowZero=false){
 let total=0n,unknown=0;
 for(const row of rows){
  if(row.quantity===0)continue;
  if(row.quantity===null||!Number.isSafeInteger(row.quantity)||row.quantity<0||row.price==null||!Number.isSafeInteger(row.price)||row.price<0||(!allowZero&&row.price===0)){unknown++;continue;}
  total+=BigInt(row.quantity)*BigInt(row.price);
 }
 return {total:unknown||total>BigInt(Number.MAX_SAFE_INTEGER)?null:Number(total),unknown};
}

// Partial estimates are explicit; strict totals used by sale planning stay unchanged.
export function inventoryEstimate(rows:readonly {quantity:number|null;price:number|null|undefined}[]){
 const strict=saleValuation(rows);
 const known=rows.filter(row=>row.quantity!==null&&Number.isSafeInteger(row.quantity)&&row.quantity>=0&&row.price!=null&&Number.isSafeInteger(row.price)&&row.price>0);
 return {total:strict.unknown?(known.some(row=>row.quantity!>0)?saleValuation(known).total:null):strict.total,unknown:strict.unknown};
}

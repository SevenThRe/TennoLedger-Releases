import type {Trade} from './api';

// Highlights describe a single attributed transaction, not the accumulated
// lifetime value of an item. Unallocated exchanges remain outside this input.
export function analyticsHighlights(trades:readonly Trade[]){
 const largest=(side:Trade['side'])=>trades.filter(t=>t.side===side&&Number.isFinite(t.platinum)&&t.platinum>=0)
  .reduce<Trade|null>((best,t)=>!best||t.platinum>best.platinum?t:best,null);
 return {sale:largest('sale'),purchase:largest('purchase')};
}
export function comparisonWidth(value:number,total:number):number{
 return Number.isFinite(value)&&Number.isFinite(total)&&value>0&&total>0?Math.min(100,value/total*100):0;
}
export function categorySummary(rows:readonly {type:string;value:number}[]){
 const valid=rows.filter(row=>Number.isFinite(row.value)&&row.value>=0);
 const total=valid.reduce((sum,row)=>sum+row.value,0);
 return {total,rows:valid.map(row=>({...row,percent:comparisonWidth(row.value,total)})).sort((a,b)=>b.value-a.value||a.type.localeCompare(b.type))};
}

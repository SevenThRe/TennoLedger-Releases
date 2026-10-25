import type {Trade} from './api';
export type TradeRanking={id:string;name:string;volume:number;totalValue:number;unitPrice:number};
export function tradeRankings(trades:readonly Trade[],side:Trade['side'],order:'value'|'volume'|'unitPrice'){
 const rows=new Map<string,TradeRanking>();
 const prices=new Map<string,{sum:number;count:number}>();
 for(const trade of trades){
  if(trade.side!==side)continue;
  const row=rows.get(trade.itemId)??{id:trade.itemId,name:trade.name,volume:0,totalValue:0,unitPrice:0};
  const price=prices.get(trade.itemId)??{sum:0,count:0};
  price.sum+=trade.platinum/trade.quantity;price.count++;prices.set(trade.itemId,price);
  // Reference averages each transaction's unit price, then truncates to an integer.
  row.unitPrice=Math.trunc(price.sum/price.count);
  row.volume+=trade.quantity;row.totalValue+=trade.platinum;rows.set(trade.itemId,row);
 }
 return [...rows.values()].sort((a,b)=>order==='volume'?b.volume-a.volume:order==='unitPrice'?b.unitPrice-a.unitPrice:b.totalValue-a.totalValue).slice(0,35);
}

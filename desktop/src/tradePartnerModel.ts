import type {Trade} from './api';
export type PartnerOrder='saleCount'|'saleValue'|'purchaseCount'|'purchaseValue'|'totalCount'|'totalValue';
export type TradePartner={name:string}&Record<PartnerOrder,number>;
// Use the same attributed sale/purchase records as the item rankings.
export function tradePartners(trades:readonly Trade[],order:PartnerOrder){
 const partners=new Map<string,TradePartner>();
 for(const trade of trades){
  const name=trade.partner?.trim();if(!name)continue;
  const row=partners.get(name)??{name,saleCount:0,saleValue:0,purchaseCount:0,purchaseValue:0,totalCount:0,totalValue:0};
  if(trade.side==='sale'){row.saleCount++;row.saleValue+=trade.platinum;}
  else{row.purchaseCount++;row.purchaseValue+=trade.platinum;}
  row.totalCount++;row.totalValue+=trade.platinum;partners.set(name,row);
 }
 return [...partners.values()].sort((a,b)=>b[order]-a[order]).slice(0,50);
}

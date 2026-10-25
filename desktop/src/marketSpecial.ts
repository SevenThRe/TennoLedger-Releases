type Item={maxRank?:number;subtypes?:string[];maxCharges?:number;maxAmberStars?:number;maxCyanStars?:number;bulkTradable?:boolean};
export type MarketExtras={subtype?:string;charges?:number;amberStars?:number;cyanStars?:number;perTrade?:number};
export const specialNumbers=[['charges','剩余次数','maxCharges'],['amberStars','琥珀星数','maxAmberStars'],['cyanStars','青蓝星数','maxCyanStars']] as const;
export function defaultMarketExtras(item:Item):MarketExtras{
 const result:MarketExtras={};
 if(item.subtypes?.length)result.subtype=item.subtypes[0];
 for(const [field,,limit] of specialNumbers)if(item[limit]!=null)result[field]=0;
 if(item.bulkTradable)result.perTrade=1;
 return result;
}
export function marketExtras(item:Item,input:MarketExtras,quantity:number):MarketExtras{
 const result=defaultMarketExtras(item);
 if(item.subtypes?.length){if(!input.subtype||!item.subtypes.includes(input.subtype))throw Error('请选择有效物品类型');result.subtype=input.subtype;}
 for(const [field,label,limit] of specialNumbers){
  if(item[limit]==null)continue;
  const value=input[field];
  if(!Number.isInteger(value)||value!<0||value!>item[limit]!)throw Error(label+'超出允许范围');
  result[field]=value;
 }
 if(item.bulkTradable){const count=input.perTrade;if(!Number.isInteger(count)||count!<1||count!>6||count!>quantity)throw Error('每组数量须为 1–6，且不能超过订单数量');result.perTrade=count;}
 return result;
}
export function marketSubtypeLabel(value:string){return ({intact:'完整',exceptional:'优良',flawless:'无暇',radiant:'光辉',unrevealed:'未揭示',revealed:'已揭示'} as Record<string,string>)[value]??value;}
export function marketTradeDefaults(item:Item,order?:MarketExtras&{rank?:number;platinum?:number}){
 const extras=defaultMarketExtras(item);
 if(order)for(const key of Object.keys(extras) as (keyof MarketExtras)[])if(order[key]!=null)Object.assign(extras,{[key]:order[key]});
 const quantity=extras.perTrade??1,rank=item.maxRank!=null?order?.rank??0:0,price=order?.platinum??('' as const);
 if(!Number.isInteger(rank)||rank<0||rank>(item.maxRank??0))throw Error('订单等级与物品目录不匹配');
 if(price!==''&&(!Number.isInteger(price)||price<1||price>900000))throw Error('订单价格无效');
 return {extras:marketExtras(item,extras,quantity),rank,price,quantity};
}

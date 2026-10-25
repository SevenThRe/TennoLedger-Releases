import {marketExtras,type MarketExtras} from './marketSpecial.ts';
export type QuoteMarketItem={id:string;slug:string;maxRank?:number;subtypes?:string[];maxCharges?:number;maxAmberStars?:number;maxCyanStars?:number;bulkTradable?:boolean};
export function quoteOrderPayload(item:QuoteMarketItem,type:'sell'|'buy',quantity:number,platinum:number,rank:number,extra:MarketExtras){
 if(!item.id||!item.slug||!['sell','buy'].includes(type))throw Error('物品或订单方向无效 / Invalid item or order side');
 if(!Number.isInteger(quantity)||quantity<1||quantity>9998)throw Error('数量须为 1–9998 / Quantity must be 1–9998');
 if(!Number.isInteger(platinum)||platinum<1||platinum>800000)throw Error('价格须为 1–800000 白金 / Price must be 1–800000');
 if(item.maxRank!=null&&(!Number.isInteger(rank)||rank<0||rank>item.maxRank))throw Error('物品等级超出范围 / Invalid item rank');
 return {...marketExtras(item,extra,quantity),itemId:item.id,type,quantity,platinum,visible:true,...(item.maxRank!=null?{rank}:{})};
}

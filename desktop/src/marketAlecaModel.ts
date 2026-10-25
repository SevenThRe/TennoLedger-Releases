import type {BulkOrder} from './marketBulkModel.ts';
export type AlecaPublicPrice={slug:string;minR0:number|null;minRMax:number|null;insta:number|null;post?:number|null;postMax?:number|null;volume?:number|null;fetchedAt:string};
export const alecaCacheableSlug=(slug:string)=>!slug.toLowerCase().includes('orokin')&&!slug.toLowerCase().includes('forma')&&!slug.includes('’');
/** Exact GetCachedPrice contract; unidentified ranked instances remain unknown. */
export function alecaBulkPrice(order:BulkOrder,price:AlecaPublicPrice|null|undefined,maxRank:number|null|undefined):number|null{
 if(!price||!alecaCacheableSlug(price.slug)||order.charges!=null||order.cyanStars!=null||order.amberStars!=null||!!order.subtype||Math.max(1,order.perTrade??1)!==1)return null;
 if(maxRank!=null&&(!Number.isSafeInteger(maxRank)||maxRank<0||order.rank==null))return null;
 const rank=order.rank??0;let value:number|null=null;
 if(order.type==='sell')value=rank===0?price.minR0:maxRank!=null&&rank===maxRank?price.minRMax:null;
 else if(order.type==='buy'&&rank===0)value=price.insta;
 return value!=null&&Number.isSafeInteger(value)&&value>0&&value<=800000?value:null;
}

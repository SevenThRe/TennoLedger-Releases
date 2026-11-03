import type {PriceSnapshot} from './marketPriceStore.ts';
import type {Quote} from './quoteCache.ts';

// The reward screen has seconds to live. Never put the account/order queue on
// its critical path. Snapshot prices are reference prices, not live listings.
export function rewardPrices(ids:readonly string[],slugs:Record<string,string>,snapshot:PriceSnapshot|null,readQuote:(slug:string)=>Quote|null,now=Date.now()){
 if(snapshot&&(now-Date.parse(snapshot.fetchedAt)>86400000||Date.parse(snapshot.fetchedAt)>now))snapshot=null;
 const rows=new Map(snapshot?.rows.map(row=>[row.slug,row])??[]);
 const prices:Record<string,number|null>={},titles:Record<string,string>={};
 for(const id of ids){
  const slug=slugs[id];if(!slug||id==='/Lotus/Types/Recipes/Components/FormaBlueprint')continue;
  const row=rows.get(slug),quote=snapshot?.algorithm==='median-online-sell-v1'?null:readQuote(slug);
  if(snapshot?.algorithm==='median-online-sell-v1'&&row){
   const age=now-Date.parse(row.priceFetchedAt??'');
   prices[id]=row.algorithm==='median-online-sell-v1'&&Number.isFinite(age)&&age>=0&&age<=86400000?row.unitPrice:null;
   titles[id]=prices[id]!=null?`${age>900000?'旧参考价':'参考价'} · 在线卖家中位数 · ${row.sampleCount??0} 个卖家 · ${row.priceFetchedAt}`:row.lastError?'行情更新失败':Number.isFinite(age)?'暂无符合条件的在线卖单':'等待行情缓存';
   continue;
  }
  if(row?.priceFetchedAt&&(now-Date.parse(row.priceFetchedAt)>86400000||Date.parse(row.priceFetchedAt)>now))continue;
  if(quote?.price!=null&&(!snapshot||Date.parse(quote.fetchedAt)>=Date.parse(snapshot.fetchedAt))){prices[id]=quote.price;titles[id]=`在线卖家缓存 · ${quote.fetchedAt}`;}
  else if(row?.unitPrice!=null&&row.unitPrice>0){prices[id]=row.unitPrice;titles[id]=`${now-Date.parse(row.priceFetchedAt??snapshot!.fetchedAt)>900000?'旧参考价':'参考价'} · ${row.algorithm==='median-online-sell-v1'?'在线卖家中位数 · '+(row.sampleCount??0)+' 个卖家':snapshot!.source} · ${row.priceFetchedAt??snapshot!.fetchedAt}`;}
 }
 return {prices,titles};
}

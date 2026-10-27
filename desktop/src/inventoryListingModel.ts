export type ListingPart={id:string;quantity:number};
export type ListingCandidate={id:string;itemId:string;slug:string;name:string;kind:'set'|'part';parts:ListingPart[];favorite:boolean;reserveSet:boolean;blockedReason?:string;maxAdditional?:number};
export type ListingOptions={preferSets:boolean;keepNear:number;keepFavorites:boolean;mode:'median'|'lowest';offset:number;percent:boolean;minimum:number;maximum:number;deviationPlat:number;deviationPercent:number;maxOrders:number;maxQuantity:number};
export const defaultListingOptions:ListingOptions={preferSets:true,keepNear:2,keepFavorites:true,mode:'median',offset:-1,percent:false,minimum:1,maximum:800000,deviationPlat:5,deviationPercent:20,maxOrders:20,maxQuantity:10};
export type ListingQuote={at:number;prices:number[]};
export type ListingRow={candidate:ListingCandidate;available:number;quantity:number;price:number|null;reference:number|null;quoteAt:number;warnings:string[];reason:string;parts:ListingPart[]};
export const validQuantity=(n:unknown):n is number=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0&&n<=2147483647;
export function validateListingOptions(o:ListingOptions){
 if(!['median','lowest'].includes(o.mode)||!Number.isFinite(o.offset)||Math.abs(o.offset)>800000||![o.preferSets,o.keepFavorites,o.percent].every(v=>typeof v==='boolean')||!Number.isInteger(o.keepNear)||o.keepNear<0||o.keepNear>2||![o.minimum,o.maximum,o.maxOrders,o.maxQuantity].every(v=>Number.isSafeInteger(v)&&v>0)||o.minimum>o.maximum||o.maximum>800000||o.maxOrders>100||o.maxQuantity>9998||![o.deviationPlat,o.deviationPercent].every(v=>Number.isFinite(v)&&v>=0&&v<=800000))throw Error('配置数值无效 / Invalid configuration');
}
export function listingParts(parts:readonly ListingPart[]):ListingPart[]{
 const counts=new Map<string,number>();
 if(!parts.length)throw Error('套装组成未知 / Unknown composition');
 for(const p of parts){const n=(counts.get(p.id)??0)+p.quantity;if(!p.id||!validQuantity(p.quantity)||!p.quantity||!validQuantity(n))throw Error('部件数量无效 / Invalid component quantity');counts.set(p.id,n);}
 return [...counts].sort(([a],[b])=>a.localeCompare(b)).map(([id,quantity])=>({id,quantity}));
}
export function listingPrice(quote:ListingQuote|undefined,o:ListingOptions,now:number){
 const warnings:string[]=[];
 if(!quote||!Number.isFinite(quote.at)||quote.at>now+5000||now-quote.at>120000)return {price:null,reference:null,warnings,reason:'报价缺失或超过 2 分钟 / Missing or stale quote'};
 const prices=quote.prices.filter(p=>Number.isSafeInteger(p)&&p>=1&&p<=800000).sort((a,b)=>a-b);
 if(!prices.length)return {price:null,reference:null,warnings,reason:'没有有效报价 / No eligible offers'};
 const mid=Math.floor(prices.length/2),reference=prices.length%2?prices[mid]:(prices[mid-1]+prices[mid])/2;
 const base=o.mode==='lowest'?prices[0]:reference;
 const price=Math.max(o.minimum,Math.min(o.maximum,Math.round(o.percent?base*(1+o.offset/100):base+o.offset)));
 if(prices.length<3)warnings.push('报价少于 3 名卖家 / Fewer than 3 sellers');
 if(Math.abs(price-reference)>o.deviationPlat||Math.abs(price-reference)/reference*100>o.deviationPercent)warnings.push('售价偏离参考价 / Price deviates from reference');
 return {price,reference,warnings,reason:''};
}
/** All set and part rows draw from one ledger. Unknown stock never means zero. */
export function allocateListings(candidates:readonly ListingCandidate[],stock:Readonly<Record<string,number|null>>,reserved:Readonly<Record<string,number|null>>,listed:Readonly<Record<string,number>>,quotes:Readonly<Record<string,ListingQuote>>,options:ListingOptions,now:number,selection?:ReadonlySet<string>,overrides:Readonly<Record<string,{quantity:number;price:number}>>={}){
 validateListingOptions(options);
 const ids=new Set<string>(),marketIds=new Set<string>();
 const parsed=candidates.map(c=>{if(!c.id||ids.has(c.id)||!c.itemId||marketIds.has(c.itemId))throw Error('重复物品映射 / Duplicate item mapping');ids.add(c.id);marketIds.add(c.itemId);return {...c,parts:listingParts(c.parts)};});
 const keep:Record<string,number|null>={...reserved},near=new Set<string>();
 for(const c of parsed){
  if(options.keepFavorites&&c.favorite)for(const p of c.parts)keep[p.id]=stock[p.id]??null;
  if(c.kind==='set'&&c.reserveSet&&options.keepNear>0){
   const known=c.parts.every(p=>validQuantity(stock[p.id])),missing=c.parts.filter(p=>known&&stock[p.id]!<p.quantity).length;
   if(known&&missing>0&&missing<=options.keepNear&&c.parts.some(p=>stock[p.id]!>0))for(const p of c.parts){if(keep[p.id]!==null){keep[p.id]=Math.max(keep[p.id]??0,Math.min(stock[p.id]!,p.quantity));near.add(p.id);}}
  }
 }
 const left:Record<string,number|null>={};
 for(const c of parsed)for(const p of c.parts){const owned=stock[p.id],r=keep[p.id],l=listed[p.id]??0;left[p.id]=validQuantity(owned)&&validQuantity(r)&&validQuantity(l)?Math.max(0,owned-r-l):null;}
 let accepted=0;
 const rows:ListingRow[]=[];
 for(const c of [...parsed].sort((a,b)=>(options.preferSets?Number(b.kind==='set')-Number(a.kind==='set'):Number(a.kind==='set')-Number(b.kind==='set'))||a.id.localeCompare(b.id))){
  const q=listingPrice(quotes[c.itemId],options,now),available=c.parts.every(p=>left[p.id]!=null)?Math.min(...c.parts.map(p=>Math.floor(left[p.id]!/p.quantity))):0;
  const edit=overrides[c.id];let quantity=Math.min(available,options.maxQuantity,c.maxAdditional??9998),price=q.price,reason=q.reason,warnings=[...q.warnings];
  if(c.parts.some(p=>left[p.id]==null))reason='库存或保留需求待核实 / Inventory or reserves unknown';
  else if(!available)reason=c.parts.some(p=>near.has(p.id))?'保留：接近完整套装 / Reserved for near-complete set':'已保留或已挂单 / Reserved or already listed';
  if(c.maxAdditional!=null&&(!validQuantity(c.maxAdditional)||c.maxAdditional===0))reason='已有订单达到数量上限 / Existing order at quantity limit';
  if(c.blockedReason)reason=c.blockedReason;
  if(selection&&!selection.has(c.id))reason='未选择 / Not selected';
  if(edit){if(!Number.isSafeInteger(edit.quantity)||edit.quantity<1||edit.quantity>quantity||!Number.isSafeInteger(edit.price)||edit.price<options.minimum||edit.price>options.maximum)reason='手动数量或价格超出范围 / Invalid override';else {quantity=edit.quantity;price=edit.price;if(q.reference!==null&&(Math.abs(price-q.reference)>options.deviationPlat||Math.abs(price-q.reference)/q.reference*100>options.deviationPercent))warnings.push('手动售价偏离参考价 / Manual price deviation');}}
  if(accepted>=options.maxOrders&&!reason)reason='已达本次数量限制 / Order limit reached';
  if(reason||price===null)quantity=0;
  if(quantity){accepted++;for(const p of c.parts)left[p.id]!-=p.quantity*quantity;}
  rows.push({candidate:c,available,quantity,price,reference:q.reference,quoteAt:quotes[c.itemId]?.at??0,warnings:[...new Set(warnings)],reason,parts:c.parts});
 }
 return {rows,keep,left,total:rows.reduce((n,r)=>n+r.quantity*(r.price??0),0)};
}
export type ListingOrder={id:string;itemId:string;type:string;quantity:number;platinum:number;visible?:boolean;rank?:number|null;subtype?:string|null;perTrade?:number|null;charges?:number|null;amberStars?:number|null;cyanStars?:number|null};
export function listingOrdersFingerprint(orders:readonly ListingOrder[]){
 const ids=new Set<string>();for(const o of orders)if(!o.id||ids.has(o.id)||!o.itemId||!['buy','sell'].includes(o.type)||!validQuantity(o.quantity)||o.quantity<1||!Number.isSafeInteger(o.platinum)||o.platinum<1)throw Error('订单数据无效 / Invalid orders');else ids.add(o.id);
 return JSON.stringify([...orders].sort((a,b)=>a.id.localeCompare(b.id)).map(o=>[o.id,o.itemId,o.type,o.quantity,o.platinum,o.visible!==false,o.rank??null,o.subtype??null,o.perTrade??1,o.charges??null,o.amberStars??null,o.cyanStars??null]));
}
export type ListingResult={id:string;state:'pending'|'sending'|'success'|'failed'|'uncertain'|'cancelled';message:string};
/** Used once. The journal is durably saved BEFORE every mutation. No write retries. */
export class InventoryListingRunner{
 private used=false;private stop=false;cancel(){this.stop=true;}
 async run(rows:readonly ListingRow[],io:{validate:(row:ListingRow)=>Promise<void>;write:(r:ListingRow)=>Promise<{id:string}>;journal:(r:ListingRow|null)=>void;reconcile:(r:ListingRow)=>Promise<{id:string}|null>;publish:(r:ListingResult[])=>void;wait:()=>Promise<void>}){
  if(this.used)throw Error('请重新生成预览 / Preview already used');this.used=true;
  const result:ListingResult[]=rows.filter(r=>r.quantity>0).map(r=>({id:r.candidate.id,state:'pending',message:''}));
  const publish=()=>io.publish(result.map(r=>({...r})));publish();
  for(const out of result){if(this.stop)break;const row=rows.find(r=>r.candidate.id===out.id)!;let sent=false;
   try{await io.wait();await io.validate(row);if(this.stop)break;io.journal(row);out.state='sending';publish();sent=true;const receipt=await io.write(row);if(!receipt?.id)throw Error('缺少订单回执 / Missing receipt');io.journal(null);out.state='success';out.message=receipt.id;}
   catch(error){out.state=sent?'uncertain':'failed';out.message=String(error);if(sent){try{const receipt=await io.reconcile(row);if(receipt?.id){io.journal(null);out.state='success';out.message=receipt.id;}}catch{} }publish();break;}
   publish();
  }
  for(const row of result)if(row.state==='pending'){row.state='cancelled';row.message='未发送 / Not sent';}publish();return result;
 }
}

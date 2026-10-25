export type BulkAction='prices'|'show'|'hide'|'fix'|'delete';
export type BulkContext={accountId:string;platform:string};
export type BulkOrder={id:string;itemId:string;type:'sell'|'buy';platinum:number;quantity:number;visible?:boolean;rank?:number|null;subtype?:string|null;charges?:number|null;amberStars?:number|null;cyanStars?:number|null;perTrade?:number|null};
export type BulkQuote=BulkOrder&{user?:{id?:string;status?:string;locale?:string}};
export type BulkItem={order:BulkOrder;label:string;action:'update'|'delete'|'close'|null;body:Record<string,number|boolean>;reason:string;source:string;inventoryOwned?:number};
export type BulkPlan={id:string;context:BulkContext;createdAt:string;action:BulkAction;items:BulkItem[]};
export const sameBulkContext=(a:BulkContext,b:BulkContext)=>!!a.accountId&&a.accountId===b.accountId&&a.platform===b.platform;
export const bulkVariant=(o:BulkOrder)=>JSON.stringify([o.itemId,o.type,o.rank??null,o.subtype??'',o.charges??null,o.amberStars??null,o.cyanStars??null,Math.max(1,o.perTrade??1)]);
export const bulkOrderFingerprint=(o:BulkOrder)=>JSON.stringify([o.id,bulkVariant(o),o.platinum,o.quantity,o.visible!==false]);
export function matchingBulkPrice(order:BulkOrder,quotes:readonly BulkQuote[],ownIds:ReadonlySet<string>,accountId:string):number|null{
 const prices=quotes.filter(q=>q.user&&q.user.id!==accountId&&!ownIds.has(q.id)&&q.user.status==='ingame'&&q.user.locale==='en'&&q.visible!==false&&q.quantity>0&&bulkVariant(q)===bulkVariant(order)&&Number.isSafeInteger(q.platinum)&&q.platinum>0&&q.platinum<=800000).map(q=>q.platinum);
 return prices.length?(order.type==='sell'?Math.min(...prices):Math.max(...prices)):null;
}
export function buildBulkPlan(action:BulkAction,selected:readonly BulkOrder[],all:readonly BulkOrder[],context:BulkContext,options:{id:string;createdAt:string;label:(o:BulkOrder)=>string;prices?:ReadonlyMap<string,number|null>;priceErrors?:ReadonlySet<string>;owned?:ReadonlyMap<string,number|null>}):BulkPlan{
 if(!context.accountId||!['pc','ps4','xbox','switch'].includes(context.platform))throw Error('请重新登录并读取当前市场账号');
 const ids=new Set<string>();
 const chosen=selected.filter(o=>{if(!o.id||ids.has(o.id))return false;ids.add(o.id);return true;});
 const reserved=new Map<string,number>();
 if(action==='fix')for(const o of all)if(!ids.has(o.id)&&o.type==='sell')reserved.set(bulkVariant(o),(reserved.get(bulkVariant(o))??0)+o.quantity);
 const plannedPrices=new Set<string>();
 const items=chosen.map(original=>{
  const order=structuredClone(original),item:BulkItem={order,label:options.label(order),action:null,body:{},reason:'',source:action==='prices'?'WFM · 游戏中 · 英文 · 相同规格':action==='fix'?'本次完整库存':'当前订单'};
  if(!order.itemId||!['sell','buy'].includes(order.type)||!Number.isSafeInteger(order.quantity)||order.quantity<1){item.reason='订单数据不完整';return item;}
  if(action==='delete'){item.action='delete';return item;}
  if(action==='show'||action==='hide'){const visible=action==='show';if((order.visible!==false)===visible)item.reason='无需变更';else {item.action='update';item.body={visible};}return item;}
  if(action==='fix'){
   if(order.type!=='sell'){item.reason='收购订单无需库存修正';return item;}
   const owned=options.owned?.get(order.id),key=bulkVariant(order),used=reserved.get(key)??0;
   if(owned==null||!Number.isSafeInteger(owned)||owned<0){item.reason='库存或物品规格待核实';return item;}
   item.inventoryOwned=owned;
   let quantity=Math.min(order.quantity,Math.max(0,owned-used));if(quantity<Math.max(1,order.perTrade??1))quantity=0;
   reserved.set(key,used+quantity);
   if(quantity===order.quantity)item.reason='无需变更';else if(quantity===0)item.action='delete';else {item.action='update';item.body={quantity};}
   return item;
  }
  if(options.priceErrors?.has(order.id)){item.reason='报价读取失败，未生成改价';return item;}
  const price=options.prices?.get(order.id);
  if(price==null||!Number.isSafeInteger(price)||price<1||price>800000){item.reason='没有可用的相同规格报价';return item;}
  if(price===order.platinum){item.reason='价格未变';return item;}
  if(all.some(o=>o.id!==order.id&&bulkVariant(o)===bulkVariant(order)&&o.platinum===price)){item.reason='相同规格已有同价订单';return item;}
  const priceKey=bulkVariant(order)+':'+price;
  if(plannedPrices.has(priceKey)){item.reason='本任务已有相同规格同价变更';return item;}
  plannedPrices.add(priceKey);
  item.action='update';item.body={platinum:price};return item;
 });
 return {id:options.id,createdAt:options.createdAt,context:{...context},action,items};
}
export type BulkStatus='pending'|'running'|'succeeded'|'unchanged'|'skipped'|'failed'|'uncertain'|'cancelled';
export type BulkResult={id:string;status:BulkStatus;message:string};
export class MarketBulkRunner{
 private cancelled=false;private used=false;private started=false;
 cancel(){this.cancelled=true;}
 async run(plan:Pick<BulkPlan,'id'|'context'|'items'>,io:{context:()=>BulkContext;read:()=>Promise<BulkOrder[]>;validate?:(item:BulkItem)=>Promise<string|null>;reserve?:(item:BulkItem)=>Promise<string|null>;write:(item:BulkItem)=>Promise<unknown>;wait:()=>Promise<void>;publish:(rows:BulkResult[])=>void}){
  if(this.used||this.started)throw Error('此任务已执行，请刷新订单后重新预览');this.used=true;this.started=true;
  const result=plan.items.map(i=>({id:i.order.id,status:(i.action?'pending':i.reason==='无需变更'||i.reason==='价格未变'?'unchanged':'skipped') as BulkStatus,message:i.reason}));
  const publish=()=>io.publish(result.map(r=>({...r})));publish();
  try{for(let index=0;index<plan.items.length;index++){
   const item=plan.items[index],row=result[index];if(row.status!=='pending')continue;
   if(this.cancelled||!sameBulkContext(plan.context,io.context()))break;
   row.status='running';publish();
   let sent=false;
   try{
    await io.wait();if(this.cancelled||!sameBulkContext(plan.context,io.context())){row.status='pending';break;}
    const invalid=await io.validate?.(item);if(invalid){row.status='skipped';row.message=invalid;publish();continue;}
    if(this.cancelled||!sameBulkContext(plan.context,io.context())){row.status='pending';break;}
    let latest:BulkOrder[];
    // Reads may be retried once; writes are never retried on an ambiguous transport failure.
    try{latest=await io.read();}catch{await io.wait();if(this.cancelled||!sameBulkContext(plan.context,io.context())){row.status='pending';break;}latest=await io.read();}
    const matches=latest.filter(o=>o.id===item.order.id);
    if(matches.length!==1||bulkOrderFingerprint(matches[0])!==bulkOrderFingerprint(item.order)){row.status='skipped';row.message='订单已变化，请重新预览';publish();continue;}
    await io.wait();if(this.cancelled||!sameBulkContext(plan.context,io.context())){row.status='pending';break;}
    const reserved=await io.reserve?.(item);if(reserved){row.status='skipped';row.message=reserved;publish();continue;}
    if(this.cancelled||!sameBulkContext(plan.context,io.context())){row.status='cancelled';row.message='发送前已取消；已预留的成交请手动核对';break;}
    sent=true;await io.write(item);row.status='succeeded';row.message='市场已返回成功回执';
   }catch(error){row.status=sent?'uncertain':'failed';row.message=String(error)+(sent?'；请刷新核对，未自动重试':'；读取失败，未发送变更');publish();break;}
   publish();
  }}finally{for(const row of result)if(row.status==='pending'||row.status==='running'){row.status='cancelled';row.message='未执行；已完成变更保留';}this.started=false;publish();}
  return result;
 }
}

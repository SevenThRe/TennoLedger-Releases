import type {BulkContext,BulkItem,BulkOrder} from './marketBulkModel.ts';
import type {InventorySet} from './inventorySetsModel.ts';
export type FinishItem={itemId:string;quantity:number;rank?:number|null;subtype?:string|null;charges?:number|null;amberStars?:number|null;cyanStars?:number|null};
export type FinishCandidate={id:string;accountScope:string;occurredAt:string;confirmed:boolean;side:'sale'|'purchase'|'exchange';partner:string;platinum:number|null;items:FinishItem[];identitiesComplete?:boolean};
export type GameTradeFinished={id:string;accountScope:string;capturedAt:string;partner:string;sent:(FinishItem&{rawDisplayName?:string})[];received:(FinishItem&{rawDisplayName?:string})[];kind:'sale'|'purchase'|'exchange';complete:boolean;platinum:number|null};
export function parseGameTradeFinished(value:unknown,scope:string):GameTradeFinished|null{
 if(!value||typeof value!=='object')return null;const v=value as GameTradeFinished;
 if(v.accountScope!==scope||typeof v.id!=='string'||!v.id||v.id.length>512||!Number.isFinite(Date.parse(v.capturedAt))||!['sale','purchase','exchange'].includes(v.kind)||typeof v.complete!=='boolean'||typeof v.partner!=='string')return null;
 for(const list of [v.sent,v.received])if(!Array.isArray(list)||list.length>100||list.some(i=>!i||typeof i.itemId!=='string'&&i.itemId!=null||!Number.isSafeInteger(i.quantity)||i.quantity<1||i.rank!=null&&(!Number.isSafeInteger(i.rank)||i.rank<0||i.rank>20)))return null;
 if(v.platinum!=null&&(!Number.isSafeInteger(v.platinum)||v.platinum<0))return null;
 const normalize=(list:GameTradeFinished['sent'])=>list.map(i=>({...i,itemId:i.itemId??'unresolved:'+(i.rawDisplayName??'unknown')}));
 return {...v,sent:normalize(v.sent),received:normalize(v.received),platinum:v.platinum??null};
}
export function gameTradeCandidate(event:GameTradeFinished):FinishCandidate{return {id:event.id,accountScope:event.accountScope,occurredAt:event.capturedAt,confirmed:true,side:event.kind,partner:event.partner,platinum:event.platinum,items:event.kind==='sale'?event.sent:event.received,identitiesComplete:event.complete};}
export type FinishMarketItem={id:string;gameRef?:string;slug:string;maxRank?:number;tags?:string[]};
export type FinishMatch={status:'matched'|'ambiguous'|'unmatched'|'expired'|'unconfirmed';reason:string;matches:{order:BulkOrder;quantity:number;market:FinishMarketItem}[]};
function variantsMatch(item:FinishItem,market:FinishMarketItem,order:BulkOrder){
 if(market.maxRank!=null&&(item.rank==null||!Number.isSafeInteger(item.rank)||item.rank<0||item.rank>market.maxRank))return false;
 return ['rank','subtype','charges','amberStars','cyanStars'].every(key=>(item[key as keyof FinishItem]??null)===(order[key as keyof BulkOrder]??null));
}
export function matchTradeFinish(candidate:FinishCandidate,orders:readonly BulkOrder[],market:readonly FinishMarketItem[],sets:readonly InventorySet[],now:number,activeScope:string):FinishMatch{
 const fail=(status:FinishMatch['status'],reason:string):FinishMatch=>({status,reason,matches:[]});
 if(!candidate.confirmed||candidate.accountScope!==activeScope)return fail('unconfirmed','成交尚未确认或账号资料已变化');
 if(candidate.side==='exchange')return fail('unmatched','物品交换不自动匹配买卖订单，请在我的订单手动核对');
 const time=Date.parse(candidate.occurredAt);if(!Number.isFinite(time)||time>now+60000||now-time>15*60000)return fail('expired','成交超出 15 分钟匹配窗口，请核对后手动处理');
 if(candidate.identitiesComplete===false||!candidate.id||!candidate.items.length||candidate.items.some(i=>!i.itemId||i.itemId.startsWith('unresolved:')||!Number.isSafeInteger(i.quantity)||i.quantity<1))return fail('unmatched','物品或数量待核实');
 const byId=new Map(market.map(i=>[i.id,i])),type=candidate.side==='sale'?'sell':'buy';
 const aggregate=new Map<string,number>();for(const i of candidate.items)aggregate.set(i.itemId,(aggregate.get(i.itemId)??0)+i.quantity);
 const setChoices:{order:BulkOrder;quantity:number;market:FinishMarketItem}[]=[];
 for(const order of orders){
  if(order.type!==type)continue;const m=byId.get(order.itemId);if(!m?.gameRef)continue;
  const contract=sets.find(s=>s.parentId===m.gameRef&&s.slug===m.slug&&s.parts?.length);
  if(!contract?.parts||contract.parts.length!==aggregate.size)continue;
  const counts=contract.parts.map(p=>(aggregate.get(p.itemId)??0)/p.quantity),quantity=counts[0];
  if(counts.every(n=>Number.isSafeInteger(n)&&n>0&&n===quantity)&&quantity<=order.quantity)setChoices.push({order,quantity,market:m});
 }
 if(setChoices.length>1)return fail('ambiguous','存在多个对应套装订单，请手动指定');
 if(setChoices.length===1)return {status:'matched',reason:'精确套装部件与数量匹配',matches:setChoices};
 const matches:FinishMatch['matches']=[];
 for(const item of candidate.items){
  const found=orders.flatMap(order=>{const m=byId.get(order.itemId);return order.type===type&&m?.gameRef===item.itemId&&variantsMatch(item,m,order)&&item.quantity<=order.quantity?[{order,quantity:item.quantity,market:m}]:[];});
  if(found.length>1)return fail('ambiguous','相同物品或规格有多个订单，请手动指定');
  if(!found.length)return fail('unmatched','没有可确证的同物品、方向、等级与数量订单');
  matches.push(found[0]);
 }
 const totals=new Map<string,number>();for(const match of matches)totals.set(match.order.id,(totals.get(match.order.id)??0)+match.quantity);
 if(matches.some(m=>totals.get(m.order.id)!>m.order.quantity))return fail('unmatched','成交数量超过市场订单数量');
 return {status:'matched',reason:'精确物品与规格匹配',matches:[...new Set(matches.map(m=>m.order.id))].map(id=>({...matches.find(m=>m.order.id===id)!,quantity:totals.get(id)!}))};
}
export function buildTradeFinishPlan(candidate:FinishCandidate,match:FinishMatch,context:BulkContext,id:string){
 if(match.status!=='matched'||!context.accountId||!candidate.confirmed||candidate.side==='exchange')throw Error('成交或订单未确证');
 const items:BulkItem[]=match.matches.map(m=>({order:structuredClone(m.order),label:m.market.slug,action:'close',body:{quantity:m.quantity},reason:'',source:'用户已确认的游戏成交'}));
 return {id,context:{...context},candidateId:candidate.id,accountScope:candidate.accountScope,completeEvent:true,items};
}

import {invoke} from '@tauri-apps/api/core';
import {saleSnapshot} from './saleSnapshot';
import {saleOrderParts} from './saleOrderParts';
import {saleAccountResponse} from './saleAccountResponse';
import type {SaleRecipe} from './saleCrafting';
import type {InventorySet} from './inventorySetsModel';
import type {LiveCollection} from './useCollectionSnapshot';
import type {MarketSession} from './MarketAccount';
import {listingParts,listingOrdersFingerprint,validQuantity,type ListingCandidate,type ListingQuote,type ListingOrder} from './inventoryListingModel';
export type ListingCatalogItem={id:string;name:string;zh?:string;category:string;prime:boolean;maxRank:number};
type MarketItem={id:string;slug:string;gameRef?:string;maxRank?:number|null;subtypes?:string[];maxCharges?:number|null;maxAmberStars?:number|null;maxCyanStars?:number|null;bulkTradable?:boolean;tags?:string[]};
export const listingContext=(s:MarketSession)=>JSON.stringify([s.accountId,s.platform,s.sessionGeneration,s.connected,s.verified]);
export function assertListingSession(s:MarketSession){if(!s.connected||s.verified!==true||!s.accountId||!s.platform||!Number.isSafeInteger(s.sessionGeneration))throw Error('请登录并验证市场账号 / Sign in with a verified market account');}
export const listingRequest=(s:MarketSession,action:string,key='',body:Record<string,unknown>={},guards?:{inventory:LiveCollection;orders:ListingOrder[]})=>invoke<{data:unknown;fetchedAt:string}>('market_request_scoped',{action,key,body,platform:s.platform,expectedAccount:s.accountId,expectedPlatform:s.platform,expectedGeneration:s.sessionGeneration,expectedInventory:guards?.inventory,expectedOrders:guards?.orders,forceRefresh:action==='book'});
export function decodeListingOrders(data:unknown){const orders=saleAccountResponse([],data).orders as ListingOrder[];listingOrdersFingerprint(orders);return orders;}
export function assertListingSnapshot(s:LiveCollection|null,scope:string,now=Date.now()):asserts s is LiveCollection{
 if(!s?.complete||s.accountScope!==scope||!s.accountScope||!Array.isArray(s.favorites)||!s.pendingRecipes||!s.masteryAccount?.ranksComplete||!Number.isFinite(Date.parse(s.capturedAt))||Date.parse(s.capturedAt)>now+5000||now-Date.parse(s.capturedAt)>600000)throw Error('请同步当前账号完整库存（10 分钟内），包括精通与制造队列 / Sync complete, recent inventory');
}
const json=async(path:string)=>{const r=await fetch(path);if(!r.ok)throw Error('目录读取失败 / Catalog unavailable');return r.json();};
export async function loadListingInputs(items:ListingCatalogItem[],en:boolean,session:MarketSession,scope:string,keepUnmastered:boolean){
 assertListingSession(session);
 const snapshot=await invoke<LiveCollection|null>('load_collection');assertListingSnapshot(snapshot,scope);
 const [setData,craftData,sourceData,marketData,orderData]=await Promise.all([json('/inventory-sets.json'),json('/sale-crafting-index.json'),json('/mastery-sources.json'),listingRequest(session,'items'),listingRequest(session,'mine')]);
 const market=marketData.data as MarketItem[],orders=decodeListingOrders(orderData.data);saleAccountResponse(market,orders);
 const plain=(m:MarketItem)=>m.maxRank==null&&!m.subtypes?.length&&m.maxCharges==null&&m.maxAmberStars==null&&m.maxCyanStars==null&&!m.bulkTradable;
 const byId=new Map(items.map(i=>[i.id,i]));const sources=sourceData as {marketSlugs:Record<string,string>};
 const resolve=(slug:string)=>{const found=market.filter(i=>i.slug===slug);return found.length===1&&plain(found[0])?found[0]:null;};
 const sets=setData.sets as InventorySet[];if(!Array.isArray(sets)||!Array.isArray(craftData.recipes))throw Error('目录格式错误 / Invalid catalog');
 const candidates:ListingCandidate[]=[],partIds=new Set<string>();
 for(const s of sets){const parent=s.parentId?byId.get(s.parentId):null;if(!parent?.prime||!s.parts?.length||s.unverifiedReason||s.parts.some(p=>p.countPolicy&&p.countPolicy!=='count'))continue;
  let parts;try{parts=listingParts(s.parts.map(p=>({id:p.itemId,quantity:p.quantity})));}catch{continue;}
  for(const p of parts)partIds.add(p.id);
  const m=resolve(s.slug);if(!m)continue;
  candidates.push({id:s.id,itemId:m.id,slug:m.slug,name:en?s.name:(parent.zh??parent.name)+' 套装',kind:'set',parts,favorite:snapshot.favorites!.includes(parent.id)||snapshot.favorites!.includes(s.id),reserveSet:!(snapshot.counts[parent.id]>0||parent.maxRank>0&&(snapshot.ranks?.[parent.id]??0)>=parent.maxRank)});
 }
 for(const id of [...partIds].sort()){const item=byId.get(id),m=resolve(sources.marketSlugs[id]);if(!item||!m||item.category!=='component')continue;candidates.push({id,itemId:m.id,slug:m.slug,name:en?item.name:item.zh??item.name,kind:'part',parts:[{id,quantity:1}],favorite:snapshot.favorites!.includes(id),reserveSet:false});}
 const stock:Record<string,number|null>={},reserved:Record<string,number|null>={},listed:Record<string,number>={};
 for(const id of partIds){const n=snapshot.counts[id]??0;stock[id]=validQuantity(n)?n:null;reserved[id]=null;}
 // Always protect favorite crafting goals; optionally protect every unowned/unmastered goal.
 const safe=saleSnapshot([...partIds].map(id=>({id,owned:stock[id]??-1})),craftData.recipes as SaleRecipe[],byId,snapshot,!keepUnmastered);
 for(const row of safe)reserved[row.id]=row.safeToSell===null?null:stock[row.id]!-row.safeToSell;
 const resolver=saleOrderParts(items.map(i=>({id:i.id,slug:sources.marketSlugs[i.id]})),market,sets);
 for(const order of orders.filter(o=>o.type==='sell')){const parts=resolver(order);if(parts===null)throw Error('已有卖单的库存占用无法确认 / Existing sell order allocation unknown');for(const [id,q] of parts){const n=(listed[id]??0)+q*order.quantity;if(!validQuantity(n))throw Error('卖单数量异常 / Invalid sell quantity');listed[id]=n;}}
 for(const c of candidates){const own=orders.filter(o=>o.type==='sell'&&o.itemId===c.itemId);c.maxAdditional=own.length===1?Math.max(0,9998-own[0].quantity):9998;if(own.length>1||own.some(o=>o.rank!=null||o.subtype!=null||(o.perTrade??1)!==1||o.charges!=null||o.amberStars!=null||o.cyanStars!=null||o.quantity>=9998))c.blockedReason='已有订单规格或数量冲突 / Existing order conflict';}
 return {snapshot,candidates,stock,reserved,listed,orders,session:{...session},scope};
}
export type ListingInputs=Awaited<ReturnType<typeof loadListingInputs>>;
export async function loadListingQuote(c:ListingCandidate,s:MarketSession):Promise<ListingQuote>{
 const response=await listingRequest(s,'book',c.slug);if(!Array.isArray(response.data))throw Error('报价格式错误 / Invalid quote response');
 const sellers=new Map<string,number>();
 for(const q of response.data as (ListingOrder&{user?:{id?:string;status?:string}})[]){if(q.itemId!==c.itemId||q.type!=='sell'||q.visible===false||!validQuantity(q.quantity)||!q.quantity||!Number.isSafeInteger(q.platinum)||q.platinum<1||q.platinum>800000||!q.user?.id||q.user.id===s.accountId||q.user.status!=='ingame'||q.rank!=null||q.subtype!=null||q.charges!=null||q.amberStars!=null||q.cyanStars!=null||(q.perTrade??1)!==1)continue;sellers.set(q.user.id,Math.min(sellers.get(q.user.id)??Infinity,q.platinum));}
 return {at:Date.parse(response.fetchedAt),prices:[...sellers.values()].sort((a,b)=>a-b).slice(0,10)};
}

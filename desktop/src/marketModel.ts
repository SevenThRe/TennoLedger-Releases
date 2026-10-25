import {officialItemName} from './officialItemNames.ts';
type Row=Record<string,any>;
export function marketDisplayName(item:Row,local:Row|undefined,language='zh-CN'):string{
 const english=item.i18n?.en?.name||item.name||item.slug||'未知物品';
 if(!language.startsWith('zh'))return english;
 const valid=(value:unknown):value is string=>typeof value==='string'&&!!value.trim()&&!value.includes('�');
 const translated=[item.i18n?.['zh-hans']?.name,item.i18n?.['zh-cn']?.name].find(valid);
 if(valid(translated))return translated;
 const official=officialItemName(item.gameRef,english,item.slug);
 if(official)return official+(String(item.slug??'').endsWith('_set')?' 套装':'');
 if(valid(local?.zh))return local!.zh+(String(item.slug??'').endsWith('_set')?' 套装':'');
 const veiled:Record<string,string>={rifle:'步枪',shotgun:'霰弹枪',pistol:'手枪',melee:'近战',kitgun:'组合枪',zaw:'组合近战',archgun:'Archwing 枪械',companion_weapon:'同伴武器'};
 const category=String(item.slug??'').replace(/_riven_mod_veiled$/,'');
 return category!==item.slug&&veiled[category]?veiled[category]+'紫卡（未揭示）':english;
}
export const marketSlug=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
export function marketCatalogResolver(catalog:Row[],marketSlugs:Record<string,string>={}){
 const byId=new Map<string,Row>(),byName=new Map<string,Row>();
 for(const item of catalog){if(!byId.has(item.id))byId.set(item.id,item);byName.set(marketSlug(item.name),item);}
 const mapped=new Map(Object.entries(marketSlugs).map(([id,slug])=>[slug,byId.get(id)]));
 return (item:Row)=>byId.get(item.gameRef)??mapped.get(item.slug)??byName.get(item.slug)
  ??byName.get(marketSlug(item.i18n?.en?.name??item.name??item.slug??''))??byName.get(String(item.slug).replace(/_set$/,''));
}
/** Write paths always use exact-rank ownership. The missing-item display preference is separate. */
export function orderOwned(m:Row,local:Row|undefined,snapshot:Row|null,sources:Row|null,order?:Row):number|null{
 return ownedForOrder(m,local,snapshot,sources,order,true);
}
export function displayOrderOwned(m:Row,local:Row|undefined,snapshot:Row|null,sources:Row|null,order:Row|undefined,takeRankIntoAccount:boolean):number|null{
 return ownedForOrder(m,local,snapshot,sources,order,takeRankIntoAccount);
}
function ownedForOrder(m:Row,local:Row|undefined,snapshot:Row|null,sources:Row|null,order:Row|undefined,takeRankIntoAccount:boolean):number|null{
 if(!snapshot?.counts)return null;
 const count=(id:string):number|null=>Object.hasOwn(snapshot.counts,id)?snapshot.counts[id]:snapshot.complete?0:null;
 const slug=String(m.slug??'');
 if(slug.includes('riven')&&slug.includes('veiled')&&Array.isArray(snapshot.rivens)){
  const name=slug.replace(/_?\(?veiled\)?/g,'').replace(/_$/,'');
  return snapshot.rivens.filter((r:Row)=>r.veiled&&marketSlug(r.name)===name).reduce((n:number,r:Row)=>n+r.quantity,0);
 }
 if(slug.endsWith('_set')){
  // A market set is tradable components, not the built weapon/frame or crafting resources.
  const parts=sources?.items?.[local?.id]?.parts??(!local?.prime?local?.recipe?.parts?.filter((p:Row)=>p.itemId.includes('/Types/Recipes/')):undefined);
  if(!parts?.length)return null;
  const amounts=parts.map((p:Row)=>{const n=count(p.itemId);return n===null?null:Math.floor(n/p.quantity);});
  return amounts.includes(null)?null:Math.min(...amounts);
 }
 const id=m.gameRef||local?.id;
 if(id&&m.maxRank!=null&&(['mod','arcane'].includes(local?.category)||m.tags?.some((tag:string)=>['mod','arcane'].includes(tag)))){
  if(!takeRankIntoAccount)return count(id);
  const all=snapshot.upgradeCountsByRank,rank=order?.rank??0;
  if(!all||!Number.isInteger(rank)||rank<0||rank>m.maxRank)return null;
  if(Object.hasOwn(all,id)&&all[id]===null)return null;
  return all[id]?.[rank]??0;
 }
 return id?count(id):null;
}
const variant=(r:Row)=>[r.rank??0,r.subtype??null,r.charges??null,r.amberStars??null,r.cyanStars??null];
export const orderQuoteKey=(r:Row)=>JSON.stringify([r.itemId,...variant(r)]);
export function marketOrderQuotes(rows:Row[],target:Row,includeOffline=false):Row[]{
 const expected=JSON.stringify(variant(target));
 return rows.filter(r=>r&&['sell','buy'].includes(r.type)&&r.visible!==false&&Number.isInteger(r.quantity)&&r.quantity>0&&Number.isInteger(r.perTrade??1)&&(r.perTrade??1)>0&&(r.perTrade??1)<=r.quantity&&(includeOffline?['online','ingame','offline']:['online','ingame']).includes(r.user?.status)&&JSON.stringify(variant(r))===expected&&Number.isFinite(r.platinum)&&r.platinum>0).sort((a,b)=>a.type!==b.type?(a.type==='sell'?-1:1):(a.type==='sell'?1:-1)*(a.platinum/(a.perTrade??1)-b.platinum/(b.perTrade??1)));
}
export function orderLowest(rows:Row[],target:Row|number=0):number|null{
 const best=marketOrderQuotes(rows,typeof target==='number'?{rank:target}:target).find(r=>r.type==='sell');
 return best?best.platinum/(best.perTrade??1):null;
}
// AlecaFrame GetBuySellWindowData restricts trade-panel offers to this pool.
// Keep this separate from the independent order valuation/price-service path.
export function marketTradeQuotes(rows:Row[],target:Row,inGameOnly=true):Row[]{
 return marketOrderQuotes(rows.filter(r=>(!inGameOnly||r?.user?.status==='ingame')&&r?.user?.locale==='en'),target,!inGameOnly);
}
export function marketRankTradeQuotes(rows:Row[],rank:number,inGameOnly=true):Row[]{
 if(!Number.isInteger(rank)||rank<0||rank>100)return [];
 return marketTradeQuotes(rows.filter(row=>Number.isInteger(row?.rank)&&row.rank===rank),{rank},inGameOnly);
}
export async function loadOrderQuotes(rows:Row[],slugFor:(order:Row)=>string|undefined,fetchBook:(slug:string)=>Promise<Row[]>,publish:(values:Record<string,number|null|'error'>)=>void,current:()=>boolean){
 const groups=new Map<string,Map<string,Row>>(),missing:Record<string,'error'>={};
 for(const order of rows){const key=orderQuoteKey(order),slug=slugFor(order);if(!slug){missing[key]='error';continue;}if(!groups.has(slug))groups.set(slug,new Map());groups.get(slug)!.set(key,order);}
 if(!current())return;
 if(Object.keys(missing).length)publish(missing);
 for(const [slug,targets] of groups){
  if(!current())return;
  let values:Record<string,number|null|'error'>;
  try{const book=await fetchBook(slug);values=Object.fromEntries([...targets].map(([key,order])=>[key,orderLowest(book,order)]));}
  catch{values=Object.fromEntries([...targets.keys()].map(key=>[key,'error' as const]));}
  if(!current())return;
  publish(values);
 }
}
export function marketWhisper(name:string,order:Row):string{
 const amount=order.perTrade??1,player=order.user?.ingameName;
 if(typeof player!=='string'||!player||/\s/.test(player)||!['sell','buy'].includes(order.type)||!Number.isInteger(amount)||amount<1||amount>order.quantity||!Number.isFinite(order.platinum)||order.platinum<=0)throw Error('报价缺少有效交易信息');
 const item=name.replace(/[\r\n"]/g,' ');
 const details=[order.rank!=null?'rank '+order.rank:null,order.subtype??null,order.charges!=null?order.charges+' charges':null,order.amberStars!=null?order.amberStars+' amber stars':null,order.cyanStars!=null?order.cyanStars+' cyan stars':null].filter(Boolean).join(', ');
 return `/w ${player} Hi! I want to ${order.type==='sell'?'buy':'sell'}:${amount>1?' x'+amount:''} "${item}${details?' ('+details+')':''}" for ${order.platinum} platinum. (warframe.market)`;
}
export function orderUnitPrice(order:Row):number|null{
 const amount=order.perTrade??1;
 return Number.isInteger(amount)&&amount>0&&Number.isFinite(order.platinum)&&order.platinum>0?order.platinum/amount:null;
}
export function ordersValue(rows:Row[],type:string):number|null{
 let total=0;
 for(const row of rows.filter(r=>r.type===type)){
  const unit=orderUnitPrice(row);
  if(unit===null||!Number.isInteger(row.quantity)||row.quantity<0)return null;
  total+=unit*row.quantity;
 }
 return total;
}

export function marketSuggestedPrice(rows:Row[],target:Row,inGameOnly=true):number|''{
 const first=marketTradeQuotes(rows,target,inGameOnly).find(r=>r.type==='sell');
 // The reference panel prefills the displayed order price (platinum), not its sort key.
 return first?Math.max(1,first.platinum):'';
}
/** Reference goodPrice compares displayed order prices after quote sorting. */
export function marketGoodPrices(quotes:Row[]):Set<Row>{
 const firstSell=quotes.find(row=>row.type==='sell');
 return new Set(firstSell?quotes.filter(row=>row.type==='buy'&&row.platinum>=firstSell.platinum):[]);
}

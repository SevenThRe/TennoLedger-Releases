export type RelicMarketItem={id:string;slug:string;subtypes?:string[]};
export type RelicOrder={id:string;type:string;subtype?:string;visible?:boolean;quantity:number;platinum:number;perTrade?:number;user?:{ingameName?:string;status?:string}};
export function relicSubtype(refinement:string){const value=refinement.toLowerCase();if(!['intact','exceptional','flawless','radiant'].includes(value))throw Error('未知精炼等级');return value;}
export function relicOrderBody(item:RelicMarketItem,refinement:string,type:string,price:number,quantity:number,owned:number|null){
 const subtype=relicSubtype(refinement);
 if(!item.id||!['buy','sell'].includes(type)||!item.subtypes?.includes(subtype))throw Error('市场物品不支持该精炼等级');
 if(!Number.isInteger(price)||price<1||price>900000||!Number.isInteger(quantity)||quantity<1||quantity>9999)throw Error('请输入有效价格和数量');
 if(type==='sell'&&(owned===null||quantity>owned))throw Error(owned===null?'该精炼等级库存未知':'出售数量超过该精炼等级库存');
 return {itemId:item.id,type,subtype,platinum:price,quantity,visible:true};
}
/** Resolve sell stock inside the submission lock, immediately before creating the order. */
export async function submitRelicOrder<T>(item:RelicMarketItem,refinement:string,type:string,price:number,quantity:number,
 loadOwned:()=>Promise<number|null>,send:(body:ReturnType<typeof relicOrderBody>)=>Promise<T>):Promise<T>{
 const owned=type==='sell'?await loadOwned():null;
 return send(relicOrderBody(item,refinement,type,price,quantity,owned));
}
export function relicOrders(data:unknown,refinement:string):RelicOrder[]{
 if(!Array.isArray(data))throw Error('市场报价格式变化');
 const subtype=relicSubtype(refinement);
 return data.filter(r=>r&&r.subtype===subtype&&['buy','sell'].includes(r.type)&&r.visible===true&&Number.isInteger(r.quantity)&&r.quantity>0&&Number.isInteger(r.perTrade??1)&&(r.perTrade??1)>0&&(r.perTrade??1)<=r.quantity&&Number.isFinite(r.platinum)&&r.platinum>0&&['online','ingame'].includes(r.user?.status)).sort((a,b)=>a.type===b.type?(a.type==='sell'?a.platinum/(a.perTrade??1)-b.platinum/(b.perTrade??1):b.platinum/(b.perTrade??1)-a.platinum/(a.perTrade??1)):a.type.localeCompare(b.type));
}
export function relicWhisper(base:string,refinement:string,order:RelicOrder){
 const player=order.user?.ingameName,amount=order.perTrade??1;
 if(!player||/[\s\r\n]/.test(player)||!['sell','buy'].includes(order.type)||order.subtype!==relicSubtype(refinement)||!Number.isFinite(order.platinum)||order.platinum<=0||!Number.isInteger(amount)||amount<1||amount>order.quantity)throw Error('报价缺少有效交易信息');
 const name=(base+' Relic').replace(/[\r\n"]/g,' '),tier=refinement[0].toUpperCase()+refinement.slice(1).toLowerCase();
 return `/w ${player} Hi! I want to ${order.type==='sell'?'buy':'sell'}:${amount>1?' x'+amount:''} "${name} (${tier})" for ${order.platinum} platinum. (warframe.market)`;
}

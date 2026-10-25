import type {Riven} from './rivenModel.ts';
export type VeiledMarketItem={id:string;slug:string;maxRank?:number};
export type VeiledOrder={id:string;type:string;visible?:boolean;quantity:number;platinum:number;perTrade?:number;rank?:number;user?:{ingameName?:string;status?:string}};
const titles:Record<string,string>={rifle:'步枪',shotgun:'霰弹枪',pistol:'手枪',melee:'近战',kitgun:'组合枪',zaw:'组合近战',arch:'Archwing','companion weapon':'同伴武器'};
const categoryKey=(value:string|null|undefined)=>(value??'').toLowerCase().replace(/_/g,' ');
export function rivenCategoryMatches(r:Riven,category:string){return category==='all'||categoryKey(r.category)===categoryKey(category);}
export function veiledTitle(r:Riven){const title=titles[categoryKey(r.category)];return title?title+'紫卡':r.name.replace(' Mod','');}
export function veiledWhisper(r:Riven,order:VeiledOrder){
 const player=order.user?.ingameName,amount=order.perTrade??1;
 if(!player||/[\r\n]/.test(player)||!['buy','sell'].includes(order.type)||!Number.isFinite(order.platinum)||order.platinum<=0||!Number.isInteger(amount)||amount<1||amount>order.quantity)throw Error('报价缺少有效交易信息');
 const name=(r.name+' (Veiled)').replace(/[\r\n"]/g,' ');
 return `/w ${player} Hi! I want to ${order.type==='sell'?'buy':'sell'}:${amount>1?' x'+amount:''} "${name}" for ${order.platinum} platinum. (warframe.market)`;
}
export function veiledSlug(r:Riven){return (r.name+' (Veiled)').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');}
export function veiledQuantity(r:Riven,owned:Riven[]){return owned.filter(x=>x.veiled&&veiledSlug(x)===veiledSlug(r)).reduce((n,x)=>n+(x.quantity??1),0);}
export function veiledQuotes(data:unknown):VeiledOrder[]{
 const d=data as {buy?:VeiledOrder[];sell?:VeiledOrder[]};
 const rows=Array.isArray(data)?data:d&&Array.isArray(d.buy)&&Array.isArray(d.sell)?[...d.buy,...d.sell]:null;
 if(!rows)throw Error('市场报价格式变化');
 return rows.filter((r:VeiledOrder)=>r&&['sell','buy'].includes(r.type)&&r.visible!==false&&Number.isInteger(r.quantity)&&r.quantity>0&&Number.isInteger(r.perTrade??1)&&(r.perTrade??1)>0&&(r.perTrade??1)<=r.quantity&&Number.isFinite(r.platinum)&&r.platinum>0&&(r.rank??0)===0&&['ingame','online'].includes(r.user?.status??'')).sort((a,b)=>a.type===b.type?(a.type==='sell'?a.platinum/(a.perTrade??1)-b.platinum/(b.perTrade??1):b.platinum/(b.perTrade??1)-a.platinum/(a.perTrade??1)):a.type.localeCompare(b.type));
}
export function veiledOrder(item:VeiledMarketItem,type:string,price:number,quantity:number,owned:number){
 if(!item.id||!['buy','sell'].includes(type))throw Error('未选择有效市场物品');
 if(!Number.isInteger(price)||price<1||price>900000||!Number.isInteger(quantity)||quantity<1||quantity>9999)throw Error('请输入有效价格和数量');
 if(type==='sell'&&(!Number.isSafeInteger(owned)||owned<0))throw Error('当前紫卡库存数量无效');
 if(type==='sell'&&quantity>owned)throw Error('出售数量超过当前库存');
 return {itemId:item.id,type,platinum:price,quantity,visible:true,...(item.maxRank!==undefined?{rank:0}:{})};
}

export async function submitVeiledOrder<T>(item:VeiledMarketItem,riven:Riven,type:string,price:number,quantity:number,
 loadOwned:()=>Promise<Riven[]>,send:(body:ReturnType<typeof veiledOrder>)=>Promise<T>):Promise<T>{
 const owned=type==='sell'?veiledQuantity(riven,await loadOwned()):0;
 return send(veiledOrder(item,type,price,quantity,owned));
}

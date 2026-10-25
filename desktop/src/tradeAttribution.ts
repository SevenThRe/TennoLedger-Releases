import type {Trade,Exchange} from './api';
import type {AnalyticsCatalogItem} from './analyticsCatalog';
import type {MarketRankingRow} from './marketRankingModel';
import {marketSlug,marketCatalogResolver,marketDisplayName} from './marketModel.ts';
import {exchangeCurrency} from './tradeHistoryModel.ts';
import {rivenTitles} from './rivenPresentation.ts';

// A reference multi-item sale represents one classified transaction. Its full
// price belongs to the first item (or its matched set), never to every component.
export function attributeTrades(trades:readonly Trade[],exchanges:readonly Exchange[],items:readonly AnalyticsCatalogItem[],market:readonly MarketRankingRow[]|null){
 const catalog=new Map(items.map(item=>[item.id,item]));
 const bySlug=new Map((market??[]).map(item=>[item.slug,item]));
 const sets=(market??[]).filter(item=>item.i18n.en?.name?.endsWith(' Set'));
 const resolve=marketCatalogResolver([...items]);
 const projected:Trade[]=[];const unresolved:Exchange[]=[];
 const rivenItem=(id:string):AnalyticsCatalogItem|undefined=>{
  const prefix='/AF_Special/Riven/';if(!id.startsWith(prefix))return undefined;
  const [weaponName,...suffix]=id.slice(prefix.length).split('/');
  if(!weaponName||!suffix.length||suffix.some(part=>!part))return undefined;
  const weapon=items.find(item=>item.name===weaponName);
  const titles=rivenTitles({name:suffix.join(' '),weaponName,veiled:false},weapon);
  return {id,name:[weaponName,...suffix].join(' '),zh:titles.primary,category:'riven',image:weapon?.image,imageUrl:weapon?.imageUrl};
 };
 const classify=(trade:Trade,multiple:boolean):Trade=>{
  const riven=rivenItem(trade.itemId);
  if(riven){catalog.set(riven.id,riven);return {...trade,name:riven.name,category:'riven'};}
  const local=catalog.get(trade.itemId),name=local?.name??trade.name;
  const set=multiple?sets.find(item=>name.includes(item.i18n.en!.name!.replace(' Set',''))):undefined;
  const match=set??bySlug.get(marketSlug(name));
  if(!match)return trade;
  const id='market:'+match.slug,base=resolve(match);
  catalog.set(id,{id,marketSlug:match.slug,name:match.i18n.en?.name??name,zh:marketDisplayName(match,base,'zh-CN'),category:set?'set':local?.category??trade.category,image:base?.image,imageUrl:match.i18n.en?.thumb?'https://warframe.market/static/assets/'+match.i18n.en.thumb:base?.imageUrl});
  return {...trade,itemId:id,name:match.i18n.en?.name??name,category:set?'set':trade.category};
 };
 for(const trade of trades)projected.push(classify(trade,false));
 for(const exchange of exchanges){
  const first=exchange.referenceItem;
  const riven=first?rivenItem(first.itemId):undefined;
  if(riven)catalog.set(riven.id,riven);
  if((market===null&&!riven)||exchange.kind==='exchange'||!first||!catalog.has(first.itemId)){unresolved.push(exchange);continue;}
  const local=catalog.get(first.itemId)!;
  projected.push(classify({id:exchange.id,ts:exchange.ts,partner:exchange.partner,itemId:first.itemId,name:local.name,quantity:first.quantity,platinum:exchangeCurrency(exchange,exchange.kind==='sale'?'received':'sent'),side:exchange.kind,category:''},true));
 }
 return {trades:projected,unresolved,catalog};
}

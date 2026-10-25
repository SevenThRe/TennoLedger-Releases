import {useEffect,useState} from 'react';
import {native} from './api';
import {rewardQuote,cachedRewardQuote,type Quote} from './priceService';
import {loadVeiledPrices} from './veiledPrices';
import {useTranslation} from 'react-i18next';
import {rivenChallengeText} from './rivenChallengeLocalization';
import type {Riven} from './rivenModel';
const clean=(s:string)=>s.replace(/<[^>]*>/g,'');
import {veiledTitle,veiledSlug,veiledQuotes} from './veiledTradeModel';
export default function VeiledRivens({rivens,onTrade,platform='pc',qa=false}:{rivens:Riven[];onTrade:(r:Riven)=>void;platform?:string;qa?:boolean}){
 const {i18n}=useTranslation();
 const [prices,setPrices]=useState<{platform:string;values:Record<string,Quote|null>}>({platform:'',values:{}});
 const slugKey=JSON.stringify([...new Set(rivens.map(veiledSlug))].sort());
 useEffect(()=>{
  let live=true;
  const slugs:string[]=JSON.parse(slugKey);
  const values:Record<string,Quote|null>={};
  if(native)for(const slug of slugs)values[slug]=cachedRewardQuote(slug,platform);
  setPrices({platform,values});
  if(native||qa)void loadVeiledPrices(slugs,async slug=>{
   if(native)return rewardQuote(slug,platform);
   const response=await fetch('/qa/rivens.json');if(!response.ok)throw Error('演示报价未加载');
   const fixture=await response.json();
   const first=fixture.marketItems?.some((item:{slug:string})=>item.slug===slug)?veiledQuotes(fixture.marketOrders).find(q=>q.type==='sell')??null:null;
   const price=first?first.platinum/(first.perTrade??1):null;
   return {price,fetchedAt:new Date().toISOString(),stale:false};
  },()=>live,(slug,quote)=>setPrices(previous=>({platform,values:{...previous.values,[slug]:quote}})));
  return()=>{live=false;};
 },[slugKey,platform,qa]);
 const priceFor=(r:Riven)=>{const quote=prices.platform===platform?prices.values[veiledSlug(r)]:null;return <span className="veiledTradePrice" title={quote?.stale?'上次缓存报价（刷新失败）':quote?.price!=null?'在线最低出售报价':'暂无报价'}>{quote?.price!=null&&quote.price>0?Number(quote.price.toFixed(2)):'—'}{quote?.stale?'*':''}<img src="/reference/ui/platinum.png" alt="白金"/></span>;};
 const display=(r:Riven)=>r.challenge?rivenChallengeText(r.challenge,i18n.language):undefined;
 const groups=new Map<string,{name:string;items:Riven[]}>();
 for(const r of rivens){const id=r.challenge?.id??'unknown';const group=groups.get(id)??{name:clean(display(r)?.group??'挑战资料未读取'),items:[]};group.items.push(r);groups.set(id,group);}
 return <div className="veiledGroups">{[...groups].map(([id,group])=><section className="veiledGroup" key={id}><h3>{group.name}</h3><div className="rivenGrid">{group.items.map(r=><article className="veiledCard" key={r.id}><h4>{veiledTitle(r)}</h4><p>{clean(display(r)?.description??'请更新库存以读取挑战')}</p><footer><span>{r.challenge?.required!=null?`${r.challenge.progress??'—'}/${r.challenge.required}`:`×${r.quantity??1}`}</span><button onClick={()=>onTrade(r)}><span>交易</span>{priceFor(r)}</button></footer></article>)}</div></section>)}</div>;
}

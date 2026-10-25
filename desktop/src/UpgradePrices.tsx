import {useEffect,useRef,useState} from 'react';
import {native} from './api';
import {useMarketSession} from './MarketAccount';
import {openInventoryTrade} from './inventoryTrade';
import {loadUpgradeBook,rankQuotes,validUpgradeRank,type UpgradeBook} from './upgradeQuotes';
export type UpgradePricesProps={itemId:string;marketSlug?:string|null;name:string;englishName:string;rank:number|null;maxRank?:number|null;en:boolean;platform?:string};
export default function UpgradePrices({itemId,marketSlug,name,englishName,rank,maxRank,en,platform}:UpgradePricesProps){
 const session=useMarketSession(),effectivePlatform=platform??session.platform??'pc';
 const root=useRef<HTMLDivElement>(null),[visible,setVisible]=useState(false),[result,setResult]=useState<UpgradeBook|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false);
 const valid=!!marketSlug&&validUpgradeRank(rank,maxRank),key=JSON.stringify([marketSlug,effectivePlatform,rank]);
 useEffect(()=>{const node=root.current;if(!node)return;const observer=new IntersectionObserver(entries=>setVisible(entries.some(entry=>entry.isIntersecting)),{threshold:0});observer.observe(node);return()=>observer.disconnect();},[]);
 useEffect(()=>{setResult(null);setError('');setLoading(false);if(!visible||!valid||!marketSlug||!native)return;let live=true;setLoading(true);void loadUpgradeBook(marketSlug,effectivePlatform).then(book=>{if(live)setResult(book);}).catch(error=>{if(live)setError(String(error));}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};},[key,visible,valid]);
 const current=result&&result.slug===marketSlug&&result.platform===effectivePlatform?result:null,prices=rankQuotes(current?.orders??[],rank);
 const status=!valid?(en?'Exact rank or market identity unavailable':'等级或市场标识待核实'):!native?(en?'Open desktop app for quotes':'请在桌面程序读取报价'):error||(loading?(en?'Loading quotes…':'读取报价…'):current?(en?'Fetched ':'获取于 ')+new Date(current.fetchedAt).toLocaleString(en?'en':'zh-CN'):(en?'Quotes load when visible':'可见时读取报价'));
 return <div ref={root} className="upgradePrices inventoryCardFooter" data-item-id={itemId} data-rank={rank??undefined} title={`${effectivePlatform.toUpperCase()} · ${en?'Rank':'等级'} ${rank??'—'}/${maxRank??'—'} · ${status}`}><div className="inventoryCardValues"><div className="inventoryUnitQuote"><span>{en?'Price each':'单件价格'}</span><strong>{loading?'…':prices.sell??'—'}<img src="/reference/ui/platinum.png" alt={en?'Platinum':'白金'}/></strong></div>{error&&<span role="status" className="inventoryQuoteError">{en?'Price unavailable':'报价不可用'}</span>}</div>{valid&&<button type="button" className="inventoryTradeButton" title={en?'View sell orders (WTS), price per item':'查看卖单，单件价格'} onClick={()=>openInventoryTrade({id:itemId,slug:marketSlug!,name,englishName,rank:rank!,platform:effectivePlatform})}>{en?'Trade':'交易'}<svg viewBox="0 0 24 24"><path d="m9 5 7 7-7 7"/></svg></button>}</div>;
}

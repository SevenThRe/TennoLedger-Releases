import MarketIcon from './MarketIcon';
import AnalyticsPagination from './AnalyticsPagination';
import AnalyticsUnit from './AnalyticsUnit';
import {analyticsNumber,analyticsNumberTitle} from './analyticsNumber';
import {useEffect,useMemo,useState} from 'react';
import {useTranslation} from 'react-i18next';
import type {Trade} from './api';
import {tradePartners,type PartnerOrder} from './tradePartnerModel';
import {searchText} from './searchText';
const columns:PartnerOrder[]=['saleCount','saleValue','purchaseCount','purchaseValue','totalCount','totalValue'];
const labels={saleCount:['卖出笔数','Sales count'],saleValue:['卖出白金','Sales value'],purchaseCount:['买入笔数','Purchases count'],purchaseValue:['买入白金','Purchases value'],totalCount:['总笔数','Total count'],totalValue:['总白金','Total value']};
export default function TradePartners({trades,resetKey}:{resetKey?:string;trades:readonly Trade[]}){
 const {i18n}=useTranslation(),zh=i18n.language.startsWith('zh');
 const [order,setOrder]=useState<PartnerOrder>('totalValue'),[query,setQuery]=useState(''),[page,setPage]=useState(1);
 useEffect(()=>{setQuery('');setPage(1);},[resetKey]);
 const rows=useMemo(()=>tradePartners(trades,order).filter(row=>searchText(query,row.name)),[trades,order,query]);
 useEffect(()=>setPage(1),[trades,order,query]);
 return <section className="analyticsPanel analyticsRanking" aria-label={zh?'交易伙伴排行':'Trading partners'}><div className="analyticsSectionHeading"><div><h3>{zh?'交易伙伴':'Trading partners'}</h3><p>{zh?'已记录的交易与白金往来':'Recorded trades and platinum exchanged'}</p></div><div className="analyticsRankingTools"><label className="analyticsSearch"><MarketIcon name="search"/><input type="search" aria-label={zh?'搜索交易伙伴':'Search trading partners'} placeholder={zh?'搜索':'Search'} value={query} onChange={e=>setQuery(e.target.value)}/></label><label className="analyticsOrdering"><span>{zh?'排序':'Sort by'}</span><img src="/reference/ui/ordering.png" alt=""/><select value={order} onChange={e=>setOrder(e.target.value as PartnerOrder)}>{(['totalValue','totalCount','saleValue','saleCount','purchaseValue','purchaseCount'] as PartnerOrder[]).map(key=><option key={key} value={key}>{labels[key][zh?0:1]}</option>)}</select></label></div></div><div className="analyticsRankingScope"><span>{zh?'前50位伙伴，搜索当前排行':'Top 50 partners, Search within this ranking'}</span></div><div className="analyticsTableWrap"><table className="analyticsTable partners"><colgroup><col className="analyticsNameColumn"/><col/><col/><col/></colgroup><thead><tr><th>{zh?'玩家':'Player'}</th>{['sale','purchase','total'].map((key,i)=><th key={key}>{(zh?['卖出','买入','总计']:['Sales','Purchases','Total'])[i]}<small className="analyticsColumnDetail">{zh?'白金 / 笔数':'Platinum / trades'}</small></th>)}</tr></thead><tbody>{rows.slice((page-1)*10,page*10).map((row,index)=><tr key={row.name}><td><div className="analyticsIdentity"><span className="analyticsRank">{(page-1)*10+index+1}</span><span className="analyticsItemName" title={row.name}>{row.name}</span></div></td>{(['sale','purchase','total'] as const).map(key=><td key={key}><span className="analyticsAmount" title={analyticsNumberTitle(row[(key+'Value') as keyof typeof row] as number,i18n.language)}>{analyticsNumber(row[(key+'Value') as keyof typeof row] as number)}<AnalyticsUnit zh={zh}/></span><small className="analyticsTradeCount">{analyticsNumber(row[(key+'Count') as keyof typeof row] as number)} {zh?'笔交易':'trades'}</small></td>)}</tr>)}</tbody></table></div>{!rows.length&&<div className="analyticsTableEmpty">{zh?'没有匹配的交易伙伴':'No matching trading partners'}</div>}<AnalyticsPagination page={page} total={rows.length} onPage={setPage}/></section>;
}

import {rivenAttributeName} from './rivenLocalization';
import {useTranslation} from 'react-i18next';
import type {Auction,Riven} from './rivenModel';
import {fromAuction,formatAttribute} from './rivenModel';
import {matchingRivenTrait} from './rivenComparisonModel';

export default function RivenComparables({auctions,target,names,units,onOpen}:{auctions:Auction[];target:Riven;names:Record<string,string>;units:Record<string,string>;onOpen:(r:Riven)=>void}) {
 const {i18n}=useTranslation(),en=i18n.language.startsWith('en');
 return <div className="rivenComparableGrid">{auctions.map(auction=>{
  const riven=fromAuction(auction,names);
  return <button className="rivenComparable" key={auction.id} onClick={()=>onOpen(riven)} aria-label={`${en?'Open listing':'查看挂牌'} ${riven.name} ${auction.buyout_price??auction.starting_price} ${en?'platinum':'白金'}`}>
   <div className="rivenComparableHeader"><span title="Warframe Market">WFM</span><b>{auction.buyout_price??auction.starting_price} {en?'platinum':'白金'}</b></div>
   <div className="rivenComparableTraits">{riven.attributes.map(a=><span key={a.slug} className={(a.positive?'positive':'negative')+(matchingRivenTrait(target,a.slug,a.positive)?'':' notMatching')}>{formatAttribute(a,units[a.slug])} {rivenAttributeName(a.slug,a.name,i18n.language)}</span>)}</div>
   <small>{auction.buyout_price==null?(en?'Starting bid':'竞拍起价'):(en?'Buyout':'一口价')} · MR {riven.masteryLevel} · {en?'Rerolls':'洗练'} {riven.rerolls}</small>
  </button>;
 })}</div>;
}

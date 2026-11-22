import {useEffect,useMemo,useRef,useState} from 'react';
import {useTranslation} from 'react-i18next';
import {native} from './api';
import {
 BellIcon,
 ClockIcon,
 Cross2Icon,
 MagnifyingGlassIcon,
 MixerHorizontalIcon,
 TrashIcon,
} from './arbitrationIcons';
import ThemeSelect from './ThemeSelect';
import {useCollectionSnapshot} from './useCollectionSnapshot';
import {
 BOUNTY_SYNDICATE_ORDER,
 bountyRotationProgress,
 bountyTierVisual,
 buildBountyPriceIndex,
 buildCatalogRewardRows,
 catalogDecksForRotation,
 cleanBountyTitle,
 cleanChallengeDesc,
 collectBountyWarmupSlugs,
 extractHubFeaturedRewards,
 extractNarmerHighlights,
 filterCatalogRewardRows,
 findMatchingSubscription,
 formatPlatinum,
 formatPlatinumNumber,
 groupRewardsByRarity,
 isBountyActive,
 pickOverviewJobs,
 rarityLabel,
 rarityShortLabel,
 resolveBountyItemPrice,
 resolveBountyRewardIcon,
 sortCatalogRewardRows,
 syndicateIconPath,
 syndicateLabel,
 tierLabel,
 type BountyFeaturedReward,
 type BountyItemPrice,
 type BountyJob,
 type BountyRarity,
 type BountyRarityFilter,
 type BountyReward,
 type BountyRotation,
 type BountySortMode,
 type BountySubscription,
 type BountySubscriptionTarget,
 type BountySyndicate,
} from './bountyModel';
import {useBounties,useBountyPriceRows} from './useBounties';
import {warmMarketPrices} from './useMarketPrices';
import {countdown,missionZh,notificationStateHint,rewardOwned} from './worldModel';
import './bounties.css';

type BountyView='active'|'subscriptions';

function SpeakerIcon(){
 return (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
   <path d="M11 5 6 9H2v6h4l5 4V5Z"/>
   <path d="M15.5 8.5a5 5 0 0 1 0 7"/>
   <path d="M18.5 5.5a9.5 9.5 0 0 1 0 13"/>
  </svg>
 );
}

function MissionTypeIcon({type}:{type:string|null}){
 const key=(type??'').toLowerCase();
 if(key.includes('exterminat')){
  return (
   <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
    <path d="M3 13 13 3M10 3h3v3M3 3l10 10M3 10v3h3"/>
   </svg>
  );
 }
 if(key.includes('defense')||key.includes('defend')){
  return (
   <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M8 2 13 4v4c0 3-2 5-5 6-3-1-5-3-5-6V4l5-2Z"/>
   </svg>
  );
 }
 if(key.includes('alchemy')){
  return (
   <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 2h4M7 2v4l-3.5 6A1.5 1.5 0 0 0 4.8 14h6.4a1.5 1.5 0 0 0 1.3-2L9 6V2"/>
   </svg>
  );
 }
 if(key.includes('survival')||key.includes('disrupt')){
  return (
   <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 2 4 9h4l-1 5 5-7H8l1-5Z"/>
   </svg>
  );
 }
 if(key.includes('spy')||key.includes('capture')){
  return (
   <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
    <path d="M2 8s2.4-4 6-4 6 4 6 4-2.4 4-6 4-6-4-6-4Z"/>
    <circle cx="8" cy="8" r="1.6"/>
   </svg>
  );
 }
 if(key.includes('assassinat')){
  return (
   <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
    <circle cx="8" cy="8" r="5"/>
    <path d="M8 1.5v3M8 11.5v3M1.5 8h3M11.5 8h3"/>
   </svg>
  );
 }
 return (
  <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true">
   <path d="M8 2 14 8 8 14 2 8 8 2Z"/>
  </svg>
 );
}

function formatRewardName(reward:Pick<BountyReward,'zh'|'en'|'quantity'|'category'>,en:boolean):string{
 const base=en?reward.en:reward.zh;
 if(reward.category==='endo'||reward.category==='credits'||reward.quantity<=1)return base;
 return `${base} ×${reward.quantity.toLocaleString()}`;
}

function formatInlineChipName(reward:Pick<BountyReward,'zh'|'en'|'quantity'>,en:boolean):string{
 const name=en?reward.en:reward.zh;
 if((reward.zh.includes('债券')||reward.en.includes('Debt-Bond'))&&reward.quantity>1){
  return `${reward.quantity}× ${name}`;
 }
 return name;
}

function formatChance(chance:number):string{
 return `${chance.toFixed(chance%1===0?0:chance*10%1===0?1:2)}%`;
}

function formatPriceTooltip(
 price:BountyItemPrice,
 quantity:number,
 live:boolean,
 en:boolean,
):string{
 const L=(zh:string,eng:string)=>en?eng:zh;
 if(price.state==='priced'&&price.unitPrice!==null&&price.totalPrice!==null){
  const parts=[L(`warframe.market 卖单中位价 ${formatPlatinum(price.unitPrice)}`,`warframe.market sell median ${formatPlatinum(price.unitPrice)}`)];
  if(quantity>1){
   parts.push(`×${quantity} = ${formatPlatinum(price.totalPrice)}`);
  }
  if(price.sampleCount!==null){
   parts.push(`${price.sampleCount} ${L('笔在线卖单','online offers')}`);
  }
  if(price.stale){
   parts.push(L('缓存待刷新','Cached, refreshing'));
  }
  return parts.join(' · ');
 }
 if(price.state==='no-orders')return L('暂无在线卖单','No online sell orders');
 if(price.state==='error'){
  return price.error
   ?`${L('行情读取失败','Price fetch failed')} · ${price.error}`
   :L('行情读取失败','Price fetch failed');
 }
 return live?L('行情获取中','Fetching price'):L('桌面端实时获取行情','Live prices in desktop app');
}

function BountyPriceBadge({
 price,
 quantity=1,
 live,
 en,
 compact=false,
}:{
 price:BountyItemPrice;
 quantity?:number;
 live:boolean;
 en:boolean;
 compact?:boolean;
}){
 if(price.state==='untradable')return null;
 const title=formatPriceTooltip(price,quantity,live,en);
 if(compact){
  if(price.state!=='priced'||price.totalPrice===null)return null;
  return (
   <span className="bountyChipPrice" title={title}>
    {formatPlatinum(price.totalPrice)}
   </span>
  );
 }
 if(price.state==='priced'&&price.totalPrice!==null){
  return (
   <span className={'bountyPriceBadge priced'+(price.stale?' stale':'')} title={title}>
    <img src="/reference/ui/platinum.png" alt=""/>
    <span>{formatPlatinumNumber(price.totalPrice)}</span>
   </span>
  );
 }
 return (
  <span className="bountyPriceBadge unpriced" title={title}>
   —
  </span>
 );
}

function levelBadgeTone(job:Pick<BountyJob,'isSteelPath'|'isNarmer'>):string{
 if(job.isSteelPath)return 'sp';
 if(job.isNarmer)return 'narmer';
 return 'std';
}

function pickTierPreviewRewards(rewards:readonly BountyReward[]):BountyReward[]{
 const ordered=[
  ...rewards.filter(r=>r.rarity==='rare'),
  ...rewards.filter(r=>r.rarity==='uncommon'),
  ...rewards.filter(r=>r.rarity==='common'),
 ];
 const out:BountyReward[]=[];
 const seen=new Set<string>();
 for(const reward of ordered){
  if(seen.has(reward.itemId))continue;
  seen.add(reward.itemId);
  out.push(reward);
  if(out.length>=3)break;
 }
 return out;
}

function TierMedal({
 job,
}:{
 job:Pick<BountyJob,'tierKey'|'tierIndex'|'isSteelPath'|'isNarmer'|'isVault'>;
}){
 const visual=bountyTierVisual(job);
 return (
  <span className={`bountyTierMedal ${visual.tone}`} aria-hidden="true">
   {visual.icon?<img src={visual.icon} alt=""/>:<span>{visual.badge}</span>}
  </span>
 );
}

function RewardThumb({
 reward,
 itemIcons,
 size='md',
 title,
}:{
 reward:Pick<BountyReward,'itemId'|'en'|'category'|'rarity'>;
 itemIcons:Readonly<Record<string,string>>;
 size?:'xs'|'sm'|'md';
 title?:string;
}){
 const icon=resolveBountyRewardIcon(reward,itemIcons);
 return (
  <span className={`bountyLootThumb ${reward.rarity} ${size}`} title={title}>
   <img
    src={icon.src}
    className={icon.isModCard?'modCard':undefined}
    alt=""
    loading="lazy"
    onError={e=>{
     if(e.currentTarget.dataset.fb)return;
     e.currentTarget.dataset.fb='1';
     e.currentTarget.src='/reference/ui/ingredient.png';
    }}
   />
  </span>
 );
}

export default function Bounties({
 view,
 onView,
 onSettings,
}:{
 view:BountyView;
 onView:(next:BountyView)=>void;
 onSettings:()=>void;
}){
 const {i18n}=useTranslation();
 const en=i18n.language.startsWith('en');
 const L=(zh:string,eng:string)=>en?eng:zh;
 const b=useBounties();
 const bountyPrices=useBountyPriceRows();
 const snapshot=useCollectionSnapshot();
 const scrollRef=useRef<HTMLDivElement>(null);
 const warmedAtRef=useRef<Map<string,number>>(new Map());

 const [selectedHub,setSelectedHub]=useState<string|null>(null);
 const [rotationView,setRotationView]=useState<'live'|BountyRotation>('live');
 const [selectedTierKey,setSelectedTierKey]=useState<string>('');
 const [controlsOpen,setControlsOpen]=useState(false);
 const [testNoticeText,setTestNoticeText]=useState<string>('');
 const [soundFeedback,setSoundFeedback]=useState<string>('');
 const [showAllExplorer,setShowAllExplorer]=useState(false);

 const [filterQuery,setFilterQuery]=useState('');
 const [filterSyndicate,setFilterSyndicate]=useState<string>('all');
 const [filterTier,setFilterTier]=useState<string>('all');
 const [filterRarity,setFilterRarity]=useState<BountyRarityFilter>('all');
 const [filterAvailability,setFilterAvailability]=useState<'all'|'active'|'waiting'>('all');
 const [filterTradableOnly,setFilterTradableOnly]=useState(false);
 const [explorerSort,setExplorerSort]=useState<BountySortMode>('default');

 useEffect(()=>{
  scrollRef.current?.scrollTo(0,0);
 },[view,selectedHub]);

 const displaySyndicates=useMemo<BountySyndicate[]>(()=>{
  return BOUNTY_SYNDICATE_ORDER.map(tag=>{
   const liveSyn=b.bounties.find(s=>s.tag===tag);
   const catSyn=b.catalog?.syndicates.find(s=>s.tag===tag);
   if(rotationView==='live'||!catSyn?.rotatesRewards||!b.catalog){
    return liveSyn??{
     tag,
     nameZh:catSyn?.nameZh??tag,
     nameEn:catSyn?.nameEn??tag,
     hubZh:catSyn?.hubZh??tag,
     hubEn:catSyn?.hubEn??tag,
     rotatesRewards:catSyn?.rotatesRewards??false,
     rotation:null,
     vaultRotation:null,
     activation:'',
     expiry:'',
     jobs:[],
    };
   }
   const decks=catalogDecksForRotation(b.catalog,tag,rotationView);
   const previewJobs:BountyJob[]=decks.map(deck=>({
    id:`preview:${tag}:${deck.tierKey}:${rotationView}`,
    syndicate:tag,
    jobType:'',
    titleZh:deck.tierLabelZh,
    titleEn:deck.tierLabelEn,
    tierKey:deck.tierKey,
    tierIndex:deck.tierIndex,
    tierLabelZh:deck.tierLabelZh,
    tierLabelEn:deck.tierLabelEn,
    minLevel:deck.minLevel,
    maxLevel:deck.maxLevel,
    masteryReq:0,
    standingStages:deck.standingStages,
    standingTotal:deck.standingStages.reduce((sum,v)=>sum+v,0),
    rewardDeck:'',
    rotation:rotationView,
    isSteelPath:deck.isSteelPath,
    isNarmer:deck.isNarmer,
    isVault:deck.isVault,
    isEndless:deck.isEndless,
    nodeId:null,
    nodeZh:null,
    nodeEn:null,
    missionType:null,
    challengeId:null,
    challengeZh:null,
    challengeEn:null,
    allyZh:null,
    allyEn:null,
    activation:liveSyn?.activation??'',
    expiry:liveSyn?.expiry??'',
    rewards:deck.rewards,
   }));
   return {
    tag,
    nameZh:liveSyn?.nameZh??catSyn.nameZh,
    nameEn:liveSyn?.nameEn??catSyn.nameEn,
    hubZh:liveSyn?.hubZh??catSyn.hubZh,
    hubEn:liveSyn?.hubEn??catSyn.hubEn,
    rotatesRewards:catSyn.rotatesRewards,
    rotation:liveSyn?.rotation??null,
    vaultRotation:liveSyn?.vaultRotation??null,
    activation:liveSyn?.activation??'',
    expiry:liveSyn?.expiry??'',
    jobs:previewJobs,
   };
  });
 },[b.bounties,b.catalog,rotationView]);

 const primaryRotatingSyn=useMemo(
  ()=>b.bounties.find(s=>s.rotatesRewards&&s.jobs.length>0)??b.bounties[0]??null,
  [b.bounties],
 );

 const activeSyndicate=useMemo(
  ()=>(selectedHub?b.bounties.find(s=>s.tag===selectedHub):primaryRotatingSyn)??null,
  [b.bounties,selectedHub,primaryRotatingSyn],
 );

 const selectedDisplaySyn=useMemo(
  ()=>(selectedHub?displaySyndicates.find(s=>s.tag===selectedHub):null)??null,
  [displaySyndicates,selectedHub],
 );

 const catalogSyndicate=useMemo(
  ()=>(selectedHub?b.catalog?.syndicates.find(s=>s.tag===selectedHub):b.catalog?.syndicates.find(s=>s.rotatesRewards))??null,
  [b.catalog,selectedHub],
 );

 const priceIndex=useMemo(
  ()=>buildBountyPriceIndex(bountyPrices.rows),
  [bountyPrices.rows],
 );

 const allCatalogRows=useMemo(
  ()=>b.catalog?buildCatalogRewardRows(b.catalog,b.bounties,b.now):[],
  [b.catalog,b.bounties,b.now],
 );

 const filteredExplorerRows=useMemo(()=>{
  const filtered=filterCatalogRewardRows(allCatalogRows,{
   query:filterQuery,
   syndicate:filterSyndicate,
   tierKey:filterTier,
   rarity:filterRarity,
   availability:filterAvailability,
   tradableOnly:filterTradableOnly,
  },priceIndex);
  return sortCatalogRewardRows(filtered,explorerSort,priceIndex);
 },[allCatalogRows,filterQuery,filterSyndicate,filterTier,filterRarity,filterAvailability,filterTradableOnly,explorerSort,priceIndex]);

 const explorerPriceStats=useMemo(()=>{
  if(explorerSort==='default')return null;
  let tradable=0;
  let priced=0;
  for(const row of filteredExplorerRows){
   const state=resolveBountyItemPrice(row,priceIndex).state;
   if(state!=='untradable'){
    tradable++;
    if(state==='priced')priced++;
   }
  }
  return {tradable,priced};
 },[explorerSort,filteredExplorerRows,priceIndex]);

 const itemRotationsMap=useMemo(()=>{
  const map=new Map<string,BountyRotation[]>();
  for(const row of allCatalogRows){
   map.set(`${row.syndicate}|${row.tierKey}|${row.rarity}|${row.itemId}`,row.rotations);
  }
  return map;
 },[allCatalogRows]);

 const displayedJobs=selectedDisplaySyn?.jobs??[];
 const isInspectingInactiveRotation=rotationView!=='live'&&rotationView!==activeSyndicate?.rotation;

 const selectedJob=useMemo(
  ()=>displayedJobs.find(j=>j.tierKey===selectedTierKey)??displayedJobs[0]??null,
  [displayedJobs,selectedTierKey],
 );

 const narmerHighlight=useMemo(
  ()=>extractNarmerHighlights(displaySyndicates),
  [displaySyndicates],
 );

 useEffect(()=>{
  if(!native||bountyPrices.rows.length===0)return;
  const candidates:Pick<BountyReward,'itemId'|'en'>[]=[];
  if(view==='active'){
   if(selectedJob){
    candidates.push(...selectedJob.rewards);
    for(const job of selectedDisplaySyn?.jobs??[]){
     if(job.id!==selectedJob.id)candidates.push(...job.rewards);
    }
   }else{
    if(narmerHighlight){
     candidates.push(...narmerHighlight.items.map(item=>item.reward));
    }
    for(const syn of displaySyndicates){
     const featured=extractHubFeaturedRewards(syn);
     candidates.push(...featured.items.map(item=>item.reward));
    }
    for(const syn of displaySyndicates){
     for(const job of syn.jobs)candidates.push(...job.rewards);
    }
   }
  }else{
   for(const sub of b.preferences.subscriptions){
    if(sub.itemId){
     candidates.push({itemId:sub.itemId,en:sub.itemNameEn??''});
    }
   }
   candidates.push(...filteredExplorerRows);
  }
  const limit=view==='active'?48:(explorerSort==='default'?60:172);
  const rawSlugs=collectBountyWarmupSlugs(candidates,priceIndex,limit);
  const nowMs=Date.now();
  const toWarm=rawSlugs.filter(slug=>{
   const prev=warmedAtRef.current.get(slug);
   return prev===undefined||nowMs-prev>=600_000;
  });
  if(!toWarm.length)return;
  for(const slug of toWarm){
   warmedAtRef.current.set(slug,nowMs);
  }
  void warmMarketPrices(toWarm,'pc').catch(()=>{});
 },[
  view,
  bountyPrices.rows.length,
  priceIndex,
  selectedJob,
  selectedDisplaySyn,
  narmerHighlight,
  displaySyndicates,
  b.preferences.subscriptions,
  filteredExplorerRows,
  explorerSort,
 ]);

 const bountyNotifications=useMemo(
  ()=>b.status.notifications.filter(n=>n.kind==='bounty').slice(0,10),
  [b.status.notifications],
 );

 const cycleLive=activeSyndicate?isBountyActive(activeSyndicate.activation,activeSyndicate.expiry,b.now):false;
 const cycleProgress=activeSyndicate?bountyRotationProgress(activeSyndicate.activation,activeSyndicate.expiry,b.now):0;

 const availableTiers=useMemo(()=>{
  const seen=new Map<string,{key:string;index:number}>();
  for(const row of allCatalogRows){
   if(filterSyndicate!=='all'&&row.syndicate!==filterSyndicate)continue;
   if(!seen.has(row.tierKey)){
    seen.set(row.tierKey,{key:row.tierKey,index:row.tierIndex});
   }
  }
  return [...seen.values()].sort((a,c)=>a.index-c.index);
 },[allCatalogRows,filterSyndicate]);

 function drillToHub(tag:string,tierKey=''){
  setSelectedHub(tag);
  setSelectedTierKey(tierKey);
  onView('active');
 }

 function isTracked(target:BountySubscriptionTarget):BountySubscription|undefined{
  return findMatchingSubscription(b.preferences.subscriptions,target);
 }

 function featuredTarget(entry:BountyFeaturedReward):BountySubscriptionTarget{
  return {
   syndicate:entry.syndicate,
   tierKey:entry.tierKey,
   rarity:entry.reward.rarity,
   itemId:entry.reward.itemId,
   itemNameZh:entry.reward.zh,
   itemNameEn:entry.reward.en,
  };
 }

 function isItemHit(syndicate:string,tierKey:string,reward:BountyReward):boolean{
  return b.activeMatches.some(
   m=>m.syndicate.tag===syndicate&&m.job.tierKey===tierKey&&m.matchedRewards.some(r=>r.itemId===reward.itemId&&r.rarity===reward.rarity),
  );
 }

 function tierHasAnyRule(job:BountyJob):boolean{
  return b.preferences.subscriptions.some(sub=>
   sub.enabled
   &&(sub.syndicate==='all'||sub.syndicate===job.syndicate)
   &&(sub.tierKey==='all'||sub.tierKey===job.tierKey),
  );
 }

 async function handleTestBounty(){
  setTestNoticeText('');
  setSoundFeedback('');
  const notice=await b.testBountyAlert();
  if(notice){
   setTestNoticeText(
    notice.deliveryError||
     notificationStateHint(notice.systemState,en)||
     L('已发送测试提醒','Test alert sent'),
   );
  }
 }

 async function handlePreviewSound(){
  setTestNoticeText('');
  const ok=await b.previewSound();
  setSoundFeedback(ok?L('已播放提示音','Sound played'):L('当前环境音频不可用','Audio unavailable'));
 }

 function resetExplorerFilters(){
  setFilterQuery('');
  setFilterSyndicate('all');
  setFilterTier('all');
  setFilterRarity('all');
  setFilterAvailability('all');
  setFilterTradableOnly(false);
  setExplorerSort('default');
  setShowAllExplorer(false);
 }

 function describeSubscription(sub:BountySubscription):{title:string;path:string;rotHint:string}{
  const synName=syndicateLabel(sub.syndicate,b.catalog,en);
  const tierName=tierLabel(sub.tierKey,en);
  const rarName=rarityLabel(sub.rarity,en);
  const title=sub.itemId
   ?(en?sub.itemNameEn||sub.itemNameZh||sub.itemId:sub.itemNameZh||sub.itemNameEn||sub.itemId)
   :sub.rarity!=='all'
    ?`${tierName} · ${rarName}`
    :sub.tierKey!=='all'
     ?tierName
     :synName;
  const parts=[synName,tierName,rarName];
  if(sub.missionType)parts.push(en?sub.missionType:missionZh[sub.missionType]??sub.missionType);
  if(sub.challengeId&&b.catalog?.challenges[sub.challengeId]){
   const ch=b.catalog.challenges[sub.challengeId];
   parts.push(en?ch.en:ch.zh);
  }
  let rotHint='';
  if(sub.itemId&&sub.syndicate!=='all'&&sub.tierKey!=='all'&&sub.rarity!=='all'){
   const rots=itemRotationsMap.get(`${sub.syndicate}|${sub.tierKey}|${sub.rarity}|${sub.itemId}`);
   if(rots?.length){
    rotHint=en?`Table ${rots.join(' / ')}`:`表 ${rots.join(' / ')}`;
   }
  }
  return {title,path:parts.join(' · '),rotHint};
 }

 function subscriptionMatchCount(subId:string):number{
  return b.activeMatches.filter(m=>m.subscription.id===subId).length;
 }

 const tierRuleTarget:BountySubscriptionTarget={
  syndicate:filterSyndicate,
  tierKey:filterTier,
  rarity:filterRarity,
  itemId:null,
 };
 const tierRuleSaved=isTracked(tierRuleTarget);

 const sourceBountyCycle=b.status.sources.find(s=>s.id==='bounty-cycle');
 const worldSource=b.status.sources.find(s=>s.id==='official');
 const syncError=b.error||b.status.error||sourceBountyCycle?.error||'';
 const visibleExplorerRows=showAllExplorer?filteredExplorerRows:filteredExplorerRows.slice(0,120);

 const selectedTierTarget:BountySubscriptionTarget|null=selectedJob?{
  syndicate:selectedJob.syndicate,
  tierKey:selectedJob.tierKey,
  rarity:'all',
  itemId:null,
  missionType:selectedJob.missionType,
  challengeId:selectedJob.challengeId,
 }:null;
 const selectedTierTracked=selectedTierTarget?isTracked(selectedTierTarget):undefined;
 const selectedJobGroups=useMemo(
  ()=>selectedJob?groupRewardsByRarity(selectedJob.rewards):null,
  [selectedJob],
 );
 const selectedJobMatches=useMemo(
  ()=>selectedJob?b.activeMatches.filter(m=>m.job.id===selectedJob.id):[],
  [b.activeMatches,selectedJob],
 );
 const maxStageStanding=useMemo(
  ()=>selectedJob&&selectedJob.standingStages.length?Math.max(...selectedJob.standingStages,1):1,
  [selectedJob],
 );

 const hubFilterOptions=useMemo(
  ()=>[['all',L('全部平原','All hubs')] as const,...BOUNTY_SYNDICATE_ORDER.map(tag=>[tag,syndicateLabel(tag,b.catalog,en)] as const)],
  [b.catalog,en],
 );
 const tierFilterOptions=useMemo(
  ()=>[['all',L('全部等级','All tiers')] as const,...availableTiers.map(t=>[t.key,tierLabel(t.key,en)] as const)],
  [availableTiers,en],
 );
 const rarityFilterOptions=useMemo(
  ()=>[
   ['all',L('全部稀有度','All rarities')] as const,
   ['common',rarityLabel('common',en)] as const,
   ['uncommon',rarityLabel('uncommon',en)] as const,
   ['rare',rarityLabel('rare',en)] as const,
  ],
  [en],
 );
 const availabilityFilterOptions=useMemo(
  ()=>[
   ['all',L('全部状态','All')] as const,
   ['active',L('在池','Active')] as const,
   ['waiting',L('待轮','Wait')] as const,
  ],
  [en],
 );
 const sortFilterOptions=useMemo(
  ()=>[
   ['default',L('默认排序','Default')] as const,
   ['platinum-desc',L('白金高→低','Plat High→Low')] as const,
   ['platinum-asc',L('白金低→高','Plat Low→High')] as const,
  ],
  [en],
 );

 const showRotationControls=view==='active'&&(selectedHub===null||(catalogSyndicate?.rotatesRewards??false));
 const liveTableSyndicate=selectedHub?activeSyndicate:primaryRotatingSyn;

 return (
  <section className="bountyWorkspace" aria-label={L('赏金面板','Bounties panel')}>
   <header className="bountyTopBar">
    <div className="bountyTopLeft">
     <h1>{L('赏金','Bounties')}</h1>
     {view==='active'&&(
      <div className="bountyCycleStrip" title={catalogSyndicate?(en?catalogSyndicate.hubEn:catalogSyndicate.hubZh):undefined}>
       <span className="bountyCycleTime">
        <ClockIcon/>
        <strong>{activeSyndicate?countdown(activeSyndicate.expiry,b.now,en):'—'}</strong>
       </span>
       <span className="bountyMiniProgress" aria-hidden="true">
        <span style={{width:`${cycleLive?cycleProgress:0}%`}}/>
       </span>
      </div>
     )}
     {b.activeMatches.length>0&&(
      <button
       type="button"
       className="bountyHitPill"
       onClick={()=>{
        const hit=b.activeMatches[0];
        setRotationView('live');
        drillToHub(hit.syndicate.tag,hit.job.tierKey);
       }}
      >
       <span className="bountyDot hit"/>
       {L(`命中 ${b.activeMatches.length}`,`${b.activeMatches.length} active`)}
      </button>
     )}
     {syncError&&(
      <span className="bountyWarnPill" role="status" title={syncError}>
       <span className="bountyDot warn"/>
       {L('同步异常','Sync err')}
      </span>
     )}
    </div>

    <div className="bountyTopRight">
     <div className="bountyViewTabs" role="tablist" aria-label={L('赏金视图','Bounty views')}>
      <button
       type="button"
       role="tab"
       aria-selected={view==='active'}
       className={view==='active'?'selected':''}
       onClick={()=>onView('active')}
      >
       {L('当前','Active')}
      </button>
      <button
       type="button"
       role="tab"
       aria-selected={view==='subscriptions'}
       className={view==='subscriptions'?'selected':''}
       onClick={()=>onView('subscriptions')}
      >
       {L('追踪','Tracked')}
       {(b.preferences.subscriptions.length>0||b.activeMatches.length>0)&&(
        <small className={b.activeMatches.length>0?'hit':''}>
         {b.activeMatches.length>0?`${b.activeMatches.length}/${b.preferences.subscriptions.length}`:b.preferences.subscriptions.length}
        </small>
       )}
      </button>
     </div>

     <button
      type="button"
      className={'bountyDrawerToggle'+(controlsOpen?' open':'')}
      aria-expanded={controlsOpen}
      aria-label={L('提醒设置与测试','Alerts & tools')}
      title={L('提醒设置与测试','Alerts & tools')}
      onClick={()=>setControlsOpen(open=>!open)}
     >
      <span className={'bountyDot '+(b.preferences.enabled?'live':'muted')}/>
      <MixerHorizontalIcon/>
     </button>
    </div>
   </header>

   {controlsOpen&&(
    <div className="bountyControlDrawer">
     <label title={L('开启轮换提醒','Enable rotation alerts')}>
      <span>{L('提醒','Alerts')}</span>
      <input
       type="checkbox"
       role="switch"
       disabled={!b.canEdit}
       checked={b.preferences.enabled}
       onChange={()=>void b.toggleEnabled()}
      />
     </label>
     <label title={L('命中时播放提示音','Play sound on match')}>
      <span>{L('提示音','Sound')}</span>
      <input
       type="checkbox"
       role="switch"
       disabled={!b.canEdit}
       checked={b.preferences.soundEnabled}
       onChange={()=>void b.toggleSound()}
      />
     </label>
     <button type="button" className="bountyBtn sm" title={soundFeedback||L('试听提示音','Preview sound')} onClick={()=>void handlePreviewSound()}>
      <SpeakerIcon/>
      {L('试听','Sound')}
     </button>
     <button type="button" className="bountyBtn sm primary" title={testNoticeText||L('发送测试提醒','Send test alert')} disabled={!b.canEdit||b.testing} onClick={()=>void handleTestBounty()}>
      <BellIcon/>
      {b.testing?L('发送中','Sending'):L('测试','Test')}
     </button>
     <button type="button" className="bountyBtn sm" title={L('全局通知设置','Global notification settings')} onClick={onSettings}>
      <MixerHorizontalIcon/>
      {L('设置','Settings')}
     </button>
     {(testNoticeText||soundFeedback)&&(
      <span className="bountyStatusBadge live" role="status" title={testNoticeText||soundFeedback}>
       <span className="bountyDot live"/>
       {soundFeedback&&!testNoticeText?L('已播放','Played'):L('已触发','Sent')}
      </span>
     )}
     <span className="bountyTelemetry" title={L('数据来源：Warframe worldState.php 与 browse.wf','Sources: Warframe worldState.php & browse.wf')}>
      worldState{worldSource?.fetchedAt?` · ${new Date(worldSource.fetchedAt).toLocaleTimeString(i18n.language,{hour:'2-digit',minute:'2-digit'})}`:''}
     </span>
    </div>
   )}

   <div className="bountyScroll" ref={scrollRef}>
    {view==='active'?(
     <>
      {selectedHub===null?(
       <div className="bountyOverviewWrap">
        <div className="bountyRotationToolbar">
         <div className="bountyRotationTabs" role="group" aria-label={L('轮换表','Rotation tables')}>
          {(['A','B','C'] as const).map(rot=>{
           const isLiveTable=liveTableSyndicate?.rotation===rot;
           const isSelected=isLiveTable?rotationView==='live'||rotationView===rot:rotationView===rot;
           return (
            <button
             key={rot}
             type="button"
             className={isSelected?'selected':''}
             title={isLiveTable?L('当前实时轮换表','Current live rotation'):L('切换查看奖励表','Inspect reward table')}
             onClick={()=>setRotationView(isLiveTable?'live':rot)}
            >
             {isLiveTable&&<span className="bountyDot live"/>}
             {L(`表 ${rot}`,`Table ${rot}`)}
            </button>
           );
          })}
         </div>
         {isInspectingInactiveRotation&&(
          <span className="bountyStatusBadge muted">
           <span className="bountyDot muted"/>
           {L('预览','Preview')}
          </span>
         )}
        </div>

        {narmerHighlight&&(
         <section className="bountyNarmerBar" aria-label={L('合一众','Narmer')}>
          <button
           type="button"
           className="bountyNarmerTitle"
           onClick={()=>drillToHub(narmerHighlight.job.syndicate,narmerHighlight.job.tierKey)}
          >
           <img src="/reference/ui/crown.png" alt=""/>
           <strong>{L('合一众','Narmer')}</strong>
           <span className="bountyLvPill narmer">
            {narmerHighlight.job.minLevel>0?`LV ${narmerHighlight.job.minLevel}-${narmerHighlight.job.maxLevel}`:'LV 50-70'}
           </span>
          </button>
          <div className="bountyNarmerChips">
           {narmerHighlight.items.map(entry=>{
            const target=featuredTarget(entry);
            const tracked=isTracked(target);
            const hit=isItemHit(entry.syndicate,entry.tierKey,entry.reward);
            const name=formatRewardName(entry.reward,en);
            const price=resolveBountyItemPrice(entry.reward,priceIndex);
            const priceTag=price.state==='priced'&&price.totalPrice!==null?` · ${formatPlatinum(price.totalPrice)}`:'';
            return (
             <button
              key={entry.reward.itemId}
              type="button"
              className={'bountyInlineLootChip'+(tracked?' tracked':'')+(hit?' hit':'')}
              disabled={!b.canEdit}
              aria-pressed={!!tracked}
              title={`${name} · ${formatChance(entry.reward.chance)}${priceTag}`}
              onClick={()=>void b.toggleSubscription(target)}
             >
              <RewardThumb reward={entry.reward} itemIcons={b.itemIcons} size="xs"/>
              <span className="bountyChipName">{name}</span>
              <BountyPriceBadge price={price} quantity={entry.reward.quantity} live={bountyPrices.live} en={en} compact/>
             </button>
            );
           })}
          </div>
         </section>
        )}

        <div className="bountyOverviewGrid">
         {displaySyndicates.map(syn=>{
          const hubName=en?syn.hubEn:syn.hubZh;
          const featured=extractHubFeaturedRewards(syn);
          const highlightJobs=pickOverviewJobs(syn);
          const hubHits=b.activeMatches.filter(m=>m.syndicate.tag===syn.tag).length;
          return (
           <article key={syn.tag} className="bountyHubCard" data-hub={syn.tag}>
            <header className="bountyHubCardHead">
             <button
              type="button"
              className="bountyHubTrigger"
              onClick={()=>drillToHub(syn.tag)}
             >
              <img className="bountyHubEmblem" src={syndicateIconPath(syn.tag)} alt=""/>
              <h2>{hubName}</h2>
              <span className="bountyChevron" aria-hidden="true">›</span>
             </button>
             <div className="bountyHubHeadRight">
              {syn.vaultRotation&&(
               <span className="bountyRotBadge vault" title={L('隔离库当前轮换','Isolation Vault rotation')}>
                {L(`库 ${syn.vaultRotation}`,`Vault ${syn.vaultRotation}`)}
               </span>
              )}
              {hubHits>0&&(
               <span className="bountyHitPill">
                <span className="bountyDot hit"/>
                {hubHits}
               </span>
              )}
             </div>
            </header>

            {featured.items.length>0&&(
             <div className="bountyFeaturedBlock">
              <div className="bountyFeaturedLabel">{en?featured.labelEn:featured.labelZh}</div>
              <div className="bountyChipGrid">
               {featured.items.map(entry=>{
                const target=featuredTarget(entry);
                const tracked=isTracked(target);
                const hit=isItemHit(entry.syndicate,entry.tierKey,entry.reward);
                const chipLabel=formatInlineChipName(entry.reward,en);
                const price=resolveBountyItemPrice(entry.reward,priceIndex);
                const priceTag=price.state==='priced'&&price.totalPrice!==null?` · ${formatPlatinum(price.totalPrice)}`:'';
                return (
                 <button
                  key={`${entry.tierKey}-${entry.reward.itemId}`}
                  type="button"
                  className={'bountyInlineLootChip'+(tracked?' tracked':'')+(hit?' hit':'')}
                  disabled={!b.canEdit}
                  aria-pressed={!!tracked}
                  title={`${tierLabel(entry.tierKey,en)} · ${rarityShortLabel(entry.reward.rarity,en)} · ${chipLabel} · ${formatChance(entry.reward.chance)}${priceTag}`}
                  onClick={()=>void b.toggleSubscription(target)}
                 >
                  <RewardThumb reward={entry.reward} itemIcons={b.itemIcons} size="xs"/>
                  <span className="bountyChipName">{chipLabel}</span>
                  <BountyPriceBadge price={price} quantity={entry.reward.quantity} live={bountyPrices.live} en={en} compact/>
                 </button>
                );
               })}
              </div>
             </div>
            )}

            <div className="bountyMiniJobList">
             {highlightJobs.map(job=>{
              const tierText=tierLabel(job.tierKey,en);
              const titleText=cleanBountyTitle(en?job.titleEn:job.titleZh);
              const jobHit=b.activeMatches.some(m=>m.job.id===job.id);
              const ch=job.challengeId?b.catalog?.challenges[job.challengeId]:undefined;
              const challengeTitle=ch?(en?ch.en:ch.zh):(en?job.challengeEn:job.challengeZh);
              const challengeDesc=ch?cleanChallengeDesc(en?ch.descEn:ch.descZh):'';
              const missionText=job.missionType?(en?job.missionType:missionZh[job.missionType]??job.missionType):null;
              const hasNarrative=(job.missionType||challengeTitle||challengeDesc)&&!['CetusSyndicate','SolarisSyndicate','EntratiSyndicate'].includes(syn.tag);
              const lvText=job.minLevel>0?(job.minLevel===job.maxLevel?`LV ${job.minLevel}`:`LV ${job.minLevel}-${job.maxLevel}`):'';
              return (
               <button
                key={job.id}
                type="button"
                className={'bountyMiniJob'+(jobHit?' hit':'')}
                onClick={()=>drillToHub(syn.tag,job.tierKey)}
               >
                <div className="bountyMiniJobTop">
                 <span className="bountyTierPill">
                  <span className={'bountyDot '+(jobHit?'hit':'live')}/>
                  {tierText}
                 </span>
                 {titleText!==tierText&&<strong className="bountyMiniJobTitle">{titleText}</strong>}
                 {lvText&&<span className={`bountyLvPill ${levelBadgeTone(job)}`}>{lvText}</span>}
                </div>
                {hasNarrative?(
                 <div className="bountyMiniJobMeta">
                  {missionText&&(
                   <span className="bountyMissionBadge">
                    <MissionTypeIcon type={job.missionType}/>
                    <span>{missionText}</span>
                   </span>
                  )}
                  {challengeTitle&&<span className="bountyChallengeName">{challengeTitle}</span>}
                  {job.allyZh&&<span className="bountyAllyTag">{en?job.allyEn:job.allyZh}</span>}
                 </div>
                ):(
                 job.standingTotal>0&&(
                  <div className="bountyMiniJobMeta">
                   <span className="bountyTierStanding">
                    <img src="/reference/ui/standing.svg" alt=""/>
                    {job.standingTotal.toLocaleString()}
                   </span>
                  </div>
                 )
                )}
                {hasNarrative&&challengeDesc&&(
                 <div className="bountyObjBranch" title={challengeDesc}>
                  <span>{challengeDesc}</span>
                 </div>
                )}
               </button>
              );
             })}
            </div>
           </article>
          );
         })}
        </div>
       </div>
      ):(
       <>
        <div className="bountyDrillNav">
         <button type="button" className="bountyBackBtn" onClick={()=>setSelectedHub(null)}>
          ‹ {L('一览','Overview')}
         </button>
         <div className="bountyMiniHubStrip" role="tablist" aria-label={L('切换平原','Switch hub')}>
          {BOUNTY_SYNDICATE_ORDER.map(tag=>{
           const syn=displaySyndicates.find(s=>s.tag===tag);
           const hubName=en?syn?.hubEn??tag:syn?.hubZh??tag;
           const hits=b.activeMatches.filter(m=>m.syndicate.tag===tag).length;
           return (
            <button
             key={tag}
             type="button"
             role="tab"
             data-hub={tag}
             aria-selected={selectedHub===tag}
             className={'bountyMiniHubBtn'+(selectedHub===tag?' selected':'')+(hits>0?' hasHit':'')}
             onClick={()=>drillToHub(tag)}
            >
             <img src={syndicateIconPath(tag)} alt=""/>
             <span>{hubName}</span>
             {hits>0&&<small>{hits}</small>}
            </button>
           );
          })}
         </div>
        </div>

        {showRotationControls&&(
         <div className="bountyRotationToolbar">
          <div className="bountyRotationTabs" role="group" aria-label={L('轮换表','Rotation tables')}>
           {(['A','B','C'] as const).map(rot=>{
            const isLiveTable=activeSyndicate?.rotation===rot;
            const isSelected=isLiveTable?rotationView==='live'||rotationView===rot:rotationView===rot;
            return (
             <button
              key={rot}
              type="button"
              className={isSelected?'selected':''}
              title={isLiveTable?L('当前实时轮换表','Current live rotation'):L('切换查看奖励表','Inspect reward table')}
              onClick={()=>setRotationView(isLiveTable?'live':rot)}
             >
              {isLiveTable&&<span className="bountyDot live"/>}
              {L(`表 ${rot}`,`Table ${rot}`)}
             </button>
            );
           })}
          </div>
          {activeSyndicate?.vaultRotation&&(
           <span className="bountyRotBadge vault" title={L('隔离库当前轮换','Current Isolation Vault rotation')}>
            {L(`库 ${activeSyndicate.vaultRotation}`,`Vault ${activeSyndicate.vaultRotation}`)}
           </span>
          )}
          {isInspectingInactiveRotation&&(
           <span className="bountyStatusBadge muted">
            <span className="bountyDot muted"/>
            {L('预览','Preview')}
           </span>
          )}
         </div>
        )}

        {displayedJobs.length>0&&selectedJob&&selectedJobGroups?(
         <div className="bountyBoard">
          <div className="bountyTierRail" role="tablist" aria-label={L('赏金等级','Bounty tiers')}>
           {displayedJobs.map(job=>{
            const isSelected=job.tierKey===selectedJob.tierKey;
            const tierName=tierLabel(job.tierKey,en);
            const cleanedTitle=cleanBountyTitle(en?job.titleEn:job.titleZh);
            const showSubtitle=cleanedTitle!==tierName&&cleanedTitle!==job.tierLabelZh&&cleanedTitle!==job.tierLabelEn;
            const jobHit=b.activeMatches.some(m=>m.job.id===job.id);
            const hasTracked=tierHasAnyRule(job);
            const previews=pickTierPreviewRewards(job.rewards);
            return (
             <button
              key={job.id}
              type="button"
              role="tab"
              aria-selected={isSelected}
              className={'bountyTierItem'+(isSelected?' selected':'')+(jobHit?' matched':'')}
              onClick={()=>setSelectedTierKey(job.tierKey)}
             >
              <TierMedal job={job}/>
              <div className="bountyTierInfo">
               <div className="bountyTierTop">
                <strong>{tierName}</strong>
                {job.minLevel>0&&(
                 <span className="bountyLevel">Lv {job.minLevel}{job.maxLevel!==job.minLevel?`-${job.maxLevel}`:''}</span>
                )}
                {(jobHit||hasTracked)&&(
                 <span className={'bountyTierStateDot'+(jobHit?' hit':' tracked')} aria-hidden="true"/>
                )}
               </div>
               {showSubtitle&&(
                <span className="bountyTierName">{cleanedTitle}</span>
               )}
               <div className="bountyTierFoot">
                {job.standingTotal>0&&(
                 <span className="bountyTierStanding">
                  <img src="/reference/ui/standing.svg" alt=""/>
                  {job.standingTotal.toLocaleString()}
                 </span>
                )}
                <div className="bountyMiniLoot">
                 {previews.map(reward=>(
                  <RewardThumb
                   key={reward.itemId}
                   reward={reward}
                   itemIcons={b.itemIcons}
                   size="xs"
                   title={formatRewardName(reward,en)}
                  />
                 ))}
                </div>
               </div>
              </div>
             </button>
            );
           })}
          </div>

          <section className={'bountyDetailPane'+(selectedJobMatches.length>0?' matched':'')} aria-label={tierLabel(selectedJob.tierKey,en)}>
           <header className="bountyDetailHeader">
            <div className="bountyDetailTitleWrap">
             <h2>{cleanBountyTitle(en?selectedJob.titleEn:selectedJob.titleZh)}</h2>
             {(selectedJob.missionType||selectedJob.allyZh||selectedJob.challengeZh)&&(
              <div className="bountyDetailMeta">
               {selectedJob.missionType&&(
                <span className="bountyTagChip">
                 <MissionTypeIcon type={selectedJob.missionType}/>
                 {en?selectedJob.missionType:missionZh[selectedJob.missionType]??selectedJob.missionType}
                </span>
               )}
               {selectedJob.allyZh&&(
                <span className="bountyTagChip ally">{en?selectedJob.allyEn:selectedJob.allyZh}</span>
               )}
               {selectedJob.challengeZh&&(
                <span className="bountyTagChip challenge" title={en?selectedJob.challengeEn??'':selectedJob.challengeZh}>
                 {en?selectedJob.challengeEn:selectedJob.challengeZh}
                </span>
               )}
              </div>
             )}
            </div>

            {selectedTierTarget&&(
             <button
              type="button"
              className={'bountyTrackPill'+(selectedTierTracked?' active':'')}
              disabled={!b.canEdit}
              aria-pressed={!!selectedTierTracked}
              title={L('追踪此档全部奖励','Track entire tier')}
              onClick={()=>void b.toggleSubscription(selectedTierTarget)}
             >
              <BellIcon/>
              {selectedTierTracked?L('已追踪','Tracked'):L('整档','Tier')}
             </button>
            )}
           </header>

           {selectedJob.standingStages.length>0&&(
            <div className="bountyStageStrip">
             <span className="bountyStageTotal" title={selectedJob.standingStages.map((v,i)=>`${L('阶段','S')}${i+1}: ${v}`).join(' / ')}>
              <img src="/reference/ui/standing.svg" alt=""/>
              <strong>
               {selectedJob.syndicate==='ZarimanSyndicate'
                ?`${selectedJob.standingTotal} ${L('羽翎','Quill')}`
                :selectedJob.standingTotal.toLocaleString()}
              </strong>
             </span>
             <div className="bountyStageTicks">
              {selectedJob.standingStages.map((val,idx)=>(
               <div
                key={`${idx}-${val}`}
                className="bountyStageTick"
                style={{flexGrow:Math.max(1,val)}}
                title={`${L('阶段','Stage')} ${idx+1} · ${val.toLocaleString()}`}
               >
                <span style={{width:`${Math.round((val/maxStageStanding)*100)}%`}}/>
               </div>
              ))}
             </div>
            </div>
           )}

           <div className="bountyRarityGroups">
            {(['rare','uncommon','common'] as const).map((rarity:BountyRarity)=>{
             const list=selectedJobGroups[rarity];
             if(!list.length)return null;
             const rarityTarget:BountySubscriptionTarget={
              syndicate:selectedJob.syndicate,
              tierKey:selectedJob.tierKey,
              rarity,
              itemId:null,
             };
             const rarityTracked=isTracked(rarityTarget);
             return (
              <section key={rarity} className={`bountyRaritySection ${rarity}`}>
               <div className="bountyRarityHead">
                <span className={`bountyRarityDot ${rarity}`}/>
                <strong>{rarityShortLabel(rarity,en)}</strong>
                <span className="bountyRarityCount">{list.length}</span>
                <button
                 type="button"
                 className={'bountyRarityTrackBtn'+(rarityTracked?' active':'')}
                 disabled={!b.canEdit}
                 aria-pressed={!!rarityTracked}
                 title={L('追踪此稀有度整组','Track entire rarity tier')}
                 onClick={()=>void b.toggleSubscription(rarityTarget)}
                >
                 {rarityTracked?L('已追','Tracked'):L('整组','Group')}
                </button>
               </div>

               <div className="bountyLootGrid">
                {list.map((reward,idx)=>{
                 const itemTarget:BountySubscriptionTarget={
                  syndicate:selectedJob.syndicate,
                  tierKey:selectedJob.tierKey,
                  rarity,
                  itemId:reward.itemId,
                  itemNameZh:reward.zh,
                  itemNameEn:reward.en,
                 };
                 const itemTracked=isTracked(itemTarget);
                 const itemHit=selectedJobMatches.some(m=>m.matchedRewards.some(r=>r.itemId===reward.itemId&&r.rarity===rarity));
                 const owned=reward.itemId.startsWith('/Lotus/')
                  ?rewardOwned(snapshot?.counts,snapshot?.complete,reward.itemId)
                  :null;
                 const displayName=formatRewardName(reward,en);
                 const price=resolveBountyItemPrice(reward,priceIndex);
                 const barPct=Math.min(100,Math.max(5,reward.finalChance??reward.chance));
                 const chanceTitle=[
                  `${L('基础概率','Base')} ${formatChance(reward.chance)}`,
                  reward.finalChance!==null?`${L('终段概率','Final stage')} ${formatChance(reward.finalChance)}`:null,
                  owned!==null?`${L('当前库存','Owned')} ${owned.toLocaleString()}`:null,
                 ].filter(Boolean).join(' · ');
                 return (
                  <article
                   key={`${reward.itemId}-${reward.quantity}-${idx}`}
                   className={'bountyLootTile'+(itemTracked?' tracked':'')+(itemHit?' hit':'')}
                  >
                   <RewardThumb reward={reward} itemIcons={b.itemIcons}/>
                   <div className="bountyLootInfo">
                    <div className="bountyLootHead">
                     <span className="bountyLootName" title={displayName}>{displayName}</span>
                     <BountyPriceBadge price={price} quantity={reward.quantity} live={bountyPrices.live} en={en}/>
                    </div>
                    <div className="bountyChanceBar" aria-hidden="true">
                     <span className={rarity} style={{width:`${barPct}%`}}/>
                    </div>
                    <span className="bountyLootMeta" title={chanceTitle}>
                     {formatChance(reward.chance)}
                     {reward.finalChance!==null&&` · ${L('终','F')} ${formatChance(reward.finalChance)}`}
                     {owned!==null&&` · ${L('存','Own')} ${owned.toLocaleString()}`}
                    </span>
                   </div>
                   <button
                    type="button"
                    className={'bountyLootTrackBtn'+(itemTracked?' active':'')+(itemHit?' hit':'')}
                    disabled={!b.canEdit}
                    aria-pressed={!!itemTracked}
                    aria-label={(itemTracked?L('取消追踪 ','Untrack '):L('追踪 ','Track '))+(en?reward.en:reward.zh)}
                    title={itemHit?L('当前命中','Active'):itemTracked?L('取消追踪','Untrack'):L('追踪','Track')}
                    onClick={()=>void b.toggleSubscription(itemTarget)}
                   >
                    <BellIcon/>
                   </button>
                  </article>
                 );
                })}
               </div>
              </section>
             );
            })}
           </div>
          </section>
         </div>
        ):(
         <div className="bountyEmpty">
          <ClockIcon/>
          <h3>{L('暂无赏金','No bounty data')}</h3>
         </div>
        )}
       </>
      )}
     </>
    ):(
     <div className="bountyTrackerStack">
      <section className="bountyTrackedPanel">
       <div className="bountySectionHead">
        <h2>{L('已追踪','Tracked')}</h2>
        <span className="bountyCountPill">{b.preferences.subscriptions.length}</span>
       </div>
       {b.preferences.subscriptions.length===0?(
        <span className="bountyStatusBadge muted">
         <span className="bountyDot muted"/>
         {L('暂无','None')}
        </span>
       ):(
        <div className="bountySubGrid">
         {b.preferences.subscriptions.map(sub=>{
          const info=describeSubscription(sub);
          const hits=subscriptionMatchCount(sub.id);
          const subPrice=sub.itemId
           ?resolveBountyItemPrice({itemId:sub.itemId,en:sub.itemNameEn,quantity:1},priceIndex)
           :null;
          return (
           <article key={sub.id} className={'bountySubCard'+(hits>0?' hit':'')+(!sub.enabled?' paused':'')}>
            {sub.itemId&&(
             <RewardThumb
              reward={{
               itemId:sub.itemId,
               en:sub.itemNameEn??sub.itemId,
               category:'item',
               rarity:sub.rarity==='all'?'uncommon':sub.rarity,
              }}
              itemIcons={b.itemIcons}
              size="sm"
             />
            )}
            <div className="bountySubBody">
             <div className="bountySubTop">
              <strong>{info.title}</strong>
              {subPrice&&<BountyPriceBadge price={subPrice} quantity={1} live={bountyPrices.live} en={en}/>}
              <span className={'bountyStatusBadge'+(hits>0?' hit':!sub.enabled?' muted':' wait')}>
               <span className={'bountyDot'+(hits>0?' hit':' muted')}/>
               {!sub.enabled?L('暂停','Paused'):hits>0?(hits>1?L(`命中 ${hits}`,`Active ${hits}`):L('命中','Active')):L('待轮','Wait')}
              </span>
             </div>
             <small>{info.path}{info.rotHint?` · ${info.rotHint}`:''}</small>
            </div>
            <div className="bountySubActions">
             <input
              type="checkbox"
              role="switch"
              aria-label={L('启用或暂停 ','Toggle ')+info.title}
              disabled={!b.canEdit}
              checked={sub.enabled}
              onChange={()=>void b.toggleSubscriptionEnabled(sub.id)}
             />
             <button
              type="button"
              className="bountyIconBtn danger"
              aria-label={L('删除 ','Delete ')+info.title}
              title={L('删除','Delete')}
              disabled={!b.canEdit}
              onClick={()=>void b.removeSubscription(sub.id)}
             >
              <TrashIcon/>
             </button>
            </div>
           </article>
          );
         })}
        </div>
       )}
      </section>

      <details className="bountyAccordion">
       <summary>
        <span>{L('提醒记录','Alert history')}</span>
        <span className="bountyCountPill">{bountyNotifications.length}</span>
       </summary>
       <div className="bountyAccordionBody">
        {bountyNotifications.length===0?(
         <span className="bountyStatusBadge muted">
          <span className="bountyDot muted"/>
          {L('暂无','None')}
         </span>
        ):(
         <div className="bountyNoticeHistory">
          {bountyNotifications.map(n=>(
           <article key={n.id}>
            <div>
             <strong>{n.title}</strong>
             <time>{new Date(n.createdAt).toLocaleString(i18n.language)}</time>
            </div>
            <p>{n.body}</p>
            {n.deliveryError&&<small>{n.deliveryError}</small>}
           </article>
          ))}
         </div>
        )}
       </div>
      </details>

      <section className="bountyExplorerPanel">
       <div className="bountySectionHead">
        <h2>{L('全池检索','All rewards')}</h2>
        <div className="bountySectionCounts">
         {explorerPriceStats&&explorerPriceStats.tradable>0&&explorerPriceStats.priced<explorerPriceStats.tradable&&(
          <span className="bountyCountPill" title={L('warframe.market 实时行情缓存','warframe.market live price cache')}>
           {`${explorerPriceStats.priced}/${explorerPriceStats.tradable} ${L('已报价','Priced')}`}
          </span>
         )}
         <span className="bountyCountPill">{filteredExplorerRows.length}</span>
        </div>
       </div>

       <div className="bountyExplorerFilters">
        <div className="bountySearchBox">
         <MagnifyingGlassIcon/>
         <input
          type="search"
          aria-label={L('搜索赏金奖励','Search bounty rewards')}
          placeholder={L('搜索奖励或拼音','Search')}
          value={filterQuery}
          onChange={e=>{setFilterQuery(e.target.value);setShowAllExplorer(false);}}
         />
         {filterQuery&&(
          <button type="button" className="bountyIconBtn" aria-label={L('清空搜索','Clear search')} onClick={()=>setFilterQuery('')}>
           <Cross2Icon/>
          </button>
         )}
        </div>

        <div className="bountyFilterRow">
         <ThemeSelect
          label={L('筛选平原','Filter hub')}
          value={filterSyndicate}
          options={hubFilterOptions}
          onChange={val=>{setFilterSyndicate(val);setFilterTier('all');setShowAllExplorer(false);}}
         />
         <ThemeSelect
          label={L('筛选等级','Filter tier')}
          value={filterTier}
          options={tierFilterOptions}
          onChange={val=>{setFilterTier(val);setShowAllExplorer(false);}}
         />
         <ThemeSelect
          label={L('筛选稀有度','Filter rarity')}
          value={filterRarity}
          options={rarityFilterOptions}
          onChange={val=>{setFilterRarity(val as BountyRarityFilter);setShowAllExplorer(false);}}
         />
         <ThemeSelect
          label={L('筛选当前状态','Filter status')}
          value={filterAvailability}
          options={availabilityFilterOptions}
          onChange={val=>{setFilterAvailability(val as 'all'|'active'|'waiting');setShowAllExplorer(false);}}
         />
         <ThemeSelect
          label={L('按白金排序','Sort by platinum')}
          value={explorerSort}
          options={sortFilterOptions}
          onChange={val=>{setExplorerSort(val as BountySortMode);setShowAllExplorer(false);}}
         />
         <label
          className={'bountyTradableToggle'+(filterTradableOnly?' active':'')}
          title={L('仅显示可在 warframe.market 交易的奖励','Show only rewards tradable on warframe.market')}
         >
          <span>{L('仅可交易','Tradable')}</span>
          <input
           type="checkbox"
           role="switch"
           checked={filterTradableOnly}
           onChange={e=>{setFilterTradableOnly(e.target.checked);setShowAllExplorer(false);}}
          />
         </label>
        </div>

        {(filterSyndicate!=='all'||filterTier!=='all'||filterRarity!=='all')&&(
         <div className="bountyQuickRuleBar">
          <b>{syndicateLabel(filterSyndicate,b.catalog,en)} · {tierLabel(filterTier,en)} · {rarityLabel(filterRarity,en)}</b>
          <button
           type="button"
           className={'bountyBtn sm'+(tierRuleSaved?' active':'')}
           disabled={!b.canEdit}
           onClick={()=>void b.toggleSubscription(tierRuleTarget)}
          >
           <BellIcon/>
           {tierRuleSaved?L('已追','Tracked'):L('追踪筛选','Track filter')}
          </button>
         </div>
        )}
       </div>

       <div className="bountyExplorerList">
        {visibleExplorerRows.map(row=>{
         const target:BountySubscriptionTarget={
          syndicate:row.syndicate,
          tierKey:row.tierKey,
          rarity:row.rarity,
          itemId:row.itemId,
          itemNameZh:row.zh,
          itemNameEn:row.en,
         };
         const saved=isTracked(target);
         const activeRot=b.bounties.find(s=>s.tag===row.syndicate)?.rotation??null;
         const rowPrice=resolveBountyItemPrice(row,priceIndex);
         return (
          <article key={row.key} className={'bountyExplorerRow'+(row.activeNow?' active':'')+(saved?' tracked':'')}>
           <RewardThumb reward={row} itemIcons={b.itemIcons} size="sm"/>
           <div className="bountyExplorerBody">
            <div className="bountyExplorerTop">
             <strong>{formatRewardName(row,en)}</strong>
             <span className={`bountyRarityPill ${row.rarity}`}>{rarityShortLabel(row.rarity,en)}</span>
             {row.rotations.length>0?(
              <div className="bountyRotTags">
               {row.rotations.map(rot=>(
                <span key={rot} className={activeRot===rot&&row.activeNow?'live':''}>
                 {L(`表 ${rot}`,`Rot ${rot}`)}
                </span>
               ))}
              </div>
             ):(
              <span className="bountyFixedTag">{L('固定','Fixed')}</span>
             )}
            </div>
            <small>
             {en?row.hubEn:row.hubZh} · {tierLabel(row.tierKey,en)}
             {row.minLevel>0?` · Lv ${row.minLevel}-${row.maxLevel}`:''}
             {` · ${formatChance(row.chance)}`}
             {row.finalChance!==null?` · ${L('终','F')} ${formatChance(row.finalChance)}`:''}
            </small>
           </div>
           <div className="bountyExplorerActions">
            <BountyPriceBadge price={rowPrice} quantity={row.quantity} live={bountyPrices.live} en={en}/>
            <span className={'bountyStatusBadge'+(row.activeNow?' live':' muted')}>
             <span className={'bountyDot'+(row.activeNow?' live':' muted')}/>
             {row.activeNow?L('在池','Active'):L('待轮','Wait')}
            </span>
            <button
             type="button"
             className={'bountyLootTrackBtn'+(saved?' active':'')}
             disabled={!b.canEdit}
             aria-pressed={!!saved}
             aria-label={(saved?L('取消追踪 ','Untrack '):L('追踪 ','Track '))+formatRewardName(row,en)}
             title={saved?L('取消追踪','Untrack'):L('追踪','Track')}
             onClick={()=>void b.toggleSubscription(target)}
            >
             <BellIcon/>
            </button>
           </div>
          </article>
         );
        })}

        {filteredExplorerRows.length>120&&!showAllExplorer&&(
         <button type="button" className="bountyShowMoreBtn" onClick={()=>setShowAllExplorer(true)}>
          {L(`展开 ${filteredExplorerRows.length}`,`Show ${filteredExplorerRows.length}`)}
         </button>
        )}

        {!filteredExplorerRows.length&&(
         <div className="bountyEmpty">
          <MagnifyingGlassIcon/>
          <h3>{L('无匹配','No matches')}</h3>
          <button type="button" className="bountyBtn sm" onClick={resetExplorerFilters}>
           {L('重置筛选','Reset')}
          </button>
         </div>
        )}
       </div>
      </section>
     </div>
    )}
   </div>
  </section>
 );
}

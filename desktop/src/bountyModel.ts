import {searchText} from './searchText.ts';
import type {MarketRankingRow} from './marketRankingModel.ts';

export type BountyRarity='common'|'uncommon'|'rare';
export type BountyRarityFilter='all'|BountyRarity;
export type BountyRotation='A'|'B'|'C';

export type BountyReward={
 itemId:string;
 zh:string;
 en:string;
 quantity:number;
 rarity:BountyRarity;
 chance:number;
 finalChance:number|null;
 category:string;
};

export type BountyJob={
 id:string;
 syndicate:string;
 jobType:string;
 titleZh:string;
 titleEn:string;
 tierKey:string;
 tierIndex:number;
 tierLabelZh:string;
 tierLabelEn:string;
 minLevel:number;
 maxLevel:number;
 masteryReq:number;
 standingStages:number[];
 standingTotal:number;
 rewardDeck:string;
 rotation:BountyRotation|null;
 isSteelPath:boolean;
 isNarmer:boolean;
 isVault:boolean;
 isEndless:boolean;
 nodeId:string|null;
 nodeZh:string|null;
 nodeEn:string|null;
 missionType:string|null;
 challengeId:string|null;
 challengeZh:string|null;
 challengeEn:string|null;
 allyZh:string|null;
 allyEn:string|null;
 activation:string;
 expiry:string;
 rewards:BountyReward[];
};

export type BountySyndicate={
 tag:string;
 nameZh:string;
 nameEn:string;
 hubZh:string;
 hubEn:string;
 rotatesRewards:boolean;
 rotation:BountyRotation|null;
 vaultRotation:BountyRotation|null;
 activation:string;
 expiry:string;
 jobs:BountyJob[];
};

export type BountySubscription={
 id:string;
 enabled:boolean;
 syndicate:string;
 tierKey:string;
 rarity:BountyRarityFilter;
 itemId:string|null;
 itemNameZh:string|null;
 itemNameEn:string|null;
 missionType:string|null;
 challengeId:string|null;
 createdAt:string;
};

export type BountyPreferences={
 enabled:boolean;
 soundEnabled:boolean;
 showInEvents:boolean;
 subscriptions:BountySubscription[];
};

export type BountyCatalogDeck={
 syndicate:string;
 applicableSyndicates:string[];
 tierKey:string;
 tierIndex:number;
 tierLabelZh:string;
 tierLabelEn:string;
 minLevel:number;
 maxLevel:number;
 standingStages:number[];
 rotation:BountyRotation|null;
 isSteelPath:boolean;
 isNarmer:boolean;
 isVault:boolean;
 isEndless:boolean;
 isEvent:boolean;
 rewards:BountyReward[];
};

export type BountyCatalogSyndicate={
 tag:string;
 nameZh:string;
 nameEn:string;
 hubZh:string;
 hubEn:string;
 planetZh:string;
 planetEn:string;
 rotatesRewards:boolean;
 hasVaultRot:boolean;
};

export type BountyCatalog={
 schemaVersion:number;
 syndicates:BountyCatalogSyndicate[];
 decks:Record<string,BountyCatalogDeck>;
 jobs:Record<string,{zh:string;en:string}>;
 challenges:Record<string,{zh:string;en:string;descZh:string;descEn:string}>;
 allies:Record<string,{zh:string;en:string}>;
};

export type BountyActiveMatch={
 subscription:BountySubscription;
 syndicate:BountySyndicate;
 job:BountyJob;
 matchedRewards:BountyReward[];
};

export type BountyCatalogRewardRow={
 key:string;
 syndicate:string;
 syndicateZh:string;
 syndicateEn:string;
 hubZh:string;
 hubEn:string;
 tierKey:string;
 tierIndex:number;
 tierLabelZh:string;
 tierLabelEn:string;
 minLevel:number;
 maxLevel:number;
 rarity:BountyRarity;
 itemId:string;
 zh:string;
 en:string;
 quantity:number;
 category:string;
 chance:number;
 finalChance:number|null;
 rotations:BountyRotation[];
 rotatesRewards:boolean;
 activeNow:boolean;
 activeJobIds:string[];
};

export type BountyBrowseFilter={
 query:string;
 syndicate:string;
 tierKey:string;
 rarity:BountyRarityFilter;
 availability:'all'|'active'|'waiting';
 tradableOnly?:boolean;
};

export type BountySortMode='default'|'platinum-desc'|'platinum-asc';
export type BountyPriceState='priced'|'no-orders'|'pending'|'error'|'untradable';

export interface BountyItemPrice{
 slug:string|null;
 state:BountyPriceState;
 unitPrice:number|null;
 totalPrice:number|null;
 stale:boolean;
 sampleCount:number|null;
 fetchedAt:string|null;
 error:string|null;
}

export interface BountyPriceIndex{
 byGameRef:ReadonlyMap<string,MarketRankingRow>;
 byEnName:ReadonlyMap<string,MarketRankingRow>;
}

export type BountySubscriptionTarget={
 syndicate:string;
 tierKey:string;
 rarity:BountyRarityFilter;
 itemId?:string|null;
 itemNameZh?:string|null;
 itemNameEn?:string|null;
 missionType?:string|null;
 challengeId?:string|null;
};

export const BOUNTY_SYNDICATE_ORDER=[
 'CetusSyndicate',
 'SolarisSyndicate',
 'EntratiSyndicate',
 'ZarimanSyndicate',
 'EntratiLabSyndicate',
 'HexSyndicate',
] as const;

export const defaultBountyPreferences=():BountyPreferences=>({
 enabled:true,
 soundEnabled:true,
 showInEvents:true,
 subscriptions:[],
});

export function rarityLabel(rarity:BountyRarityFilter,en=false):string{
 switch(rarity){
  case 'common':return en?'Bronze':'铜奖励';
  case 'uncommon':return en?'Silver':'银奖励';
  case 'rare':return en?'Gold':'金奖励';
  default:return en?'All rarities':'全部稀有度';
 }
}

export function rarityShortLabel(rarity:BountyRarity,en=false):string{
 switch(rarity){
  case 'common':return en?'Bronze':'铜奖励';
  case 'uncommon':return en?'Silver':'银奖励';
  case 'rare':return en?'Gold':'金奖励';
 }
}

export function tierLabel(tierKey:string,en=false):string{
 const map:Record<string,[string,string]>={
  all:['全部等级','All tiers'],
  tier1:['1级','T1'],
  tier2:['2级','T2'],
  tier3:['3级','T3'],
  tier4:['4级','T4'],
  tier5:['5级','T5'],
  tier6:['6级','T6'],
  steelPath:['钢铁之路','Steel Path'],
  narmer:['合一众','Narmer'],
  vault1:['隔离库1','Vault 1'],
  vault2:['隔离库2','Vault 2'],
  vault3:['隔离库3','Vault 3'],
  ghoul1:['尸鬼1','Ghoul 1'],
  ghoul2:['尸鬼2','Ghoul 2'],
  plagueStar:['瘟疫之星','Plague Star'],
  plagueStarSp:['钢铁瘟疫','Plague SP'],
  lich:['终结者','Coda'],
 };
 const entry=map[tierKey];
 return entry?entry[en?1:0]:tierKey;
}

export function cleanBountyTitle(title:string):string{
 return title.replace(/\s*[（(][^）)]*[）)]/g,'').trim()||title.trim();
}

export function syndicateLabel(tag:string,catalog:BountyCatalog|null,en=false):string{
 if(tag==='all')return en?'All hubs':'全部平原';
 const found=catalog?.syndicates.find(s=>s.tag===tag);
 if(found)return en?found.hubEn:found.hubZh;
 const fallback:Record<string,[string,string]>={
  CetusSyndicate:['夜灵平野','Plains of Eidolon'],
  SolarisSyndicate:['奥布山谷','Orb Vallis'],
  EntratiSyndicate:['魔胎之境','Cambion Drift'],
  ZarimanSyndicate:['扎里曼十零号','Zariman'],
  EntratiLabSyndicate:['解剖圣所','Sanctum Anatomica'],
  HexSyndicate:['霍瓦尼亚 1999','Höllvania 1999'],
 };
 return fallback[tag]?.[en?1:0]??tag;
}

export function isBountyActive(activation:string,expiry:string,now=Date.now()):boolean{
 const start=Date.parse(activation),end=Date.parse(expiry);
 return Number.isFinite(start)&&Number.isFinite(end)&&start<=now&&end>now;
}

export function bountyRotationProgress(activation:string,expiry:string,now=Date.now()):number{
 const start=Date.parse(activation),end=Date.parse(expiry);
 if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)return 0;
 return Math.max(0,Math.min(100,((now-start)/(end-start))*100));
}

export function groupRewardsByRarity(rewards:readonly BountyReward[]):Record<BountyRarity,BountyReward[]>{
 const groups:Record<BountyRarity,BountyReward[]>={common:[],uncommon:[],rare:[]};
 for(const reward of rewards){
  groups[reward.rarity].push(reward);
 }
 return groups;
}

export function matchesBountySubscription(sub:BountySubscription,job:BountyJob):BountyReward[]|null{
 if(!sub.enabled)return null;
 if(sub.syndicate!=='all'&&sub.syndicate!==job.syndicate)return null;
 if(sub.tierKey!=='all'&&sub.tierKey!==job.tierKey)return null;
 if(sub.missionType&&sub.missionType!==job.missionType)return null;
 if(sub.challengeId&&sub.challengeId!==job.challengeId)return null;
 if(!sub.itemId&&sub.rarity==='all')return [];
 const matched=job.rewards.filter(reward=>
  (sub.rarity==='all'||reward.rarity===sub.rarity)
  &&(!sub.itemId||reward.itemId===sub.itemId),
 );
 return matched.length>0?matched:null;
}

export function findActiveBountyMatches(
 bounties:readonly BountySyndicate[],
 prefs:BountyPreferences,
 now=Date.now(),
):BountyActiveMatch[]{
 const matches:BountyActiveMatch[]=[];
 for(const syndicate of bounties){
  for(const job of syndicate.jobs){
   if(!isBountyActive(job.activation,job.expiry,now))continue;
   for(const sub of prefs.subscriptions){
    const matchedRewards=matchesBountySubscription(sub,job);
    if(matchedRewards!==null){
     matches.push({subscription:sub,syndicate,job,matchedRewards});
    }
   }
  }
 }
 return matches;
}

export function normalizeTarget(target:BountySubscriptionTarget){
 return {
  syndicate:target.syndicate||'all',
  tierKey:target.tierKey||'all',
  rarity:target.rarity||'all',
  itemId:target.itemId??null,
  itemNameZh:target.itemNameZh??null,
  itemNameEn:target.itemNameEn??null,
  missionType:target.missionType??null,
  challengeId:target.challengeId??null,
 };
}

export function findMatchingSubscription(
 subs:readonly BountySubscription[],
 target:BountySubscriptionTarget,
):BountySubscription|undefined{
 const norm=normalizeTarget(target);
 return subs.find(sub=>
  sub.syndicate===norm.syndicate
  &&sub.tierKey===norm.tierKey
  &&sub.rarity===norm.rarity
  &&(sub.itemId??null)===norm.itemId
  &&(sub.missionType??null)===norm.missionType
  &&(sub.challengeId??null)===norm.challengeId,
 );
}

export function createBountySubscription(
 target:BountySubscriptionTarget,
 createdAt=new Date().toISOString(),
 id=typeof crypto!=='undefined'&&typeof crypto.randomUUID==='function'?crypto.randomUUID():`bounty-sub-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
):BountySubscription{
 const norm=normalizeTarget(target);
 return {
  id,
  enabled:true,
  syndicate:norm.syndicate,
  tierKey:norm.tierKey,
  rarity:norm.rarity,
  itemId:norm.itemId,
  itemNameZh:norm.itemNameZh,
  itemNameEn:norm.itemNameEn,
  missionType:norm.missionType,
  challengeId:norm.challengeId,
  createdAt,
 };
}

export function toggleBountySubscriptionList(
 subs:readonly BountySubscription[],
 target:BountySubscriptionTarget,
 createdAt=new Date().toISOString(),
):{subscriptions:BountySubscription[];added:boolean}{
 const existing=findMatchingSubscription(subs,target);
 if(existing){
  return {subscriptions:subs.filter(sub=>sub.id!==existing.id),added:false};
 }
 return {subscriptions:[createBountySubscription(target,createdAt),...subs],added:true};
}

export function buildCatalogRewardRows(
 catalog:BountyCatalog,
 activeBounties:readonly BountySyndicate[],
 now=Date.now(),
):BountyCatalogRewardRow[]{
 const syndicateMap=new Map(catalog.syndicates.map(s=>[s.tag,s]));
 const activeSlotMap=new Map<string,string[]>();
 for(const syn of activeBounties){
  for(const job of syn.jobs){
   if(!isBountyActive(job.activation,job.expiry,now))continue;
   for(const reward of job.rewards){
    const key=`${syn.tag}|${job.tierKey}|${reward.rarity}|${reward.itemId}`;
    const list=activeSlotMap.get(key)??[];
    list.push(job.id);
    activeSlotMap.set(key,list);
   }
  }
 }

 const merged=new Map<string,BountyCatalogRewardRow>();
 const registerRow=(
  synTag:string,
  deck:BountyCatalogDeck,
  reward:BountyReward,
  tierOverride?:{tierKey:string;tierIndex:number;tierLabelZh:string;tierLabelEn:string;minLevel:number;maxLevel:number},
 )=>{
  const syn=syndicateMap.get(synTag);
  if(!syn)return;
  const tierKey=tierOverride?.tierKey??deck.tierKey;
  const key=`${synTag}|${tierKey}|${reward.rarity}|${reward.itemId}`;
  const activeJobIds=activeSlotMap.get(key)??[];
  const existing=merged.get(key);
  if(existing){
   if(deck.rotation&&!existing.rotations.includes(deck.rotation)){
    existing.rotations.push(deck.rotation);
    existing.rotations.sort();
   }
   existing.chance=Math.max(existing.chance,reward.chance);
   if(reward.finalChance!==null){
    existing.finalChance=existing.finalChance===null?reward.finalChance:Math.max(existing.finalChance,reward.finalChance);
   }
   return;
  }
  merged.set(key,{
   key,
   syndicate:synTag,
   syndicateZh:syn.nameZh,
   syndicateEn:syn.nameEn,
   hubZh:syn.hubZh,
   hubEn:syn.hubEn,
   tierKey,
   tierIndex:tierOverride?.tierIndex??deck.tierIndex,
   tierLabelZh:tierOverride?.tierLabelZh??deck.tierLabelZh,
   tierLabelEn:tierOverride?.tierLabelEn??deck.tierLabelEn,
   minLevel:tierOverride?.minLevel??deck.minLevel,
   maxLevel:tierOverride?.maxLevel??deck.maxLevel,
   rarity:reward.rarity,
   itemId:reward.itemId,
   zh:reward.zh,
   en:reward.en,
   quantity:reward.quantity,
   category:reward.category,
   chance:reward.chance,
   finalChance:reward.finalChance,
   rotations:deck.rotation?[deck.rotation]:[],
   rotatesRewards:syn.rotatesRewards,
   activeNow:activeJobIds.length>0,
   activeJobIds,
  });
 };

 for(const deck of Object.values(catalog.decks)){
  for(const synTag of deck.applicableSyndicates){
   for(const reward of deck.rewards){
    registerRow(synTag,deck,reward);
    // Steel Path Tier 6 in Cetus / Solaris / Entrati uses the same Tier 5 (E) reward deck.
    if(deck.tierKey==='tier5'&&['CetusSyndicate','SolarisSyndicate','EntratiSyndicate'].includes(synTag)){
     registerRow(synTag,deck,reward,{
      tierKey:'steelPath',
      tierIndex:6,
      tierLabelZh:'钢铁之路',
      tierLabelEn:'Steel Path',
      minLevel:100,
      maxLevel:100,
     });
    }
   }
  }
 }

 const rarityWeight:Record<BountyRarity,number>={rare:0,uncommon:1,common:2};
 return [...merged.values()].sort((a,b)=>{
  const synOrder=BOUNTY_SYNDICATE_ORDER.indexOf(a.syndicate as typeof BOUNTY_SYNDICATE_ORDER[number])
   -BOUNTY_SYNDICATE_ORDER.indexOf(b.syndicate as typeof BOUNTY_SYNDICATE_ORDER[number]);
  if(synOrder!==0)return synOrder;
  if(a.tierIndex!==b.tierIndex)return a.tierIndex-b.tierIndex;
  if(a.rarity!==b.rarity)return rarityWeight[a.rarity]-rarityWeight[b.rarity];
  return a.zh.localeCompare(b.zh,'zh-CN');
 });
}

export function filterCatalogRewardRows(
 rows:readonly BountyCatalogRewardRow[],
 filter:BountyBrowseFilter,
 priceIndex?:BountyPriceIndex,
):BountyCatalogRewardRow[]{
 return rows.filter(row=>{
  if(filter.syndicate!=='all'&&row.syndicate!==filter.syndicate)return false;
  if(filter.tierKey!=='all'&&row.tierKey!==filter.tierKey)return false;
  if(filter.rarity!=='all'&&row.rarity!==filter.rarity)return false;
  if(filter.availability==='active'&&!row.activeNow)return false;
  if(filter.availability==='waiting'&&row.activeNow)return false;
  if(filter.tradableOnly&&priceIndex&&resolveBountyItemPrice(row,priceIndex).state==='untradable')return false;
  if(filter.query.trim()){
   return searchText(
    filter.query,
    row.zh,
    row.en,
    row.syndicateZh,
    row.syndicateEn,
    row.hubZh,
    row.hubEn,
    row.tierLabelZh,
    row.tierLabelEn,
    rarityShortLabel(row.rarity,false),
    rarityShortLabel(row.rarity,true),
   );
  }
  return true;
 });
}

export function catalogDecksForRotation(
 catalog:BountyCatalog,
 syndicateTag:string,
 rotation:BountyRotation,
):BountyCatalogDeck[]{
 return Object.values(catalog.decks)
  .filter(deck=>
   deck.applicableSyndicates.includes(syndicateTag)
   &&deck.rotation===rotation
   &&!deck.isEvent,
  )
  .sort((a,b)=>a.tierIndex-b.tierIndex);
}

const VALID_BOUNTY_SYNDICATES=new Set<string>(BOUNTY_SYNDICATE_ORDER);

export function syndicateIconPath(tag:string):string{
 return VALID_BOUNTY_SYNDICATES.has(tag)?`/syndicates/${tag}.png`:'/reference/ui/world.png';
}

export type BountyTierTone='t1'|'t2'|'t3'|'t4'|'t5'|'sp'|'narmer'|'vault'|'lich'|'event';

export function bountyTierVisual(
 job:Pick<BountyJob,'tierKey'|'tierIndex'|'isSteelPath'|'isNarmer'|'isVault'>,
):{badge:string;tone:BountyTierTone;icon?:string}{
 if(job.isSteelPath||job.tierKey==='steelPath'||job.tierKey==='plagueStarSp'){
  return {badge:'SP',tone:'sp',icon:'/reference/ui/expert.png'};
 }
 if(job.isNarmer||job.tierKey==='narmer'){
  return {badge:'N',tone:'narmer',icon:'/reference/ui/crown.png'};
 }
 if(job.tierKey==='vault1'||job.tierKey==='vault2'||job.tierKey==='vault3'||job.isVault){
  const suffix=/^\w*?(\d)$/.exec(job.tierKey)?.[1]??String(Math.max(1,job.tierIndex));
  return {badge:`V${suffix}`,tone:'vault'};
 }
 if(job.tierKey==='lich'){
  return {badge:'C',tone:'lich',icon:'/reference/ui/warning.png'};
 }
 if(job.tierKey==='ghoul1'||job.tierKey==='ghoul2'||job.tierKey==='plagueStar'){
  return {badge:'E',tone:'event'};
 }
 const tones=['t1','t2','t3','t4','t5'] as const;
 const clamped=Math.min(4,Math.max(0,job.tierIndex-1));
 return {badge:String(Math.max(1,job.tierIndex)),tone:tones[clamped]};
}

export function resolveBountyRewardIcon(
 reward:Pick<BountyReward,'itemId'|'en'|'category'>,
 catalogIcons:Readonly<Record<string,string>>,
):{src:string;isModCard:boolean}{
 const direct=catalogIcons[reward.itemId];
 if(direct){
  return {src:direct,isModCard:direct.startsWith('/reference/mod-cards/')};
 }
 if(reward.category==='aya'||reward.itemId==='/Lotus/Types/Items/MiscItems/SchismKey'){
  return {src:'/reference/ui/aya.webp',isModCard:false};
 }
 if(reward.category==='endo'){
  return {src:'/reference/ui/endo.png',isModCard:false};
 }
 if(reward.category==='credits'){
  return {src:'/reference/ui/credits.png',isModCard:false};
 }
 if(reward.category==='relic'){
  const lower=`${reward.en} ${reward.itemId}`.toLowerCase();
  if(lower.includes('lith')||lower.includes('t1void'))return {src:'/reference/ui/fissure-tier-lith.png',isModCard:false};
  if(lower.includes('meso')||lower.includes('t2void'))return {src:'/reference/ui/fissure-tier-meso.png',isModCard:false};
  if(lower.includes('neo')||lower.includes('t3void'))return {src:'/reference/ui/fissure-tier-neo.png',isModCard:false};
  if(lower.includes('axi')||lower.includes('t4void'))return {src:'/reference/ui/fissure-tier-axi.png',isModCard:false};
  if(lower.includes('requiem')||lower.includes('t5void'))return {src:'/reference/ui/fissure-tier-requiem.png',isModCard:false};
  return {src:'/reference/ui/fissure.webp',isModCard:false};
 }
 if(reward.itemId.includes('/Upgrades/Focus/')){
  if(reward.itemId.includes('AttackLens'))return {src:'/reference/polarities/madurai.png',isModCard:false};
  if(reward.itemId.includes('DefenseLens'))return {src:'/reference/polarities/vazarin.png',isModCard:false};
  if(reward.itemId.includes('TacticLens'))return {src:'/reference/polarities/naramon.png',isModCard:false};
  return {src:'/reference/ui/mastery.png',isModCard:false};
 }
 if(reward.itemId.includes('OroFusexOrnament')){
  return {src:'/reference/ui/star2.png',isModCard:false};
 }
 if(reward.category==='mod')return {src:'/reference/ui/mods.png',isModCard:false};
 if(reward.category==='blueprint')return {src:'/reference/ui/build.png',isModCard:false};
 if(reward.category==='lore')return {src:'/reference/ui/book.png',isModCard:false};
 return {src:'/reference/ui/ingredient.png',isModCard:false};
}

export function cleanChallengeDesc(desc:string):string{
 const stripped=desc
  .replace(/\|OPEN_COLOR\|[\s\S]*?\|CLOSE_COLOR\|/g,'')
  .replace(/\|[A-Z_]+\|/g,'')
  .replace(/\r\n/g,'\n')
  .split('\n')
  .map(line=>line.trim())
  .filter(Boolean)
  .join(' ')
  .trim();
 if(!stripped)return '';
 return stripped.replace(/\s*[（(][^）)]*[）)]/g,'').trim()||stripped;
}

export type BountyFeaturedReward={
 reward:BountyReward;
 tierKey:string;
 syndicate:string;
 jobId:string;
};

export function extractNarmerHighlights(
 bounties:readonly BountySyndicate[],
):{job:BountyJob;items:BountyFeaturedReward[]}|null{
 const job=bounties.flatMap(s=>s.jobs).find(j=>j.tierKey==='narmer'||j.isNarmer);
 if(!job)return null;
 const picked:BountyFeaturedReward[]=[];
 const seen=new Set<string>();
 for(const group of [
  job.rewards.filter(r=>r.category==='blueprint'),
  job.rewards.filter(r=>r.category==='mod'),
 ]){
  for(const reward of group){
   if(seen.has(reward.itemId))continue;
   seen.add(reward.itemId);
   picked.push({reward,tierKey:job.tierKey,syndicate:job.syndicate,jobId:job.id});
   if(picked.length>=5)return {job,items:picked};
  }
 }
 return picked.length?{job,items:picked}:null;
}

export function extractHubFeaturedRewards(
 syndicate:BountySyndicate,
):{labelZh:string;labelEn:string;items:BountyFeaturedReward[]}{
 const picked:BountyFeaturedReward[]=[];
 const seen=new Set<string>();
 const add=(job:BountyJob|undefined,pred:(r:BountyReward)=>boolean,limit:number)=>{
  if(!job)return;
  for(const reward of job.rewards){
   if(picked.length>=limit)return;
   if(seen.has(reward.itemId)||!pred(reward))continue;
   seen.add(reward.itemId);
   picked.push({reward,tierKey:job.tierKey,syndicate:job.syndicate,jobId:job.id});
  }
 };
 const byTier=(key:string)=>syndicate.jobs.find(j=>j.tierKey===key);
 if(syndicate.tag==='CetusSyndicate'){
  for(const key of ['tier4','tier3','tier2','tier1']){
   add(byTier(key),r=>r.category==='mod',8);
  }
  return {labelZh:'MOD 轮换',labelEn:'Mods',items:picked};
 }
 if(syndicate.tag==='SolarisSyndicate'){
  for(const key of ['tier1','tier2','tier3','tier4','tier5']){
   add(byTier(key),r=>r.zh.includes('债券')||r.en.includes('Debt-Bond'),8);
  }
  for(const key of ['tier5','tier4','tier3','tier2']){
   add(byTier(key),r=>r.category==='mod',8);
  }
  return {labelZh:'债券 · MOD',labelEn:'Bonds & Mods',items:picked};
 }
 if(syndicate.tag==='EntratiSyndicate'){
  for(const job of syndicate.jobs.filter(j=>j.isVault)){
   add(
    job,
    r=>r.category==='blueprint'||/蓝图|枪机|枪管|枪托|Blueprint|Barrel|Receiver|Stock/i.test(`${r.zh} ${r.en}`),
    6,
   );
  }
  for(const key of ['tier4','tier3','tier2']){
   add(byTier(key),r=>r.category==='mod',6);
  }
  return {labelZh:'隔离库 · MOD',labelEn:'Vault & Mods',items:picked};
 }
 return {labelZh:'',labelEn:'',items:[]};
}

export function pickOverviewJobs(syndicate:BountySyndicate):BountyJob[]{
 const pickKeys=(keys:string[])=>
  keys.map(k=>syndicate.jobs.find(j=>j.tierKey===k)).filter((j):j is BountyJob=>!!j);
 if(syndicate.tag==='CetusSyndicate'||syndicate.tag==='SolarisSyndicate'){
  const list=pickKeys(['steelPath','narmer']);
  return list.length?list:syndicate.jobs.slice(-2);
 }
 if(syndicate.tag==='EntratiSyndicate'){
  const list=pickKeys(['tier5','steelPath']);
  return list.length?list:syndicate.jobs.filter(j=>!j.isVault).slice(-2);
 }
 if(syndicate.tag==='ZarimanSyndicate'||syndicate.tag==='EntratiLabSyndicate'){
  const list=pickKeys(['tier3','tier4','tier5']);
  return list.length?list:syndicate.jobs.slice(-3);
 }
 if(syndicate.tag==='HexSyndicate'){
  const list=pickKeys(['tier5','tier6','lich']);
  return list.length?list:syndicate.jobs.slice(-3);
 }
 return syndicate.jobs.slice(0,3);
}

const PROJECTION_PREFIX='/Lotus/Types/Game/Projections/';
const EMPTY_PRICE_INDEX:BountyPriceIndex={
 byGameRef:new Map(),
 byEnName:new Map(),
};

/** Normalize relic itemIds from bounty decks by stripping Bronze/Silver/Gold tier suffixes. */
export function normalizeBountyGameRef(itemId:string):string{
 if(itemId.startsWith(PROJECTION_PREFIX)){
  return itemId.replace(/(Bronze|Silver|Gold)$/,'');
 }
 return itemId;
}

export function buildBountyPriceIndex(rows:readonly MarketRankingRow[]|undefined):BountyPriceIndex{
 if(!rows?.length)return EMPTY_PRICE_INDEX;
 const byGameRef=new Map<string,MarketRankingRow>();
 const byEnName=new Map<string,MarketRankingRow>();
 for(const row of rows){
  if(row.gameRef&&!byGameRef.has(row.gameRef)){
   byGameRef.set(row.gameRef,row);
  }
  const enName=row.i18n?.en?.name?.trim().toLowerCase();
  if(enName&&!byEnName.has(enName)){
   byEnName.set(enName,row);
  }
 }
 return {byGameRef,byEnName};
}

function lookupMarketRow(
 reward:{itemId:string;en?:string|null},
 index:BountyPriceIndex,
):MarketRankingRow|undefined{
 const direct=index.byGameRef.get(reward.itemId);
 if(direct)return direct;
 const normalized=normalizeBountyGameRef(reward.itemId);
 if(normalized!==reward.itemId){
  const byNormalized=index.byGameRef.get(normalized);
  if(byNormalized)return byNormalized;
 }
 if(reward.itemId.startsWith('@endo:')||reward.itemId.startsWith('@credits:')){
  return undefined;
 }
 const enKey=reward.en?.trim().toLowerCase();
 return enKey?index.byEnName.get(enKey):undefined;
}

export function resolveBountyItemPrice(
 reward:{itemId:string;en?:string|null;quantity?:number},
 index:BountyPriceIndex,
):BountyItemPrice{
 const row=lookupMarketRow(reward,index);
 if(!row){
  return {
   slug:null,
   state:'untradable',
   unitPrice:null,
   totalPrice:null,
   stale:false,
   sampleCount:null,
   fetchedAt:null,
   error:null,
  };
 }
 const qty=Math.max(1,reward.quantity??1);
 const hasUnitPrice=typeof row.unitPrice==='number'&&Number.isFinite(row.unitPrice)&&row.unitPrice>=0;
 const unitPrice=hasUnitPrice?row.unitPrice:null;
 const state:BountyPriceState=unitPrice!==null
  ?'priced'
  :row.lastError
   ?'error'
   :row.priceFetchedAt
    ?'no-orders'
    :'pending';
 return {
  slug:row.slug,
  state,
  unitPrice,
  totalPrice:unitPrice!==null?unitPrice*qty:null,
  stale:Boolean(row.stale),
  sampleCount:typeof row.sampleCount==='number'?row.sampleCount:null,
  fetchedAt:row.priceFetchedAt??null,
  error:row.lastError??null,
 };
}

export function formatPlatinumNumber(value:number):string{
 if(Math.abs(value-Math.round(value))<0.05)return String(Math.round(value));
 return value.toFixed(1);
}

export function formatPlatinum(value:number):string{
 return `${formatPlatinumNumber(value)}p`;
}

export function sortCatalogRewardRows(
 rows:readonly BountyCatalogRewardRow[],
 sortMode:BountySortMode,
 priceIndex:BountyPriceIndex,
):BountyCatalogRewardRow[]{
 if(sortMode==='default')return [...rows];
 const desc=sortMode==='platinum-desc';
 const decorated=rows.map((row,index)=>({
  row,
  index,
  price:resolveBountyItemPrice(row,priceIndex),
 }));
 decorated.sort((a,b)=>{
  const rank=(state:BountyPriceState)=>state==='priced'?0:state==='untradable'?2:1;
  const tierDiff=rank(a.price.state)-rank(b.price.state);
  if(tierDiff!==0)return tierDiff;
  if(a.price.state==='priced'&&b.price.state==='priced'){
   const totalDiff=desc
    ?(b.price.totalPrice!)-(a.price.totalPrice!)
    :(a.price.totalPrice!)-(b.price.totalPrice!);
   if(totalDiff!==0)return totalDiff;
   const unitDiff=desc
    ?(b.price.unitPrice!)-(a.price.unitPrice!)
    :(a.price.unitPrice!)-(b.price.unitPrice!);
   if(unitDiff!==0)return unitDiff;
   if(a.row.activeNow!==b.row.activeNow)return a.row.activeNow?-1:1;
   if(a.row.chance!==b.row.chance)return b.row.chance-a.row.chance;
   return a.index-b.index;
  }
  if(a.price.state!=='untradable'&&a.row.activeNow!==b.row.activeNow){
   return a.row.activeNow?-1:1;
  }
  return a.index-b.index;
 });
 return decorated.map(entry=>entry.row);
}

export function collectBountyWarmupSlugs(
 rewards:readonly Pick<BountyReward,'itemId'|'en'>[],
 priceIndex:BountyPriceIndex,
 limit=60,
):string[]{
 if(limit<=0)return [];
 const out:string[]=[];
 const seen=new Set<string>();
 for(const reward of rewards){
  const row=lookupMarketRow(reward,priceIndex);
  if(!row||seen.has(row.slug))continue;
  // Skip rows already carrying a fresh quote to avoid flooding the global wm_rate queue.
  if(!row.stale&&Boolean(row.priceFetchedAt))continue;
  seen.add(row.slug);
  out.push(row.slug);
  if(out.length>=limit)break;
 }
 return out;
}

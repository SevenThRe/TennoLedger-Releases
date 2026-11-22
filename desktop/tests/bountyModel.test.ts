import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
 BOUNTY_SYNDICATE_ORDER,
 bountyRotationProgress,
 bountyTierVisual,
 buildCatalogRewardRows,
 cleanBountyTitle,
 cleanChallengeDesc,
 createBountySubscription,
 defaultBountyPreferences,
 extractHubFeaturedRewards,
 extractNarmerHighlights,
 filterCatalogRewardRows,
 findActiveBountyMatches,
 findMatchingSubscription,
 groupRewardsByRarity,
 matchesBountySubscription,
 pickOverviewJobs,
 rarityLabel,
 resolveBountyRewardIcon,
 syndicateIconPath,
 syndicateLabel,
 tierLabel,
 toggleBountySubscriptionList,
 type BountyCatalog,
 type BountyJob,
 type BountySyndicate,
} from '../src/bountyModel.ts';

const catalogPath=path.resolve(import.meta.dirname,'../public/bounty-catalog.json');
const catalog=JSON.parse(fs.readFileSync(catalogPath,'utf-8')) as BountyCatalog;

const sampleJob=(overrides:Partial<BountyJob>={}):BountyJob=>({
 id:'CetusSyndicate:tier2:1000',
 syndicate:'CetusSyndicate',
 jobType:'/Lotus/Types/Gameplay/Eidolon/Jobs/CaptureBountyCapTwo',
 titleZh:'间谍捕手',
 titleEn:'SPY CATCHER',
 tierKey:'tier2',
 tierIndex:2,
 tierLabelZh:'2级赏金',
 tierLabelEn:'Tier 2 Bounty',
 minLevel:10,
 maxLevel:30,
 masteryReq:1,
 standingStages:[580,580,580],
 standingTotal:1740,
 rewardDeck:'/Lotus/Types/Game/MissionDecks/EidolonJobMissionRewards/TierBTableARewards',
 rotation:'A',
 isSteelPath:false,
 isNarmer:false,
 isVault:false,
 isEndless:false,
 nodeId:null,
 nodeZh:null,
 nodeEn:null,
 missionType:null,
 challengeId:null,
 challengeZh:null,
 challengeEn:null,
 allyZh:null,
 allyEn:null,
 activation:'2026-11-21T10:00:00.000Z',
 expiry:'2026-11-21T12:30:00.000Z',
 rewards:catalog.decks['/Lotus/Types/Game/MissionDecks/EidolonJobMissionRewards/TierBTableARewards'].rewards,
 ...overrides,
});

test('subscription matching handles specific Cetus Tier 2 silver item, whole rarity, cross-tier, Zariman mission+challenge, and disabled rules',()=>{
 const cetusTier2A=sampleJob();
 const cetusTier2B=sampleJob({
  id:'CetusSyndicate:tier2:2000',
  rewardDeck:'/Lotus/Types/Game/MissionDecks/EidolonJobMissionRewards/TierBTableBRewards',
  rotation:'B',
  rewards:catalog.decks['/Lotus/Types/Game/MissionDecks/EidolonJobMissionRewards/TierBTableBRewards'].rewards,
 });

 const silverTarget=createBountySubscription({
  syndicate:'CetusSyndicate',
  tierKey:'tier2',
  rarity:'uncommon',
  itemId:'/Lotus/Upgrades/Mods/Rifle/SniperReloadDamageMod',
  itemNameZh:'蓄力装填',
  itemNameEn:'Charged Chamber',
 },'2026-11-21T09:00:00.000Z','sub-1');

 const matchedA=matchesBountySubscription(silverTarget,cetusTier2A);
 assert.ok(matchedA);
 assert.equal(matchedA.length,1);
 assert.equal(matchedA[0].zh,'蓄力装填');
 assert.equal(matchesBountySubscription(silverTarget,cetusTier2B),null);

 // Whole rarity match (all silver rewards in Tier 2)
 const wholeSilver=createBountySubscription({
  syndicate:'CetusSyndicate',
  tierKey:'tier2',
  rarity:'uncommon',
 },'2026-11-21T09:00:00.000Z','sub-2');
 assert.equal(matchesBountySubscription(wholeSilver,cetusTier2A)?.length,4);

 // Cross-tier Aya tracking
 const crossTierAya=createBountySubscription({
  syndicate:'CetusSyndicate',
  tierKey:'all',
  rarity:'uncommon',
  itemId:'/Lotus/Types/Items/MiscItems/SchismKey',
 },'2026-11-21T09:00:00.000Z','sub-3');
 assert.equal(matchesBountySubscription(crossTierAya,cetusTier2B)?.[0].zh,'阿耶精华');

 // Zariman missionType + challenge match
 const zarimanJob=sampleJob({
  id:'ZarimanSyndicate:tier1:1000',
  syndicate:'ZarimanSyndicate',
  tierKey:'tier1',
  tierIndex:1,
  rotation:null,
  missionType:'Extermination',
  challengeId:'/Lotus/Types/Challenges/Zariman/ZarimanUseVoidRiftsEasyChallenge',
  rewards:catalog.decks['/Lotus/Types/Game/MissionDecks/ZarimanJobMissionRewards/TierATableRewards'].rewards,
 });
 const zarimanSub=createBountySubscription({
  syndicate:'ZarimanSyndicate',
  tierKey:'all',
  rarity:'all',
  missionType:'Extermination',
  challengeId:'/Lotus/Types/Challenges/Zariman/ZarimanUseVoidRiftsEasyChallenge',
 },'2026-11-21T09:00:00.000Z','sub-4');
 assert.deepEqual(matchesBountySubscription(zarimanSub,zarimanJob),[]);
 assert.equal(matchesBountySubscription({...zarimanSub,missionType:'Survival'},zarimanJob),null);

 // Disabled rule never matches
 assert.equal(matchesBountySubscription({...silverTarget,enabled:false},cetusTier2A),null);
});

test('catalog reward explorer merges A/B/C rotations, expands Steel Path Tier 6, and filters by Chinese, English, and Pinyin',()=>{
 const cetusTier2B=sampleJob({
  rewardDeck:'/Lotus/Types/Game/MissionDecks/EidolonJobMissionRewards/TierBTableBRewards',
  rotation:'B',
  rewards:catalog.decks['/Lotus/Types/Game/MissionDecks/EidolonJobMissionRewards/TierBTableBRewards'].rewards,
 });
 const activeSyndicates:BountySyndicate[]=[{
  tag:'CetusSyndicate',
  nameZh:'希图斯',
  nameEn:'Ostrons',
  hubZh:'夜灵平野',
  hubEn:'Plains of Eidolon',
  rotatesRewards:true,
  rotation:'B',
  vaultRotation:null,
  activation:'2026-11-21T10:00:00.000Z',
  expiry:'2026-11-21T12:30:00.000Z',
  jobs:[cetusTier2B],
 }];
 const now=Date.parse('2026-11-21T11:00:00.000Z');
 const rows=buildCatalogRewardRows(catalog,activeSyndicates,now);

 // Cetus Tier 2 Charged Chamber is only in Table A -> waiting while Table B is active
 const charged=rows.find(r=>
  r.syndicate==='CetusSyndicate'&&r.tierKey==='tier2'&&r.rarity==='uncommon'&&r.en==='Charged Chamber',
 );
 assert.ok(charged);
 assert.deepEqual(charged.rotations,['A']);
 assert.equal(charged.activeNow,false);

 // Speed Trigger is in Table B -> active right now
 const speedTrigger=rows.find(r=>
  r.syndicate==='CetusSyndicate'&&r.tierKey==='tier2'&&r.rarity==='uncommon'&&r.en==='Speed Trigger',
 );
 assert.ok(speedTrigger);
 assert.deepEqual(speedTrigger.rotations,['B']);
 assert.equal(speedTrigger.activeNow,true);

 // Gara Systems Blueprint appears in A, B, and C
 const garaSys=rows.find(r=>
  r.syndicate==='CetusSyndicate'&&r.tierKey==='tier2'&&r.rarity==='uncommon'&&r.en==='Gara Systems Blueprint',
 );
 assert.ok(garaSys);
 assert.deepEqual(garaSys.rotations,['A','B','C']);
 assert.equal(garaSys.activeNow,true);

 // Steel Path Tier 6 expansion exists for Cetus/Solaris/Entrati
 assert.ok(rows.some(r=>r.syndicate==='CetusSyndicate'&&r.tierKey==='steelPath'));

 // Chinese, English, and Pinyin queries
 assert.ok(filterCatalogRewardRows(rows,{query:'蓄力装填',syndicate:'CetusSyndicate',tierKey:'tier2',rarity:'uncommon',availability:'waiting'}).some(r=>r.en==='Charged Chamber'));
 assert.ok(filterCatalogRewardRows(rows,{query:'xlzt',syndicate:'CetusSyndicate',tierKey:'tier2',rarity:'uncommon',availability:'all'}).some(r=>r.en==='Charged Chamber'));
 assert.ok(filterCatalogRewardRows(rows,{query:'Speed Trigger',syndicate:'CetusSyndicate',tierKey:'tier2',rarity:'uncommon',availability:'active'}).some(r=>r.en==='Speed Trigger'));
});

test('subscription toggle is idempotent and active match + progress helpers handle boundaries',()=>{
 const target={
  syndicate:'CetusSyndicate',
  tierKey:'tier2',
  rarity:'uncommon' as const,
  itemId:'/Lotus/Upgrades/Mods/Rifle/SniperReloadDamageMod',
  itemNameZh:'蓄力装填',
  itemNameEn:'Charged Chamber',
 };
 const first=toggleBountySubscriptionList([],target,'2026-11-21T09:00:00.000Z');
 assert.equal(first.added,true);
 assert.equal(first.subscriptions.length,1);
 assert.ok(findMatchingSubscription(first.subscriptions,target));

 const second=toggleBountySubscriptionList(first.subscriptions,target,'2026-11-21T09:05:00.000Z');
 assert.equal(second.added,false);
 assert.equal(second.subscriptions.length,0);

 const job=sampleJob();
 const groups=groupRewardsByRarity(job.rewards);
 assert.equal(groups.common.length,4);
 assert.equal(groups.uncommon.length,4);
 assert.equal(groups.rare.length,1);

 const prefs={...defaultBountyPreferences(),subscriptions:first.subscriptions};
 const syndicates:BountySyndicate[]=[{
  tag:'CetusSyndicate',
  nameZh:'希图斯',
  nameEn:'Ostrons',
  hubZh:'夜灵平野',
  hubEn:'Plains of Eidolon',
  rotatesRewards:true,
  rotation:'A',
  vaultRotation:null,
  activation:job.activation,
  expiry:job.expiry,
  jobs:[job],
 }];
 assert.equal(findActiveBountyMatches(syndicates,prefs,Date.parse('2026-11-21T11:00:00.000Z')).length,1);
 assert.equal(findActiveBountyMatches(syndicates,prefs,Date.parse('2026-11-21T12:30:00.000Z')).length,0);

 assert.equal(bountyRotationProgress(job.activation,job.expiry,Date.parse('2026-11-21T09:00:00.000Z')),0);
 assert.equal(bountyRotationProgress(job.activation,job.expiry,Date.parse('2026-11-21T11:15:00.000Z')),50);
 assert.equal(bountyRotationProgress(job.activation,job.expiry,Date.parse('2026-11-21T13:00:00.000Z')),100);
});

test('visual tier badges, syndicate icons, reward artwork resolver, and concise labels work without UI deps',()=>{
 assert.equal(syndicateIconPath('CetusSyndicate'),'/syndicates/CetusSyndicate.png');
 assert.equal(syndicateIconPath('HexSyndicate'),'/syndicates/HexSyndicate.png');
 assert.equal(syndicateIconPath('UnknownSyndicate'),'/reference/ui/world.png');

 assert.deepEqual(bountyTierVisual({tierKey:'tier2',tierIndex:2,isSteelPath:false,isNarmer:false,isVault:false}),{badge:'2',tone:'t2'});
 assert.deepEqual(bountyTierVisual({tierKey:'steelPath',tierIndex:6,isSteelPath:true,isNarmer:false,isVault:false}),{badge:'SP',tone:'sp',icon:'/reference/ui/expert.png'});
 assert.deepEqual(bountyTierVisual({tierKey:'narmer',tierIndex:7,isSteelPath:false,isNarmer:true,isVault:false}),{badge:'N',tone:'narmer',icon:'/reference/ui/crown.png'});
 assert.deepEqual(bountyTierVisual({tierKey:'vault2',tierIndex:2,isSteelPath:false,isNarmer:false,isVault:true}),{badge:'V2',tone:'vault'});
 assert.deepEqual(bountyTierVisual({tierKey:'lich',tierIndex:7,isSteelPath:false,isNarmer:false,isVault:false}),{badge:'C',tone:'lich',icon:'/reference/ui/warning.png'});

 const iconMap={
  '/Lotus/Upgrades/Mods/Rifle/SniperReloadDamageMod':'/reference/mod-cards/abc.webp',
  '/Lotus/Types/Items/MiscItems/Nistlepod':'/reference/artwork/xyz.png',
 };
 assert.deepEqual(resolveBountyRewardIcon({itemId:'/Lotus/Upgrades/Mods/Rifle/SniperReloadDamageMod',en:'Charged Chamber',category:'mod'},iconMap),{src:'/reference/mod-cards/abc.webp',isModCard:true});
 assert.deepEqual(resolveBountyRewardIcon({itemId:'/Lotus/Types/Items/MiscItems/Nistlepod',en:'Nistlepod',category:'item'},iconMap),{src:'/reference/artwork/xyz.png',isModCard:false});
 assert.deepEqual(resolveBountyRewardIcon({itemId:'/Lotus/Types/Items/MiscItems/SchismKey',en:'Aya',category:'aya'},iconMap),{src:'/reference/ui/aya.webp',isModCard:false});
 assert.deepEqual(resolveBountyRewardIcon({itemId:'@endo:600',en:'600 Endo',category:'endo'},iconMap),{src:'/reference/ui/endo.png',isModCard:false});
 assert.deepEqual(resolveBountyRewardIcon({itemId:'@credits:4500',en:'4,500 Credits',category:'credits'},iconMap),{src:'/reference/ui/credits.png',isModCard:false});
 assert.deepEqual(resolveBountyRewardIcon({itemId:'/Lotus/Types/Game/Projections/T2VoidProjection',en:'Meso D8 Relic',category:'relic'},iconMap),{src:'/reference/ui/fissure-tier-meso.png',isModCard:false});
 assert.deepEqual(resolveBountyRewardIcon({itemId:'/Lotus/Upgrades/Focus/AttackLens',en:'Madurai Lens',category:'item'},iconMap),{src:'/reference/polarities/madurai.png',isModCard:false});

 assert.equal(rarityLabel('uncommon',false),'银奖励');
 assert.equal(rarityLabel('uncommon',true),'Silver');
 assert.equal(syndicateLabel('CetusSyndicate',catalog,false),'夜灵平野');
 assert.equal(syndicateLabel('all',catalog,false),'全部平原');
 assert.equal(tierLabel('tier2',false),'2级');
 assert.equal(tierLabel('narmer',false),'合一众');
 assert.equal(tierLabel('lich',false),'终结者');
 assert.equal(cleanBountyTitle('大起大落（合一众）'),'大起大落');
 assert.equal(cleanBountyTitle('Rise and Fall (Narmer)'),'Rise and Fall');

 assert.equal(
  cleanChallengeDesc('|OPEN_COLOR|杀毒赏金任务|CLOSE_COLOR|\r\n从高处击杀 50 名敌人'),
  '从高处击杀 50 名敌人',
 );
 assert.equal(
  cleanChallengeDesc('|OPEN_COLOR||ALLY|的赏金任务|CLOSE_COLOR|\r\n使用战甲技能击杀 10 名敌人'),
  '使用战甲技能击杀 10 名敌人',
 );

 const cetusOverviewSyndicate:BountySyndicate={
  tag:'CetusSyndicate',
  nameZh:'希图斯',
  nameEn:'Ostrons',
  hubZh:'夜灵平野',
  hubEn:'Plains of Eidolon',
  rotatesRewards:true,
  rotation:'B',
  vaultRotation:null,
  activation:'2026-11-21T10:00:00.000Z',
  expiry:'2026-11-21T12:30:00.000Z',
  jobs:[
   sampleJob({
    id:'cetus:t2',
    tierKey:'tier2',
    tierIndex:2,
    rewards:catalog.decks['/Lotus/Types/Game/MissionDecks/EidolonJobMissionRewards/TierBTableBRewards'].rewards,
   }),
   sampleJob({
    id:'cetus:t4',
    tierKey:'tier4',
    tierIndex:4,
    rewards:catalog.decks['/Lotus/Types/Game/MissionDecks/EidolonJobMissionRewards/TierDTableBRewards'].rewards,
   }),
   sampleJob({
    id:'cetus:sp',
    tierKey:'steelPath',
    tierIndex:6,
    isSteelPath:true,
    rewards:catalog.decks['/Lotus/Types/Game/MissionDecks/EidolonJobMissionRewards/TierETableBRewards'].rewards,
   }),
   sampleJob({
    id:'cetus:narmer',
    tierKey:'narmer',
    tierIndex:7,
    isNarmer:true,
    rewards:catalog.decks['/Lotus/Types/Game/MissionDecks/EidolonJobMissionRewards/NarmerTableBRewards'].rewards,
   }),
  ],
 };
 const featured=extractHubFeaturedRewards(cetusOverviewSyndicate);
 assert.equal(featured.labelZh,'MOD 轮换');
 assert.ok(featured.items.length>0);
 assert.ok(featured.items.every(i=>i.reward.category==='mod'));

 const narmer=extractNarmerHighlights([cetusOverviewSyndicate]);
 assert.ok(narmer);
 assert.equal(narmer.items[0].reward.category,'blueprint');
 assert.equal(pickOverviewJobs(cetusOverviewSyndicate).map(j=>j.tierKey).join(','),'steelPath,narmer');

 const solarisBonds:BountySyndicate={
  tag:'SolarisSyndicate',
  nameZh:'索拉里斯联盟',
  nameEn:'Solaris United',
  hubZh:'奥布山谷',
  hubEn:'Orb Vallis',
  rotatesRewards:true,
  rotation:'B',
  vaultRotation:null,
  activation:'2026-11-21T10:00:00.000Z',
  expiry:'2026-11-21T12:30:00.000Z',
  jobs:[
   sampleJob({
    id:'sol:t1',
    syndicate:'SolarisSyndicate',
    tierKey:'tier1',
    tierIndex:1,
    rewards:catalog.decks['/Lotus/Types/Game/MissionDecks/VenusJobMissionRewards/VenusTierATableBRewards'].rewards,
   }),
  ],
 };
 assert.ok(extractHubFeaturedRewards(solarisBonds).items.some(i=>i.reward.zh.includes('债券')));
});

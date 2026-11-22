import {useEffect,useMemo,useState} from 'react';
import {native} from './api';
import type {MarketRankingRow} from './marketRankingModel';
import {useMarketPrices} from './useMarketPrices';
import {useWorld,worldQA} from './WorldProvider';
import {
 defaultBountyPreferences,
 findActiveBountyMatches,
 toggleBountySubscriptionList,
 type BountyCatalog,
 type BountyPreferences,
 type BountySubscriptionTarget,
} from './bountyModel';
import {playNotificationChime,unlockNotificationAudio} from './notificationSound';

let catalogRequest:Promise<BountyCatalog|null>|undefined;
let itemIconsRequest:Promise<Record<string,string>>|undefined;
let previewMarketRowsRequest:Promise<MarketRankingRow[]>|undefined;

const QA_BOUNTY_PREVIEW_QUOTES:Record<string,{unitPrice:number|null;sampleCount:number|null;noOrders?:boolean}>={
 augur_secrets:{unitPrice:18,sampleCount:5},
 gladiator_finesse:{unitPrice:14,sampleCount:5},
 amars_anguish:{unitPrice:22,sampleCount:5},
 boreals_hatred:{unitPrice:15,sampleCount:5},
 niras_contempt:{unitPrice:16,sampleCount:5},
 vigilante_armaments:{unitPrice:9,sampleCount:5},
 vigilante_supplies:{unitPrice:8,sampleCount:5},
 augur_reach:{unitPrice:7,sampleCount:5},
 gladiator_might:{unitPrice:6,sampleCount:5},
 gladiator_resolve:{unitPrice:5,sampleCount:5},
 blood_rush:{unitPrice:12,sampleCount:5},
 argon_scope:{unitPrice:25,sampleCount:5},
 damaged_necramech_weapon_barrel:{unitPrice:20,sampleCount:4},
 charged_chamber:{unitPrice:4,sampleCount:5},
 ayatan_amber_star:{unitPrice:2,sampleCount:5},
 madurai_lens:{unitPrice:6,sampleCount:5},
 stretch:{unitPrice:null,sampleCount:null,noOrders:true},
};

interface CatalogPartRef{
 itemId?:string;
}

interface CatalogIconItem{
 id?:string;
 image?:string;
 displayParts?:CatalogPartRef[];
 recipe?:{parts?:CatalogPartRef[]};
}

export function useBountyCatalog(){
 const [catalog,setCatalog]=useState<BountyCatalog|null>(null);
 useEffect(()=>{
  let live=true;
  catalogRequest??=fetch('/bounty-catalog.json')
   .then(response=>{
    if(!response.ok)throw Error('赏金目录加载失败');
    return response.json() as Promise<BountyCatalog>;
   })
   .catch(()=>{
    catalogRequest=undefined;
    return null;
   });
  void catalogRequest.then(value=>{
   if(live&&value)setCatalog(value);
  });
  return()=>{live=false;};
 },[]);
 return catalog;
}

export function useBountyItemIcons():Readonly<Record<string,string>>{
 const [icons,setIcons]=useState<Readonly<Record<string,string>>>({});
 useEffect(()=>{
  let live=true;
  itemIconsRequest??=fetch('/catalog.json')
   .then(response=>{
    if(!response.ok)throw Error('catalog');
    return response.json() as Promise<{items?:CatalogIconItem[]}>;
   })
   .then(data=>{
    const map:Record<string,string>={};
    for(const item of data.items??[]){
     if(!item.id||!item.image)continue;
     map[item.id]=item.image;
     for(const part of item.displayParts??[]){
      if(part.itemId&&!map[part.itemId])map[part.itemId]=item.image;
     }
     for(const part of item.recipe?.parts??[]){
      if(part.itemId&&!map[part.itemId])map[part.itemId]=item.image;
     }
    }
    return map;
   })
   .catch(()=>({}));
  void itemIconsRequest.then(value=>{
   if(live)setIcons(value);
  });
  return()=>{live=false;};
 },[]);
 return icons;
}

export function useBountyPriceRows():{
 rows:readonly MarketRankingRow[];
 loading:boolean;
 error:string;
 live:boolean;
}{
 const market=useMarketPrices();
 const [previewRows,setPreviewRows]=useState<readonly MarketRankingRow[]>([]);
 const [previewLoading,setPreviewLoading]=useState(false);

 useEffect(()=>{
  if(native)return;
  let live=true;
  setPreviewLoading(true);
  previewMarketRowsRequest??=fetch('/wm-prices.json')
   .then(response=>{
    if(!response.ok)throw Error(String(response.status));
    return response.json() as Promise<{rows?:MarketRankingRow[]}>;
   })
   .then(data=>Array.isArray(data.rows)?data.rows:[])
   .catch(()=>{
    previewMarketRowsRequest=undefined;
    return [] as MarketRankingRow[];
   });

  void previewMarketRowsRequest.then(rawRows=>{
   if(!live)return;
   const qaQuotes=worldQA&&new URLSearchParams(location.search).get('bountyPricePreview')==='1';
   const nowIso=new Date().toISOString();
   const normalized=rawRows.map(row=>{
    const qa=qaQuotes?QA_BOUNTY_PREVIEW_QUOTES[row.slug]:undefined;
    if(qa){
     return {
      ...row,
      unitPrice:qa.unitPrice,
      priceFetchedAt:qa.noOrders||qa.unitPrice!==null?nowIso:null,
      sampleCount:qa.sampleCount??undefined,
      stale:false,
      lastError:null,
     };
    }
    // Strip stale bundled quotes in preview so only verified tradability metadata stays active.
    return {
     ...row,
     unitPrice:null,
     priceFetchedAt:null,
     sampleCount:undefined,
     stale:true,
     lastError:null,
    };
   });
   setPreviewRows(normalized);
   setPreviewLoading(false);
  });

  return()=>{live=false;};
 },[]);

 if(native){
  return {
   rows:market.snapshot?.rows??[],
   loading:market.loading,
   error:market.error,
   live:true,
  };
 }
 return {
  rows:previewRows,
  loading:previewLoading,
  error:'',
  live:worldQA&&new URLSearchParams(location.search).get('bountyPricePreview')==='1',
 };
}

export function useBounties(){
 const world=useWorld();
 const catalog=useBountyCatalog();
 const itemIcons=useBountyItemIcons();
 const [now,setNow]=useState(()=>Date.now());
 const [error,setError]=useState('');

 useEffect(()=>{
  const timer=setInterval(()=>setNow(Date.now()),1000);
  return()=>clearInterval(timer);
 },[]);

 const bounties=world.status.bounties??[];
 const preferences=useMemo(
  ()=>({...defaultBountyPreferences(),...world.status.subscriptions.bountyPreferences}),
  [world.status.subscriptions.bountyPreferences],
 );
 const activeMatches=useMemo(
  ()=>findActiveBountyMatches(bounties,preferences,now),
  [bounties,preferences,now],
 );
 const canEdit=world.loaded&&!world.busy&&(native||worldQA);

 async function save(patch:Partial<BountyPreferences>){
  try{
   await world.save({
    ...world.status.subscriptions,
    bountyPreferences:{...preferences,...patch},
   });
   setError('');
   return true;
  }catch(e){
   setError(String(e));
   return false;
  }
 }

 async function toggleEnabled(){
  return save({enabled:!preferences.enabled});
 }

 async function toggleSound(){
  return save({soundEnabled:!preferences.soundEnabled});
 }

 async function toggleSubscription(target:BountySubscriptionTarget){
  const next=toggleBountySubscriptionList(preferences.subscriptions,target);
  return save({subscriptions:next.subscriptions});
 }

 async function toggleSubscriptionEnabled(id:string){
  return save({
   subscriptions:preferences.subscriptions.map(sub=>
    sub.id===id?{...sub,enabled:!sub.enabled}:sub,
   ),
  });
 }

 async function removeSubscription(id:string){
  return save({
   subscriptions:preferences.subscriptions.filter(sub=>sub.id!==id),
  });
 }

 async function testBountyAlert(){
  try{
   unlockNotificationAudio();
   const notice=await world.testBountyNotice();
   setError('');
   return notice;
  }catch(e){
   setError(String(e));
   return null;
  }
 }

 async function previewSound(){
  unlockNotificationAudio();
  return playNotificationChime('bounty');
 }

 return {
  status:world.status,
  bounties,
  catalog,
  itemIcons,
  preferences,
  activeMatches,
  loaded:world.loaded,
  busy:world.busy,
  testing:world.testing,
  canEdit,
  error,
  now,
  save,
  toggleEnabled,
  toggleSound,
  toggleSubscription,
  toggleSubscriptionEnabled,
  removeSubscription,
  testBountyAlert,
  previewSound,
 };
}

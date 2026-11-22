import {useEffect,useMemo,useState} from 'react';
import {native} from './api';
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

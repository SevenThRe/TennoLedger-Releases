import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {rewardPrices} from '../src/rewardPrices.ts';
import {createMarketPriceStore} from '../src/marketPriceStore.ts';
const seed=JSON.parse(readFileSync(new URL('../public/market-prices.json',import.meta.url),'utf8'));
const relics=JSON.parse(readFileSync(new URL('../public/relic-catalog.json',import.meta.url),'utf8'));
const slugs=Object.fromEntries(relics.items.flatMap((r:any)=>r.rewards).filter((r:any)=>r.marketSlug).map((r:any)=>[r.id,r.marketSlug]));
const ids=['/Lotus/Types/Recipes/WarframeRecipes/StyanaxPrimeBlueprint','/Lotus/Types/Recipes/WarframeRecipes/CalibanPrimeChassisBlueprint','/Lotus/Types/Recipes/WarframeRecipes/GyrePrimeBlueprint','/Lotus/Types/Recipes/Weapons/WeaponParts/DualZorenPrimeHandle','/Lotus/Types/Recipes/WarframeRecipes/VorunaPrimeChassisBlueprint'];
test('real screenshot rewards: cold seed works while backend never returns; no quote calls needed',()=>{
 const start=performance.now(),store=createMarketPriceStore(()=>new Promise(()=>{}),{getItem:()=>null,setItem:()=>{}},()=>Date.parse(seed.fetchedAt));
 void store.refresh();store.seed(seed);
 const result=rewardPrices([...ids,ids[1]],slugs,store.getSnapshot().snapshot,()=>null,Date.parse(seed.fetchedAt));
 for(const id of ids){assert.ok(result.prices[id]!>0,id);assert.match(result.titles[id],/参考价/);}
 assert.equal(Object.keys(result.prices).length,5);
 const elapsed=performance.now()-start;assert.ok(elapsed<3000);console.log(JSON.stringify({elapsedMs:elapsed,prices:result.prices}));
});
test('fresh listing cache overrides old snapshot but null cannot erase a known reference',()=>{
 const newer=new Date(Date.parse(seed.fetchedAt)+1000).toISOString();
 assert.equal(rewardPrices(ids,slugs,seed,()=>({price:42,fetchedAt:newer,stale:false}),Date.parse(seed.fetchedAt)).prices[ids[0]],42);
 assert.ok(rewardPrices(ids,slugs,seed,()=>({price:null,fetchedAt:newer,stale:false}),Date.parse(seed.fetchedAt)).prices[ids[0]]!>0);
 assert.deepEqual(rewardPrices(['unresolved','/Lotus/Types/Recipes/Components/FormaBlueprint'],slugs,seed,()=>null,Date.parse(seed.fetchedAt)).prices,{});
});
test('one hour labels old references; 24 hours rejects them; Forma never reads quotes',()=>{
 const now=Date.parse(seed.fetchedAt);
 assert.match(rewardPrices(ids,slugs,seed,()=>null,now+3600001).titles[ids[0]],/旧参考价/);
 assert.deepEqual(rewardPrices(ids,slugs,seed,()=>null,now+86400001).prices,{});
 const forma='/Lotus/Types/Recipes/Components/FormaBlueprint';
 rewardPrices([forma],{[forma]:'forma_blueprint'},seed,()=>{throw Error('Forma must not query');},now);
});

test('WM algorithm never mixes old minima; an empty current order book clears the old price',()=>{
 const now=Date.parse(seed.fetchedAt),snapshot={...seed,algorithm:'median-online-sell-v1',rows:seed.rows.map((r:any)=>({...r,algorithm:'median-online-sell-v1',priceFetchedAt:seed.fetchedAt,sampleCount:5}))};
 const old=()=>({price:999,fetchedAt:seed.fetchedAt,stale:false});
 assert.notEqual(rewardPrices(ids,slugs,snapshot,old,now).prices[ids[0]],999);
 snapshot.rows.find((r:any)=>r.slug===slugs[ids[0]]).unitPrice=null;
 assert.equal(rewardPrices(ids,slugs,snapshot,old,now).prices[ids[0]],null);
 for(const timestamp of ['invalid',new Date(now-86400001).toISOString(),new Date(now+1).toISOString()]){
  snapshot.rows.find((r:any)=>r.slug===slugs[ids[1]]).priceFetchedAt=timestamp;
  assert.equal(rewardPrices(ids,slugs,snapshot,old,now).prices[ids[1]],null,'fresh envelope cannot hide old/malformed item timestamp');
 }
});

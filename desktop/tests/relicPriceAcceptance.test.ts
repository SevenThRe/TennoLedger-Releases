import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,writeFileSync,readFileSync as read,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createMarketPriceStore} from '../src/marketPriceStore.ts';
import {rewardPrices} from '../src/rewardPrices.ts';
const relics=JSON.parse(readFileSync(new URL('../public/relic-catalog.json',import.meta.url),'utf8'));
const seed=JSON.parse(readFileSync(new URL('../public/market-prices.json',import.meta.url),'utf8'));
const rewards=[...new Map<string,any>(relics.items.flatMap((r:any)=>r.rewards).map((r:any)=>[r.id,r])).values()];
const exempt=new Set(['/Lotus/Types/Recipes/Components/FormaBlueprint','/Lotus/Types/Recipes/Components/WeaponUtilityUnlockerBlueprint','/Lotus/Types/Items/MiscItems/Kuva','/Lotus/Types/Items/MiscItems/RivenFragment']);
const required=rewards.filter(r=>!exempt.has(r.id)),slugs=Object.fromEntries(required.map(r=>[r.id,r.marketSlug]));
function covered(snapshot:any,now:number){
 const result=rewardPrices(required.map(r=>r.id),slugs,snapshot,()=>null,now);
 for(const reward of required)assert.ok(result.prices[reward.id]!>0,`${reward.name}: missing price`);
 return Object.keys(result.prices).length;
}
test('all catalog rewards persist across 96 fifteen-minute refresh boundaries and restarts (virtual clock)',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'relic-price-'));const path=join(dir,'cache.json');
 const storage={getItem:()=>{try{return read(path,'utf8');}catch{return null;}},setItem:(_k:string,v:string)=>writeFileSync(path,v)};
 let now=Date.parse(seed.fetchedAt),calls=0;
 const store=createMarketPriceStore(async()=>{calls++;return {...seed,rows:seed.rows.map((r:any)=>r.slug===required[0].marketSlug?{...r,unitPrice:100+calls}:r),fetchedAt:new Date(now).toISOString()};},storage,()=>now);
 try{
  assert.ok(required.length>500);assert.ok(required.every(r=>r.marketSlug));
  await store.refresh();
  for(let cycle=1;cycle<=96;cycle++){
   now+=899999;await store.refresh();assert.equal(calls,cycle);
   now++;await store.refresh();assert.equal(calls,cycle+1);
   assert.equal(covered(store.getSnapshot().snapshot,now),required.length);
   assert.equal(store.getSnapshot().snapshot?.rows.find(r=>r.slug===required[0].marketSlug)?.unitPrice,100+calls);
   const restarted=createMarketPriceStore(async()=>{throw Error('restart should read disk');},storage,()=>now);
   assert.equal(covered(await restarted.read(),now),required.length);
  }
  console.log(`PASS: ${required.length}/${required.length} rewards, 96 virtual refresh cycles, 96 disk reloads`);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('a failed refresh retains prices but cannot claim a new fetchedAt',async()=>{
 let now=Date.parse(seed.fetchedAt),fail=false;let disk=JSON.stringify(seed);
 const store=createMarketPriceStore(async()=>{if(fail)throw Error('timeout');return seed;},{getItem:()=>disk,setItem:(_k,v)=>{disk=v;}},()=>now);
 now+=900000;fail=true;await assert.rejects(store.refresh(),/timeout/);
 assert.equal(store.getSnapshot().snapshot?.fetchedAt,seed.fetchedAt);
 assert.equal(covered(store.getSnapshot().snapshot,now),required.length);
 assert.match(store.getSnapshot().error,/timeout/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createMarketPriceStore,parsePriceSnapshot,type PriceSnapshot} from '../src/marketPriceStore.ts';
import {endoPrices} from '../src/endoPrices.ts';
import {inventoryEstimate} from '../src/saleValuation.ts';
import {readFileSync} from 'node:fs';
const now=Date.parse('2026-10-27T08:00:00Z');
const sample=(age=0,price=19):PriceSnapshot=>({platform:'pc',source:'test',fetchedAt:new Date(now-age).toISOString(),rows:[{slug:'acceltra_prime_barrel',gameRef:'/Lotus/StoreItems/Test/Barrel',i18n:{en:{name:'Barrel'}},unitPrice:price,volume:5,totalValue:price*5}]});
const storage=()=>{let value:string|null=null;return {getItem:()=>value,setItem:(_key:string,next:string)=>{value=next;}};};

test('cold launch consumers coalesce and restart restores the entire public snapshot without network',async()=>{
 const disk=storage();let calls=0,resolve!:(v:PriceSnapshot)=>void;
 const store=createMarketPriceStore(()=>{calls++;return new Promise(r=>{resolve=r;});},disk,()=>now);
 const reads=Array.from({length:20},()=>store.read());await Promise.resolve();assert.equal(calls,1);
 resolve(sample());await Promise.all(reads);
 const restarted=createMarketPriceStore(async()=>{throw Error('must not query');},disk,()=>now);
 assert.equal(restarted.getSnapshot().snapshot?.rows.length,1);
 assert.equal((await restarted.read()).rows[0].unitPrice,19);
 // Both inventory and an unowned mastery component resolve from the same snapshot.
 assert.equal(endoPrices(['/Lotus/Test/Barrel'],{},(await restarted.read()).rows)['/Lotus/Test/Barrel'],19);
});
test('expired snapshot renders immediately and failed refresh preserves values and original timestamp',async()=>{
 const disk=storage();disk.setItem('',JSON.stringify(sample(16*60000)));let calls=0;
 const store=createMarketPriceStore(async()=>{calls++;throw Error('offline');},disk,()=>now);
 const old=await store.read();await assert.rejects(store.refresh(),/offline/);
 assert.equal(old.rows[0].unitPrice,19);assert.equal(store.getSnapshot().snapshot,old);
 assert.match(store.getSnapshot().error,/offline/);await store.read();assert.equal(calls,1);
});
test('background replacement notifies every subscriber and slower seed never replaces new data',async()=>{
 const store=createMarketPriceStore(async()=>sample(0,21),storage(),()=>now);let events=0;
 const unsubscribe=store.subscribe(()=>events++);store.seed(sample(16*60000));
 assert.equal(store.getSnapshot().snapshot?.rows[0].unitPrice,19);
 await store.refresh();store.seed(sample(60000,3));
 assert.equal(store.getSnapshot().snapshot?.rows[0].unitPrice,21);assert.equal(events,3);unsubscribe();
});
test('invalid, wrong-platform, future, duplicate and too old snapshots are rejected',()=>{
 for(const s of [{...sample(),platform:'xbox'},sample(-1),sample(8*86400000),{...sample(),rows:[...sample().rows,...sample().rows]},{...sample(),rows:[{...sample().rows[0],unitPrice:-1}]}])assert.equal(parsePriceSnapshot(s,now),null);
});
test('catalog entries without a game reference still retain their slug price',()=>{
 const value={...sample(),rows:[{...sample().rows[0],gameRef:null}]};
 assert.equal(parsePriceSnapshot(value,now)?.rows[0].unitPrice,19);
});
test('unknown price preserves a labeled partial estimate; all unknown and overflow stay unknown',()=>{
 assert.deepEqual(inventoryEstimate([{quantity:31,price:3},{quantity:2,price:null}]),{total:93,unknown:1});
 assert.deepEqual(inventoryEstimate([{quantity:1,price:null}]),{total:null,unknown:1});
 assert.equal(inventoryEstimate([{quantity:Number.MAX_SAFE_INTEGER,price:3}]).total,null);
});
test('packaged real catalog snapshot hydrates all rows without any network work',async()=>{
 const seed=JSON.parse(readFileSync(new URL('../public/market-prices.json',import.meta.url),'utf8'));
 const clock=Date.parse(seed.fetchedAt),disk=storage();disk.setItem('',JSON.stringify(seed));
 let requests=0;const start=performance.now();
 const store=createMarketPriceStore(async()=>{requests++;throw Error('offline');},disk,()=>clock);
 const result=await store.read();
 assert.equal(result.rows.length,seed.rows.length);assert.equal(requests,0);
 assert.ok(result.rows.find(row=>row.slug==='acceltra_prime_barrel')?.unitPrice);
 console.log(`Full snapshot hydrate: ${result.rows.length} rows in ${(performance.now()-start).toFixed(1)} ms, ${requests} network requests`);
});

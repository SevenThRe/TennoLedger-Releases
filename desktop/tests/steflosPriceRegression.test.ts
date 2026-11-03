import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {endoPrices} from '../src/endoPrices.ts';
import {createMarketPriceStore} from '../src/marketPriceStore.ts';
const read=(path:string)=>readFileSync(new URL(path,import.meta.url),'utf8');
const id='/Lotus/Types/Recipes/Weapons/WeaponParts/SteflosPrimeBarrel';
test('Steflos identity maps legacy evidence and WM independently, excluding Astilla',()=>{
 const old=JSON.parse(read('../public/market-prices.json')),current=JSON.parse(read('../public/wm-prices.json'));
 for(const snapshot of [old,current]){
  const row=snapshot.rows.find((r:any)=>r.slug==='steflos_prime_barrel');assert.equal(row.gameRef,id);
  assert.equal(endoPrices([id],{},snapshot.rows)[id],row.unitPrice);
 }
 assert.equal(endoPrices([id],{},old.rows)[id],90);
 assert.ok(endoPrices([id],{},current.rows)[id]>0); // current release seed, not a fixed market price
 assert.equal(endoPrices([id],{},[{...current.rows.find((r:any)=>r.slug==='steflos_prime_barrel'),unitPrice:25}])[id],25);
 assert.equal(endoPrices([id],{},current.rows.filter((r:any)=>r.slug.startsWith('astilla_')))[id],undefined);
});
test('actual public loader rejects legacy IPC and seeds only WM package, without local legacy cache',async()=>{
 const legacy=JSON.parse(read('../public/market-prices.json')),current=JSON.parse(read('../public/wm-prices.json'));
 let response=legacy;const fetched:string[]=[],timers:number[]=[];
 const exports:any={};
 const context={exports,require:(name:string)=>{
  if(name==='react')return {};
  if(name==='@tauri-apps/api/core')return {invoke:async()=>response};
  if(name==='./api')return {native:true};
  if(name==='./marketPriceStore')return {createMarketPriceStore:(load:any,storage:any)=>{assert.equal(storage.getItem(),null);return createMarketPriceStore(load,storage,()=>Date.parse(current.fetchedAt));}};
  throw Error(name);
 },fetch:async(path:string)=>{fetched.push(path);return {ok:true,json:async()=>current};},window:{setInterval:(_f:any,ms:number)=>{timers.push(ms);return 1;},addEventListener:()=>{},removeEventListener:()=>{}},clearInterval:()=>{}};
 vm.runInNewContext(ts.transpileModule(read('../src/useMarketPrices.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,context);
 await assert.rejects(exports.marketPrices.refresh(true),/算法版本不匹配/);
 assert.equal(exports.marketPrices.getSnapshot().snapshot,null);
 const stop=exports.startMarketPrices();await new Promise(r=>setImmediate(r));
 assert.deepEqual(fetched,['/wm-prices.json']);assert.deepEqual(timers,[5000]);
 assert.equal(endoPrices([id],{},exports.marketPrices.getSnapshot().snapshot.rows)[id],endoPrices([id],{},current.rows)[id]);
 response=current;await exports.marketPrices.refresh(true);assert.equal(exports.marketPrices.getSnapshot().error,'');stop();
});
test('native inventory and analytics remain connected to shared PriceEngine source',()=>{
 const inventory=read('../src/InventorySale.tsx'),analytics=read('../src-tauri/src/market_analytics.rs');
 assert.match(inventory,/const quotes=native\?publicPrices.snapshot:fixtureQuotes/);
 assert.match(inventory,/pricePlatform==='pc'\?itemPrices/);
 assert.match(analytics,/Arc<PriceEngine>/);assert.match(analytics,/service.snapshot\(\)/);
 assert.doesNotMatch(analytics,/price\.post|alecaframe|market-prices\.json/);
});

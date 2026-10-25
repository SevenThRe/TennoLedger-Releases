import test from 'node:test';
import assert from 'node:assert/strict';
import {masteryQuoteIds,loadMasteryQuotes,restoreMasteryQuotes,batchMasteryQuotes} from '../src/masteryQuotes.ts';
import type {Recommendation} from '../src/masteryModel.ts';

test('batch mastery prices use reference post values and canonical IDs without inventing missing quotes',()=>{
 const row=(slug:string,unitPrice:number|null,gameRef?:string)=>({slug,unitPrice,gameRef,i18n:{},volume:null,totalValue:null});
 const rows=[row('mapped',12),row('direct',25,'/Lotus/StoreItems/Parts/B'),row('unknown',null),row('zero',0),row('bad',NaN)];
 assert.deepEqual(batchMasteryQuotes(['a','/Lotus/Parts/B','missing','zero','bad'],{a:'mapped',missing:'unknown',zero:'zero',bad:'bad'},rows),{a:12,'/Lotus/Parts/B':25});
});

test('mastery cache restore requires fresh positive quotes and never invents missing prices',()=>{
 const restored=restoreMasteryQuotes(['valid','stale','missing','zero','unmapped'],{valid:'valid',stale:'stale',missing:'missing',zero:'zero'},slug=>{
  if(slug==='missing')return null;
  return {price:slug==='zero'?0:12,stale:slug==='stale',fetchedAt:'2026-10-24'};
 });
 assert.deepEqual(restored,{valid:12});
});

test('mastery quotes include candidates beyond twelve and deduplicate missing parts',()=>{
 const rows=Array.from({length:40},(_,i)=>({owned:false,item:{prime:true},missing:[{itemId:String(i)},{itemId:'shared'}]})) as Recommendation[];
 assert.equal(masteryQuoteIds(rows).length,41);
 assert.ok(masteryQuoteIds(rows).includes('39'));
 assert.deepEqual(masteryQuoteIds([{...rows[0],owned:true},{...rows[1],item:{...rows[1].item,prime:false}}]),[]);
});
test('mastery quotes keep partial results and stale metadata, never fabricate unavailable prices',async()=>{
 const updates:number[]=[];
 const result=await loadMasteryQuotes(['a','b','c','d'],{a:'a',b:'b',c:'c'},async slug=>{
  if(slug==='b')throw Error('offline');
  return {price:slug==='a'?8:null,stale:true,fetchedAt:'2026-10-24'};
 },()=>true,(_,done)=>updates.push(done));
 assert.deepEqual(result,{prices:{a:8},failed:1,stale:true});
 assert.deepEqual(updates,[1,2,3,4]);
});
test('account change or unmount discards in-flight mastery quotes and stops the queue',async()=>{
 let current=true,calls=0,updates=0;
 const result=await loadMasteryQuotes(['a','b'],{a:'a',b:'b'},async()=>{
  calls++;current=false;return {price:8,stale:false,fetchedAt:'2026-10-24'};
 },()=>current,()=>updates++);
 assert.equal(result,null);assert.equal(calls,1);assert.equal(updates,0);
});

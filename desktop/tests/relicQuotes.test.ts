import test from 'node:test';
import assert from 'node:assert/strict';
import {loadRelicQuotes} from '../src/relicQuotes.ts';

test('list refresh reports partial progress including unavailable and unmapped rewards',async()=>{
 const updates:{prices:Record<string,number|null>;done:number}[]=[];
 await loadRelicQuotes([{id:'a',marketSlug:'a'},{id:'b',marketSlug:'b'},{id:'forma'}],async slug=>{
  if(slug==='b')throw Error('offline');
  return {price:9,stale:false,fetchedAt:'2026-10-24'};
 },()=>true,(prices,done)=>updates.push({prices,done}));
 assert.deepEqual(updates,[{prices:{a:9},done:1},{prices:{a:9,b:null},done:2},{prices:{a:9,b:null,forma:null},done:3}]);
});

test('changing a list during an in-flight quote suppresses progress as well as final results',async()=>{
 let current=true,updates=0;
 const result=await loadRelicQuotes([{id:'a',marketSlug:'a'}],async()=>{
  current=false;return {price:9,stale:false,fetchedAt:'2026-10-24'};
 },()=>current,()=>updates++);
 assert.equal(result,null);assert.equal(updates,0);
});

test('one unavailable reward does not discard other prices or stale status',async()=>{
 const result=await loadRelicQuotes([{id:'a',marketSlug:'a'},{id:'b',marketSlug:'b'},{id:'forma'}],async slug=>{
  if(slug==='a')throw Error('offline');
  return {price:8,stale:true,fetchedAt:'2026-01-01'};
 },()=>true);
 assert.deepEqual(result?.prices,{a:null,b:8,forma:null});
 assert.equal(result?.stale,true);assert.equal(result?.errors.length,1);
});
test('closing or replacing a dialog stops further requests and drops obsolete results',async()=>{
 let live=true,calls=0;
 const result=await loadRelicQuotes([{id:'a',marketSlug:'a'},{id:'b',marketSlug:'b'}],async()=>{
  calls++;live=false;return {price:8,stale:false,fetchedAt:'2026-01-01'};
 },()=>live);
 assert.equal(result,null);assert.equal(calls,1);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createQuoteCache,readFreshQuote,type Quote} from '../src/quoteCache.ts';
function memory(){const values=new Map<string,string>();return {getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v);}};}

test('list hydration reads only fresh platform-specific quotes without a network request',()=>{
 const store=memory(),quote={price:12,fetchedAt:new Date(1000000).toISOString(),stale:false};
 store.setItem('myframe.quote.v2:pc:item',JSON.stringify(quote));
 assert.deepEqual(readFreshQuote(store,'item','pc',1000000),quote);
 assert.equal(readFreshQuote(store,'item','ps4',1000000),null);
 assert.equal(readFreshQuote(store,'item','pc',1900000),null);
 assert.equal(readFreshQuote(store,'item','pc',999999),null);
});
test('cache hydration preserves unavailable prices and rejects malformed or inaccessible storage',()=>{
 const store=memory(),key='myframe.quote.v2:pc:item';
 store.setItem(key,JSON.stringify({price:null,fetchedAt:new Date(1000000).toISOString()}));
 assert.equal(readFreshQuote(store,'item','pc',1000000)?.price,null);
 for(const value of ['{',JSON.stringify({price:-1,fetchedAt:new Date(1000000).toISOString()}),JSON.stringify({price:1,fetchedAt:'invalid'})]){
  store.setItem(key,value);assert.equal(readFreshQuote(store,'item','pc',1000000),null);
 }
 assert.equal(readFreshQuote({getItem:()=>{throw Error('denied');}},'item'),null);
});
test('concurrent callers coalesce by platform and slug and reuse fresh cache',async()=>{
 let calls=0,release!:(q:Quote)=>void;
 const quote={price:10,fetchedAt:new Date(1000000).toISOString(),stale:false};
 const cache=createQuoteCache(async()=>{calls++;return new Promise<Quote>(resolve=>{release=resolve;});},memory(),()=>1000000);
 const a=cache('item'),b=cache('item');await Promise.resolve();assert.equal(calls,1);release(quote);
 assert.deepEqual(await Promise.all([a,b]),[quote,quote]);
 assert.deepEqual(await cache('item'),quote);assert.equal(calls,1);
 const other=cache('item','ps4');await Promise.resolve();assert.equal(calls,2);release(quote);await other;
});
test('expired quote is labeled stale during failures and cooldown then recovers',async()=>{
 const store=memory();let time=2000000,calls=0,fail=true;
 store.setItem('myframe.quote.v2:pc:item',JSON.stringify({price:7,fetchedAt:new Date(0).toISOString(),stale:false}));
 const cache=createQuoteCache(async()=>{calls++;if(fail)throw Error('offline');return {price:9,fetchedAt:new Date(time).toISOString(),stale:false};},store,()=>time);
 assert.equal((await cache('item')).stale,true);assert.equal((await cache('item')).price,7);assert.equal(calls,1);
 time+=60001;fail=false;assert.equal((await cache('item')).price,9);assert.equal(calls,2);
 assert.equal((await cache('item')).stale,false);
});
test('failed requests without cache reject and do not stick in pending forever',async()=>{
 let time=1,calls=0;const cache=createQuoteCache(async()=>{calls++;throw Error('offline');},memory(),()=>time);
 await assert.rejects(cache('item'),/offline/);await assert.rejects(cache('item'),/稍后/);assert.equal(calls,1);
 time+=60001;await assert.rejects(cache('item'),/offline/);assert.equal(calls,2);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createUpgradeBookCache,rankQuotes,parseUpgradeOrders,validUpgradeRank} from '../src/upgradeQuotes.ts';
import {marketRankTradeQuotes,marketWhisper} from '../src/marketModel.ts';
import {inventoryTradeTarget} from '../src/inventoryTrade.ts';
const order=(id:string,rank:unknown,platinum:number,type='sell')=>({id,rank,platinum,type,quantity:1,visible:true,user:{status:'ingame',locale:'en',ingameName:'Trader'}});
test('rank-specific prices never merge unknown, zero and upgraded ranks',()=>{
 const rows=[order('zero',0,10),order('max',10,200),order('unknown',undefined,1),order('string','0',2),order('buy0',0,8,'buy'),order('buyMax',10,180,'buy'),{...order('offline',10,2),user:{status:'offline'}}];
 assert.deepEqual(rankQuotes(rows,0),{sell:10,buy:8});assert.deepEqual(rankQuotes(rows,10),{sell:200,buy:180});
 assert.deepEqual(rankQuotes(rows,3),{sell:null,buy:null});assert.deepEqual(rankQuotes(rows,null),{sell:null,buy:null});
 for(const value of [-1,1.5,'0',null,undefined,Infinity])assert.equal(validUpgradeRank(value),false);
 assert.equal(validUpgradeRank(10,5),false);assert.equal(validUpgradeRank(5,5),true);
});
test('all ranks share one in-flight book and cache while platforms remain separate',async()=>{
 let now=1000000,calls=0;const waits:number[]=[];
 const read=createUpgradeBookCache(async()=>{calls++;return {data:[order('zero',0,10),order('max',10,200)],fetchedAt:new Date(now).toISOString()};},{now:()=>now,wait:async ms=>{waits.push(ms);now+=ms;}});
 const zero=read('serration','pc'),max=read('serration','pc');assert.equal(zero,max);
 const book=await zero;assert.equal(rankQuotes(book.orders,0).sell,10);assert.equal(rankQuotes((await max).orders,10).sell,200);assert.equal(calls,1);
 assert.equal(await read('serration','pc'),book);assert.equal(calls,1);
 await read('serration','ps4');assert.equal(calls,2);assert.deepEqual(waits,[400]);
 now+=15*60*1000+1;await read('serration','pc');assert.equal(calls,3);
});
test('different books run sequentially with a bounded interval and failures cool down',async()=>{
 let now=1000000,active=0,maxActive=0,calls=0,fail=true;const starts:number[]=[];
 const read=createUpgradeBookCache(async slug=>{active++;maxActive=Math.max(maxActive,active);calls++;starts.push(now);await Promise.resolve();active--;if(slug==='bad'&&fail)throw Error('429');return {data:[],fetchedAt:new Date(now).toISOString()};},{now:()=>now,wait:async ms=>{now+=ms;}});
 await Promise.all([read('a'),read('b')]);assert.equal(maxActive,1);assert.equal(starts[1]-starts[0],400);
 await assert.rejects(read('bad'),/429/);const before=calls;await assert.rejects(read('bad'),/Retry/);assert.equal(calls,before);
 now+=30001;fail=false;await read('bad');assert.equal(calls,before+1);
 await assert.rejects(read('../bad'),/无效/);await assert.rejects(read('a','evil'),/无效/);
});
test('invalid response and absent fetched timestamp cannot create a usable quote',async()=>{
 assert.throws(()=>parseUpgradeOrders({data:[]}));assert.deepEqual(parseUpgradeOrders({sell:[order('s',1,2)],buy:[order('b',1,1,'buy')]}).length,2);
 const read=createUpgradeBookCache(async()=>({data:[],fetchedAt:''}),{interval:0});await assert.rejects(read('a'),/获取时间/);
});
test('rank target survives validation and sidebar copies the actual rank',()=>{
 const target={id:'/Lotus/Mod',slug:'serration',name:'膛线',englishName:'Serration',rank:10,platform:'ps4'};
 assert.deepEqual(inventoryTradeTarget(target),target);
 for(const rank of [null,'0',-1,101])assert.equal(inventoryTradeTarget({...target,rank}),null);
 assert.equal(inventoryTradeTarget({...target,platform:'bad'}),null);
 const quotes=marketRankTradeQuotes([order('zero',0,10),order('ten',10,200),order('none',undefined,1)],10);
 assert.deepEqual(quotes.map(q=>q.id),['ten']);assert.match(marketWhisper('Serration',quotes[0]),/Serration \(rank 10\)/);
 assert.deepEqual(marketRankTradeQuotes([order('none',undefined,1)],0),[]);
});

 test('inventory-sized sweeps survive navigation and keep exact rank prices',async()=>{
 let now=1000000,calls=0;
 const read=createUpgradeBookCache(async()=>{calls++;return {data:[order('zero',0,200),order('max',5,80)],fetchedAt:new Date(now).toISOString()};},{now:()=>now,interval:0});
 for(let i=0;i<1382;i++)await read('mod_'+i);
 now+=61000;
 const book=await read('mod_0');
 assert.equal(calls,1382);
 assert.deepEqual(rankQuotes(book.orders,0),{sell:200,buy:null});
 assert.deepEqual(rankQuotes(book.orders,5),{sell:80,buy:null});
 });

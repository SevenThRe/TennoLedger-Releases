import test from 'node:test';
import assert from 'node:assert/strict';
import {marketTradeDefaults,defaultMarketExtras,marketExtras} from '../src/marketSpecial.ts';
test('special controls derive only supported fields and reset between items',()=>{
 assert.deepEqual(defaultMarketExtras({subtypes:['intact','radiant'],bulkTradable:true}),{subtype:'intact',perTrade:1});
 assert.deepEqual(defaultMarketExtras({maxCharges:3,maxAmberStars:2,maxCyanStars:3}),{charges:0,amberStars:0,cyanStars:0});
 assert.deepEqual(marketExtras({}, {subtype:'radiant',charges:3,perTrade:6},1),{});
});
test('special item orders validate enum, maxima and bundle size before submission',()=>{
 const item={subtypes:['intact','radiant'],maxCharges:3,maxAmberStars:2,maxCyanStars:3,bulkTradable:true};
 const input={subtype:'radiant',charges:3,amberStars:2,cyanStars:3,perTrade:6};
 assert.deepEqual(marketExtras(item,input,12),input);
 for(const change of [{subtype:'other'},{charges:4},{amberStars:-1},{cyanStars:1.5},{perTrade:7},{perTrade:0}])assert.throws(()=>marketExtras(item,{...input,...change},12));
 assert.throws(()=>marketExtras(item,input,5));
});

test('opening an order preserves its exact variant and bundle price, without copying its full listed stock',()=>{
 const item={subtypes:['intact','radiant'],bulkTradable:true};
 assert.deepEqual(marketTradeDefaults(item,{subtype:'radiant',perTrade:6,platinum:60}),{extras:{subtype:'radiant',perTrade:6},rank:0,price:60,quantity:6});
 assert.deepEqual(marketTradeDefaults({maxRank:10},{rank:10,platinum:135}),{extras:{},rank:10,price:135,quantity:1});
 assert.deepEqual(marketTradeDefaults({}),{extras:{},rank:0,price:'',quantity:1});
 assert.throws(()=>marketTradeDefaults({maxRank:3},{rank:10}));
 assert.throws(()=>marketTradeDefaults(item,{subtype:'unknown'}));
});

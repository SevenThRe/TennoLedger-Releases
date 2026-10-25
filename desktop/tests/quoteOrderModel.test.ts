import test from 'node:test';
import assert from 'node:assert/strict';
import {quoteOrderPayload} from '../src/quoteOrderModel.ts';
test('shared quote composer preserves exact rank, variant and bundle-price semantics',()=>{
 assert.deepEqual(quoteOrderPayload({id:'verified-id',slug:'a',maxRank:10},'sell',2,45,10,{}),{itemId:'verified-id',type:'sell',quantity:2,platinum:45,visible:true,rank:10});
 const item={id:'bulk',slug:'b',subtypes:['intact','radiant'],bulkTradable:true};
 assert.deepEqual(quoteOrderPayload(item,'buy',12,30,0,{subtype:'radiant',perTrade:6}),{itemId:'bulk',type:'buy',quantity:12,platinum:30,visible:true,subtype:'radiant',perTrade:6});
 assert.throws(()=>quoteOrderPayload(item,'buy',5,30,0,{subtype:'radiant',perTrade:6}));
 assert.throws(()=>quoteOrderPayload(item,'buy',6,30,0,{subtype:'invalid',perTrade:6}));
});
test('posting rejects blank identities, invalid counts, fractional prices and out-of-range ranks',()=>{
 const item={id:'a',slug:'a',maxRank:8};
 for(const qty of [0,-1,1.5,9999,NaN])assert.throws(()=>quoteOrderPayload(item,'sell',qty,10,0,{}));
 for(const price of [0,-1,1.5,800001,NaN])assert.throws(()=>quoteOrderPayload(item,'sell',1,price,0,{}));
 for(const rank of [-1,9,1.5,NaN])assert.throws(()=>quoteOrderPayload(item,'sell',1,10,rank,{}));
 assert.throws(()=>quoteOrderPayload({...item,id:''},'sell',1,10,0,{}));
});

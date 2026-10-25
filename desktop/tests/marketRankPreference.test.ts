import {test} from 'node:test';
import assert from 'node:assert/strict';
import {orderOwned,displayOrderOwned} from '../src/marketModel.ts';

test('missing-stock preference toggles aggregate vs exact-rank ownership without changing the order',()=>{
 const item={slug:'serration',gameRef:'/mod',maxRank:10,tags:['mod']};
 const snapshot={complete:true,counts:{'/mod':5},upgradeCountsByRank:{'/mod':{'0':4,'10':1}}};
 const order={rank:10};
 assert.equal(orderOwned(item,undefined,snapshot,null,order),1);
 assert.equal(displayOrderOwned(item,undefined,snapshot,null,order,false),5);
 // An aggregate display cannot change the quantity available to a write path.
 assert.equal(orderOwned(item,undefined,snapshot,null,{rank:0}),4);
 assert.equal(order.rank,10);
 assert.equal(displayOrderOwned(item,undefined,{complete:false,counts:{}},null,order,false),null);
 assert.equal(displayOrderOwned(item,undefined,{complete:true,counts:{}},null,order,false),0);
 assert.equal(displayOrderOwned(item,undefined,{complete:false,counts:{'/mod':5}},null,order,true),null);
});

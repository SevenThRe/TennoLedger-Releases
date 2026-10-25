import test from 'node:test';import assert from 'node:assert/strict';
import {relicOrderBody,relicOrders,relicWhisper,submitRelicOrder} from '../src/relicTradeModel.ts';
const item={id:'market-id',slug:'lith_g10_relic',subtypes:['intact','radiant']};

test('relic sale reloads current stock before sending; stale, unknown and failed reads cannot post',async()=>{
 let sent=0;
 for(const stock of [0,1,null])await assert.rejects(submitRelicOrder(item,'Radiant','sell',20,2,async()=>stock,async()=>{sent++;}),/库存/);
 await assert.rejects(submitRelicOrder(item,'Radiant','sell',20,2,async()=>{throw Error('read failed');},async()=>{sent++;}),/read failed/);
 assert.equal(sent,0);
 const events:string[]=[];
 const result=await submitRelicOrder(item,'Radiant','sell',20,2,async()=>{events.push('read');return 2;},async body=>{events.push('send');assert.equal(body.subtype,'radiant');assert.equal(body.quantity,2);return 'receipt';});
 assert.equal(result,'receipt');assert.deepEqual(events,['read','send']);
});

test('relic buy orders do not require owned inventory',async()=>{
 const result=await submitRelicOrder(item,'Intact','buy',5,2,async()=>{throw Error('must not read');},async body=>body);
 assert.equal(result.type,'buy');assert.equal(result.quantity,2);
});
test('relic orders send exact subtype and enforce selected-refinement stock',()=>{
 assert.deepEqual(relicOrderBody(item,'Radiant','sell',20,2,2),{itemId:'market-id',type:'sell',subtype:'radiant',platinum:20,quantity:2,visible:true});
 assert.throws(()=>relicOrderBody(item,'Radiant','sell',20,2,1));
 assert.throws(()=>relicOrderBody(item,'Radiant','sell',20,1,null));
 assert.throws(()=>relicOrderBody(item,'Flawless','buy',20,1,null));
 assert.equal(relicOrderBody(item,'Intact','buy',5,2,null).quantity,2);
});
test('whispers reverse order direction and preserve refinement and bundle price',()=>{
 const q={id:'a',type:'sell',subtype:'radiant',quantity:6,platinum:30,perTrade:6,user:{ingameName:'Tenno'}};
 assert.equal(relicWhisper('Lith G10','Radiant',q),'/w Tenno Hi! I want to buy: x6 "Lith G10 Relic (Radiant)" for 30 platinum. (warframe.market)');
 assert.match(relicWhisper('Lith G10','Radiant',{...q,type:'buy',perTrade:1}),/want to sell: "Lith/);
 assert.throws(()=>relicWhisper('Lith G10','Intact',q));
 assert.throws(()=>relicWhisper('Lith G10','Radiant',{...q,perTrade:7}));
 assert.throws(()=>relicWhisper('Lith G10','Radiant',{...q,user:{ingameName:'Bad\nName'}}));
});
test('malformed and invalid bundle quotes are excluded',()=>{
 const q={id:'a',type:'sell',subtype:'radiant',visible:true,quantity:6,platinum:30,user:{status:'ingame'}};
 assert.deepEqual(relicOrders([null,{...q,perTrade:0},{...q,perTrade:7},{...q,quantity:1.2},q],'Radiant').map(q=>q.id),['a']);
});
test('relic quotes exclude other refinements and sort by per-item price',()=>{
 const q={id:'a',type:'sell',subtype:'radiant',visible:true,quantity:6,platinum:30,perTrade:6,user:{status:'ingame'}};
 const rows=relicOrders([q,{...q,id:'b',platinum:10,perTrade:1},{...q,id:'wrong',subtype:'intact'},{...q,id:'offline',user:{status:'offline'}},{...q,id:'hidden',visible:false}],'Radiant');
 assert.deepEqual(rows.map(r=>r.id),['a','b']);
});

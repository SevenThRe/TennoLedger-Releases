import {test} from 'node:test';import assert from 'node:assert/strict';
import {rivenCategoryMatches,veiledTitle,veiledWhisper,veiledSlug,veiledQuantity,veiledQuotes,veiledOrder,submitVeiledOrder} from '../src/veiledTradeModel.ts';
import type {Riven} from '../src/rivenModel.ts';
const r={id:'a',name:'Rifle Riven Mod',veiled:true,quantity:4} as Riven;

test('veiled sales recount the latest matching stacks and never post stale quantities',async()=>{
 const item={id:'id',slug:veiledSlug(r)};let sends=0;
 for(const latest of [[],[{...r,quantity:1}],[{...r,veiled:false}],[{...r,name:'Pistol Riven Mod'}],[{...r,quantity:NaN}]]){
  await assert.rejects(submitVeiledOrder(item,r,'sell',10,2,async()=>latest,async()=>{sends++;}),/库存/);
 }
 await assert.rejects(submitVeiledOrder(item,r,'sell',10,2,async()=>{throw Error('read failed');},async()=>{sends++;}),/read failed/);
 assert.equal(sends,0);
 const order=await submitVeiledOrder(item,r,'sell',10,2,async()=>[{...r,quantity:1},{...r,id:'b',quantity:1}],async body=>body);
 assert.equal(order.quantity,2);assert.equal(order.type,'sell');
});

test('veiled purchases do not read seller inventory',async()=>{
 const order=await submitVeiledOrder({id:'id',slug:veiledSlug(r)},r,'buy',10,6,async()=>{throw Error('must not read');},async body=>body);
 assert.equal(order.quantity,6);assert.equal(order.type,'buy');
});
test('veiled trades resolve the exact ordinary market slug and sum matching stacks only',()=>{assert.equal(veiledSlug(r),'rifle_riven_mod_veiled');assert.equal(veiledQuantity(r,[r,{...r,id:'b',quantity:1},{...r,id:'c',veiled:false},{...r,id:'d',name:'Pistol Riven Mod'}]),5);assert.throws(()=>veiledOrder({id:'id',slug:veiledSlug(r)},'sell',10,6,5));assert.equal(veiledOrder({id:'id',slug:veiledSlug(r)},'buy',10,6,5).quantity,6);});
test('veiled quotes exclude offline hidden and ranked entries',()=>{const q={id:'1',type:'sell',quantity:1,platinum:10,user:{status:'ingame'}};assert.equal(veiledQuotes([q,{...q,visible:false},{...q,rank:1},{...q,user:{status:'offline'}}]).length,1);});
test('veiled quote whispers reverse the order side and request one item at the quoted unit price',()=>{
 const q={id:'q',type:'sell',quantity:9,platinum:12,user:{ingameName:'ExampleSeller'}};
 assert.equal(veiledWhisper(r,q),'/w ExampleSeller Hi! I want to buy: "Rifle Riven Mod (Veiled)" for 12 platinum. (warframe.market)');
 assert.match(veiledWhisper(r,{...q,type:'buy'}),/want to sell:/);
 assert.throws(()=>veiledWhisper(r,{...q,user:{}}));
 assert.throws(()=>veiledWhisper(r,{...q,user:{ingameName:'a\n/w b'}}));
 assert.equal(veiledTitle({...r,category:'rifle'}),'步枪紫卡');
});

test('bulk veiled quotes sort by unit price and whispers preserve the required bundle',()=>{
 const q={id:'bulk',type:'sell',visible:true,quantity:12,perTrade:6,platinum:60,user:{status:'ingame',ingameName:'Seller'}};
 assert.deepEqual(veiledQuotes([{...q,id:'single',perTrade:1,platinum:15},q]).map(q=>q.id),['bulk','single']);
 assert.match(veiledWhisper(r,q),/buy: x6 "Rifle Riven Mod \(Veiled\)" for 60 platinum/);
 assert.match(veiledWhisper(r,{...q,type:'buy'}),/sell: x6/);
 for(const amount of [0,-1,1.5,13]){
  assert.equal(veiledQuotes([{...q,perTrade:amount}]).length,0);
  assert.throws(()=>veiledWhisper(r,{...q,perTrade:amount}));
 }
 assert.equal(veiledQuotes([null,{...q,type:'invalid'}]).length,0);
});

test('companion weapon rivens have a Chinese title and consistent inventory category',()=>{
 for(const category of ['companion weapon','companion_weapon']){
  const companion={...r,name:'Companion Weapon Riven Mod',category};
  assert.equal(veiledTitle(companion),'同伴武器紫卡');
  assert.equal(rivenCategoryMatches(companion,'companion weapon'),true);
  assert.equal(rivenCategoryMatches(companion,'all'),true);
  assert.equal(rivenCategoryMatches(companion,'rifle'),false);
  assert.equal(veiledSlug(companion),'companion_weapon_riven_mod_veiled');
 }
 assert.equal(rivenCategoryMatches({...r,category:'rifle'},'companion weapon'),false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {parseGameTradeFinished,gameTradeCandidate,matchTradeFinish,buildTradeFinishPlan,type FinishCandidate,type FinishMarketItem} from '../src/tradeFinishModel.ts';
import type {BulkOrder} from '../src/marketBulkModel.ts';
import type {InventorySet} from '../src/inventorySetsModel.ts';
const now=Date.parse('2026-10-25T00:00:00Z'),scope='account';
const candidate:FinishCandidate={id:'receipt',accountScope:scope,occurredAt:'2026-10-24T23:59:00Z',confirmed:true,side:'sale',partner:'Tenno',platinum:30,items:[{itemId:'part',quantity:2}]};
const market:FinishMarketItem[]=[{id:'m',slug:'part',gameRef:'part'}];
const order:BulkOrder={id:'o',itemId:'m',type:'sell',platinum:15,quantity:4,visible:true};
test('only confirmed current-account recent trades produce exact order completion plans',()=>{
 const match=matchTradeFinish(candidate,[order],market,[],now,scope);assert.equal(match.status,'matched');
 const plan=buildTradeFinishPlan(candidate,match,{accountId:'market-account',platform:'pc'},'plan');assert.deepEqual(plan.items[0].body,{quantity:2});assert.equal(plan.items[0].action,'close');
 assert.equal(matchTradeFinish({...candidate,confirmed:false},[order],market,[],now,scope).status,'unconfirmed');
 assert.equal(matchTradeFinish(candidate,[order],market,[],now,'other').status,'unconfirmed');
 assert.equal(matchTradeFinish(candidate,[order],market,[],now+16*60000,scope).status,'expired');
});
test('multiple orders and insufficient quantities remain unresolved rather than guessed by price',()=>{
 assert.equal(matchTradeFinish(candidate,[order,{...order,id:'o2',platinum:30}],market,[],now,scope).status,'ambiguous');
 assert.equal(matchTradeFinish(candidate,[{...order,quantity:1}],market,[],now,scope).status,'unmatched');
 assert.equal(matchTradeFinish({...candidate,side:'purchase'},[order],market,[],now,scope).status,'unmatched');
});
test('ranked MOD and arcane matching requires exact observed rank and special properties',()=>{
 const mods=[{...market[0],maxRank:10}],ranked={...order,rank:5};
 assert.equal(matchTradeFinish(candidate,[ranked],mods,[],now,scope).status,'unmatched');
 const correct={...candidate,items:[{...candidate.items[0],rank:5}]};assert.equal(matchTradeFinish(correct,[ranked],mods,[],now,scope).status,'matched');
 assert.equal(matchTradeFinish(correct,[{...ranked,charges:2}],mods,[],now,scope).status,'unmatched');
 assert.equal(matchTradeFinish({...correct,items:[{...correct.items[0],charges:2}]},[{...ranked,charges:2}],mods,[],now,scope).status,'matched');
});
test('exact set composition collapses only the exact component multiples, excluding aliases and leftovers',()=>{
 const set:InventorySet={id:'set',parentId:'built',slug:'prime_set',name:'Set',unverifiedReason:null,parts:[{itemId:'bp',quantity:1,slug:'bp',ducats:15},{itemId:'barrel',quantity:2,slug:'barrel',ducats:15}]};
 const setsMarket=[{id:'s',gameRef:'built',slug:'prime_set',tags:['set']}],setOrder={...order,itemId:'s',quantity:2};
 const trade={...candidate,items:[{itemId:'bp',quantity:2},{itemId:'barrel',quantity:4}]};
 const m=matchTradeFinish(trade,[setOrder],setsMarket,[set],now,scope);assert.equal(m.status,'matched');assert.equal(m.matches[0].quantity,2);
 assert.equal(matchTradeFinish({...trade,items:[...trade.items,{itemId:'extra',quantity:1}]},[setOrder],setsMarket,[set],now,scope).status,'unmatched');
 assert.equal(matchTradeFinish(trade,[setOrder],setsMarket,[{...set,parts:null}],now,scope).status,'unmatched');
 assert.equal(matchTradeFinish({...candidate,items:[{itemId:'crafted_barrel',quantity:4},{itemId:'bp',quantity:2}]},[setOrder],setsMarket,[set],now,scope).status,'unmatched');
});
test('multiple confirmed items may close distinct orders, and repeated entries cannot over-close',()=>{
 const trade={...candidate,items:[{itemId:'part',quantity:1},{itemId:'second',quantity:1}]};
 const catalog=[...market,{id:'m2',slug:'second',gameRef:'second'}],orders=[order,{...order,id:'o2',itemId:'m2'}];
 assert.equal(matchTradeFinish(trade,orders,catalog,[],now,scope).matches.length,2);
 assert.equal(matchTradeFinish({...candidate,items:[{itemId:'part',quantity:3},{itemId:'part',quantity:3}]},[order],market,[],now,scope).status,'unmatched');
});
test('native trade receipts preserve ranks and unknown platinum and reject old-scope or malformed events',()=>{
 const event={id:'native-event',accountScope:scope,capturedAt:'2026-10-24T23:59:00Z',partner:'Tenno',kind:'sale',complete:true,platinum:null,sent:[{itemId:'part',quantity:2,rank:5,rawDisplayName:'MOD 等级 5'}],received:[]};
 const parsed=parseGameTradeFinished(event,scope)!;assert.equal(parsed.sent[0].rank,5);const next=gameTradeCandidate(parsed);assert.equal(next.platinum,null);assert.equal(next.items[0].rank,5);
 assert.equal(parseGameTradeFinished(event,'other'),null);assert.equal(parseGameTradeFinished({...event,sent:[{itemId:'part',quantity:2,rank:99}]},scope),null);
 const incomplete=parseGameTradeFinished({...event,complete:false,sent:[{itemId:null,quantity:1,rank:null,rawDisplayName:'未知物品'}]},scope)!;assert.equal(incomplete.sent[0].itemId,'unresolved:未知物品');assert.equal(matchTradeFinish(gameTradeCandidate(incomplete),[order],market,[],now,scope).status,'unmatched');
 const unranked=gameTradeCandidate(parseGameTradeFinished({...event,sent:[{itemId:'part',quantity:2}]},scope)!);assert.equal(unranked.items[0].rank,undefined);assert.equal(matchTradeFinish(unranked,[{...order,rank:0}],[{...market[0],maxRank:10}],[],now,scope).status,'unmatched');
});
test('native incomplete identity and exchanges never become automatically closeable buy/sell plans',()=>{
 assert.equal(matchTradeFinish({...candidate,identitiesComplete:false},[order],market,[],now,scope).status,'unmatched');
 assert.equal(matchTradeFinish({...candidate,side:'exchange'},[order],market,[],now,scope).status,'unmatched');
});

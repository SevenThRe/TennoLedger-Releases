import test from 'node:test';
import assert from 'node:assert/strict';
import {attributeTrades} from '../src/tradeAttribution.ts';
import {tradeRankings} from '../src/tradeRankingModel.ts';
import {tradeStatement} from '../src/tradeStatementModel.ts';
import {tradePartners} from '../src/tradePartnerModel.ts';
import type {Exchange,Trade} from '../src/api';
const items=[{id:'part',name:'Ash Prime Chassis',zh:'Ash Prime 机体',category:'prime'},{id:'base',name:'Ash Prime',zh:'Ash Prime',category:'warframe'}];
const market=[{slug:'ash_prime_set',i18n:{en:{name:'Ash Prime Set'},'zh-hans':{name:'Ash Prime 套装'}},unitPrice:null,volume:null,totalValue:null}];
const exchange:Exchange={id:'multi',ts:'2026-10-24T00:00:00Z',partner:'Fixture',kind:'sale',sent:[{itemId:'part',quantity:6},{itemId:'base',quantity:1}],received:[{itemId:'/AF_Special/Platinum',quantity:75}],referenceItem:{itemId:'part',quantity:2}};

test('partner rankings share attributed buy/sell scope while unresolved exchanges retain cashflow',()=>{
 const purchase:Exchange={...exchange,id:'purchase',kind:'purchase',sent:[{itemId:'/AF_Special/Platinum',quantity:30}],received:exchange.sent};
 const barter:Exchange={...exchange,id:'barter',partner:'Barter only',kind:'exchange',sent:[{itemId:'part',quantity:1},{itemId:'/AF_Special/Platinum',quantity:20}],received:[{itemId:'base',quantity:1},{itemId:'/AF_Special/Platinum',quantity:5}]};
 const unknown:Exchange={...exchange,id:'unknown',partner:'Unknown only',referenceItem:undefined};
 const inputs=[exchange,purchase,barter,unknown],before=JSON.stringify(inputs);
 const result=attributeTrades([],inputs,items,market);
 assert.deepEqual(tradePartners(result.trades,'totalValue'),[{name:'Fixture',saleCount:1,saleValue:75,purchaseCount:1,purchaseValue:30,totalCount:2,totalValue:105}]);
 assert.equal(tradeRankings(result.trades,'sale','value')[0].totalValue,75);
 assert.equal(tradeRankings(result.trades,'purchase','value')[0].totalValue,30);
 const unresolved=tradeStatement(result.trades,result.catalog,'net',result.unresolved).find(row=>row.type==='unallocated')!;
 assert.equal(unresolved.revenue,80);assert.equal(unresolved.expenses,20);
 assert.deepEqual(result.unresolved.map(row=>row.id),['barter','unknown']);
 assert.equal(JSON.stringify(inputs),before);
 // Loading a directory must not temporarily count an unclassified exchange.
 assert.deepEqual(tradePartners(attributeTrades([],inputs,items,null).trades,'totalValue'),[]);
});
test('multi-item sale attributes total price once using raw first quantity and market set identity',()=>{
 const original=JSON.stringify(exchange);
 const result=attributeTrades([], [exchange],items,market);
 assert.equal(result.unresolved.length,0);
 assert.deepEqual(tradeRankings(result.trades,'sale','value'),[{id:'market:ash_prime_set',name:'Ash Prime Set',volume:2,totalValue:75,unitPrice:37}]);
 const statement=tradeStatement(result.trades,result.catalog,'revenue',result.unresolved);
 assert.equal(statement.find(row=>row.type==='set')?.revenue,75);
 assert.equal(statement.reduce((sum,row)=>sum+row.revenue,0),75);
 assert.equal(result.catalog.get('market:ash_prime_set')?.zh,'Ash Prime 套装');
 assert.equal(JSON.stringify(exchange),original);
});
test('single set purchases and compound purchases share one ranking identity',()=>{
 const single:Trade={id:'single',ts:exchange.ts,partner:'Fixture',side:'purchase',itemId:'set',name:'Ash Prime Set',quantity:1,platinum:30,category:'set'};
 const purchase:Exchange={...exchange,kind:'purchase',sent:exchange.received,received:exchange.sent};
 const result=attributeTrades([single],[purchase],items,market);
 const rows=tradeRankings(result.trades,'purchase','value');
 assert.equal(rows.length,1);assert.equal(rows[0].volume,3);assert.equal(rows[0].totalValue,105);assert.equal(rows[0].unitPrice,33);
});
test('missing provenance, unavailable catalog, unknown items and barter do not fabricate item attribution',()=>{
 for(const value of [{...exchange,referenceItem:undefined},{...exchange,kind:'exchange' as const},{...exchange,referenceItem:{itemId:'unknown',quantity:1}}]){
  const result=attributeTrades([],[value],items,market);assert.equal(result.trades.length,0);assert.equal(result.unresolved.length,1);
 }
 assert.equal(attributeTrades([],[exchange],items,null).unresolved.length,1);
 const withoutSet=attributeTrades([],[exchange],items,[]);
 assert.equal(withoutSet.trades[0].itemId,'part');assert.equal(withoutSet.trades[0].platinum,75);
});
test('special riven trades retain suffix identity, localized weapon art and riven cashflow without market prices',()=>{
 const id='/AF_Special/Riven/Amprex/Acriada',other='/AF_Special/Riven/Amprex/Visiata';
 const weapons=[{id:'amprex',name:'Amprex',zh:'安培克斯',category:'primary',image:'/amprex.png'}];
 const single:Trade={id:'single',ts:exchange.ts,partner:'Fixture',side:'sale',itemId:id,name:'Amprex Acriada',quantity:1,platinum:30,category:'riven'};
 const multi:Exchange={...exchange,sent:[{itemId:id,quantity:3}],referenceItem:{itemId:id,quantity:1}};
 const result=attributeTrades([single,{...single,id:'other',itemId:other}],[multi],weapons,null);
 assert.equal(result.unresolved.length,0);
 const rows=tradeRankings(result.trades,'sale','value');assert.equal(rows.length,2);
 assert.equal(rows[0].totalValue,105);assert.equal(rows[0].volume,2);
 assert.equal(result.catalog.get(id)?.zh,'安培克斯 Acriada');assert.equal(result.catalog.get(id)?.image,'/amprex.png');
 assert.equal(tradeStatement(result.trades,result.catalog,'revenue',result.unresolved).find(row=>row.type==='riven')?.revenue,135);
});
test('unknown riven weapon keeps the full English name; malformed special IDs remain unresolved',()=>{
 const id='/AF_Special/Riven/Unknown Weapon/Foo';
 const multi:Exchange={...exchange,sent:[{itemId:id,quantity:1}],referenceItem:{itemId:id,quantity:1}};
 const result=attributeTrades([],[multi],[],null);assert.equal(result.trades[0].name,'Unknown Weapon Foo');
 assert.equal(result.catalog.get(id)?.zh,'Unknown Weapon Foo');
 assert.equal(attributeTrades([],[{...multi,referenceItem:{itemId:'/AF_Special/Riven/',quantity:1}}],[],market).unresolved.length,1);
});

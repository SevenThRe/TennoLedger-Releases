import {test} from 'node:test';
import assert from 'node:assert/strict';
import {exchangeHistory,exchangeCurrency,exchangeItemName,platinumId} from '../src/tradeHistoryModel.ts';
import {tradeStatement} from '../src/tradeStatementModel.ts';
import type {Exchange} from '../src/api.ts';
const mixed:Exchange={id:'mixed',ts:'2026-10-24T01:00:00Z',partner:'Fixture',kind:'exchange',sent:[{itemId:'a',quantity:2},{itemId:platinumId,quantity:20}],received:[{itemId:'b',quantity:3},{itemId:platinumId,quantity:5}]};
test('exchange history searches both sides and distinguishes barter from sales',()=>{
 const names=new Map([['b','中文物品']]);
 assert.deepEqual(exchangeHistory([], [mixed],'exchange','中文','date',true,names),[mixed]);
 assert.deepEqual(exchangeHistory([], [mixed],'sale','','date',true),[]);
 assert.equal(exchangeCurrency(mixed,'sent'),20);assert.equal(exchangeCurrency(mixed,'received'),5);
 assert.equal(exchangeItemName('/AF_Special/Riven/Amprex/Acriada'),'Amprex Acriada');
});
test('multi-item currency is accounted once without invented per-item allocations',()=>{
 const row=tradeStatement([],new Map(),'net',[mixed]).find(r=>r.type==='unallocated')!;
 assert.deepEqual(row,{type:'unallocated',revenue:5,expenses:20,net:-15,graphValue:0});
});

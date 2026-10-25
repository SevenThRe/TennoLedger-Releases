import test from 'node:test';
import assert from 'node:assert/strict';
import {filterTradeHistory} from '../src/tradeHistoryModel.ts';
const trades=[{id:'a',ts:'2026-10-21',itemId:'amprex',name:'Amprex',side:'sale' as const,quantity:3,platinum:60,partner:'Beta',category:''},{id:'b',ts:'2026-10-22',itemId:'ash',name:'Ash',side:'purchase' as const,quantity:1,platinum:40,partner:'Alpha',category:''}];
test('history searches both languages and partner without changing saved records',()=>{
 const names=new Map([['amprex','Amprex 安培克斯']]);
 assert.deepEqual(filterTradeHistory(trades,'all','安培','date',true,names).map(t=>t.id),['a']);
 assert.equal(filterTradeHistory(trades,'sale','Alpha','date',true).length,0);
 assert.deepEqual(filterTradeHistory(trades,'all',' alpha ','date',true).map(t=>t.id),['b']);
 assert.deepEqual(trades.map(t=>t.id),['a','b']);
});
test('default date/platinum descending and partner ascending match reference; reverse flips each',()=>{
 for(const [order,ids] of [['date',['b','a']],['platinum',['a','b']],['partner',['b','a']]] as const){
  assert.deepEqual(filterTradeHistory(trades,'all','',order,true).map(t=>t.id),ids);
  assert.deepEqual(filterTradeHistory(trades,'all','',order,false).map(t=>t.id),[...ids].reverse());
 }
});

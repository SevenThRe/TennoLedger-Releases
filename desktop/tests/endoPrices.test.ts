import test from 'node:test';
import assert from 'node:assert/strict';
import {endoPrices} from '../src/endoPrices.ts';
import type {MarketRankingRow} from '../src/marketRankingModel.ts';
const row=(slug:string,price:number|null,gameRef?:string):MarketRankingRow=>({slug,unitPrice:price,gameRef,i18n:{},volume:null,totalValue:null});
test('Endo uses canonical game IDs before explicit slug fallback',()=>{
 assert.deepEqual(endoPrices(['/Lotus/A','/Lotus/B','/Lotus/C'],{'/Lotus/A':'wrong','/Lotus/B':'b'},[row('a',8,'/Lotus/StoreItems/A'),row('wrong',99),row('b',3)]),{'/Lotus/A':8,'/Lotus/B':3});
});
test('Endo never turns missing, zero or malformed prices into known values',()=>{
 const prices=[null,0,-1,NaN,Infinity,1.5,Number.MAX_SAFE_INTEGER+1];
 assert.deepEqual(endoPrices(prices.map((_,i)=>'/Lotus/'+i),{},prices.map((p,i)=>row(String(i),p,'/Lotus/'+i))),{});
});

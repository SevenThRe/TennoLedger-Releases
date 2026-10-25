import test from 'node:test';
import assert from 'node:assert/strict';
import {analyticsHighlights,comparisonWidth,categorySummary} from '../src/analyticsViewModel.ts';
import type {Trade} from '../src/api.ts';
const trade=(id:string,side:Trade['side'],platinum:number,itemId='same'):Trade=>({id,ts:'2026-10-24T00:00:00Z',itemId,name:itemId,side,quantity:2,platinum,partner:'p',category:'other'});
test('highlights use the largest transaction rather than lifetime item totals',()=>{
 const input=[trade('a','sale',20),trade('b','sale',20),trade('c','sale',30,'other'),trade('d','purchase',8),trade('bad','purchase',NaN)];
 const found=analyticsHighlights(input);assert.equal(found.sale?.id,'c');assert.equal(found.purchase?.id,'d');assert.equal(input.length,5);
 assert.deepEqual(analyticsHighlights([]),{sale:null,purchase:null});
});
test('category summary uses the whole supplied market and zeroes invalid scales',()=>{
 const input=Array.from({length:60},(_,i)=>({type:String(i),value:2}));input.push({type:'invalid',value:NaN});
 const result=categorySummary(input);assert.equal(result.total,120);assert.equal(result.rows.length,60);
 assert.equal(result.rows.reduce((sum,r)=>sum+r.percent,0).toFixed(6),'100.000000');
 assert.equal(comparisonWidth(0,0),0);assert.equal(comparisonWidth(1,0),0);assert.equal(comparisonWidth(-2,3),0);assert.equal(comparisonWidth(5,2),100);
 assert.equal(categorySummary([{type:'zero',value:0}]).rows[0].percent,0);
});

import test from 'node:test';import assert from 'node:assert/strict';
import {normalizeRivenHistory,rivenHistoryWindow,rivenHistoryAttributes} from '../src/rivenHistoryModel.ts';
test('public history uses actual source dates, de-duplicates and keeps missing series null',()=>{
 const points=normalizeRivenHistory([{endts:'2024-07-15T00:00:00',price:10,basePrice:0},{endts:'2024-07-14T00:00:00Z',price:8,basePrice:7},{endts:'2024-07-15T00:00:00Z',price:11},{endts:'bad',price:100}]);
 assert.equal(points.length,2);assert.equal(points[1].time,Date.UTC(2024,6,15));assert.equal(points[1].average,11);assert.equal(points[1].baseline,null);
 assert.equal(rivenHistoryWindow(points,90).end,Date.UTC(2024,6,15));assert.equal(rivenHistoryWindow(points,0).start,Date.UTC(2024,6,14));
 assert.deepEqual(rivenHistoryWindow([],30),{start:null,end:null});assert.throws(()=>normalizeRivenHistory({data:[]}));
});
test('attribute summaries retain historical cutoff and unknown usage instead of current minimum-price time',()=>{
 const rows=rivenHistoryAttributes([{endts:'2024-07-15T00:00:00',price:50,attrPriceAvg:{WeaponCritChanceMod:200,WeaponCritDamageMod:0},attrPopulatity:{WeaponCritChanceMod:.7,WeaponCritDamageMod:2}}]);
 assert.equal(rows[0].time,Date.UTC(2024,6,15));assert.equal(rows[0].price,200);assert.equal(rows[0].usage,.7);assert.equal(rows[1].price,null);assert.equal(rows[1].usage,null);
 assert.deepEqual(rivenHistoryAttributes([]),[]);
});

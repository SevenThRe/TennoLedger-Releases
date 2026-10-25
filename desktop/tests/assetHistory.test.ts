import test from 'node:test';
import assert from 'node:assert/strict';
import {historySeries,historyRange} from '../src/assetHistoryModel.ts';
const points=[{ts:'2026-10-21T00:00:00Z',plat:20},{ts:'2026-10-22T00:00:00Z',plat:null},{ts:'2026-10-23T00:00:00Z',plat:15},{ts:'2026-10-24T00:00:00Z',plat:0}];
test('missing asset observations do not become zero or create fictitious gains',()=>{
 const series=historySeries([...points].reverse(),'plat');assert.deepEqual(series.values.map(v=>v[1]),[20,null,15,0]);assert.deepEqual(series.changes.map(v=>v[1]),[0,null,null,-15]);
 assert.deepEqual(historySeries(points,'ducats').values.map(v=>v[1]),[null,null,null,null]);
});
test('all time and fixed day ranges use timestamps and keep changes before the window available',()=>{
 const now=Date.parse('2026-10-24T00:00:00Z');assert.equal(historyRange(points,7,now).min,now-7*86400000);assert.equal(historyRange(points,0,now).min,Date.parse(points[0].ts));
 assert.equal(historySeries([{ts:'invalid',plat:10}],'plat').values.length,0);
});

test('intraday live samples project to one UTC-day balance and played flag without changing raw history',()=>{
 const raw=[{ts:'2026-10-24T23:00:00Z',plat:40},{ts:'2026-10-24T08:00:00+08:00',plat:20},{ts:'2026-10-25T00:01:00Z',plat:50}];
 const before=JSON.stringify(raw);
 assert.deepEqual(historySeries(raw,'plat').values,[[Date.parse('2026-10-24T00:00:00Z'),40],[Date.parse('2026-10-25T00:00:00Z'),50]]);
 assert.deepEqual(historySeries(raw,'played').values.map(p=>p[1]),[1,1]);
 assert.equal(JSON.stringify(raw),before);
});
test('daily projection preserves unknown latest balances and incomplete event totals',()=>{
 const raw=[{ts:'2026-10-24T00:00:00Z',plat:20,trades:2,relicOpened:1},{ts:'2026-10-24T12:00:00Z',plat:null,trades:3,relicOpened:null}];
 assert.deepEqual(historySeries(raw,'plat').values.map(p=>p[1]),[null]);
 assert.deepEqual(historySeries(raw,'trades').values.map(p=>p[1]),[5]);
 assert.deepEqual(historySeries(raw,'relicOpened').values.map(p=>p[1]),[null]);
});

test('automatic range includes the first projected UTC day even when collection starts midday',()=>{
 assert.equal(historyRange([{ts:'2026-10-24T18:00:00Z',plat:1}],0,Date.parse('2026-10-25')).min,Date.parse('2026-10-24T00:00:00Z'));
});

test('activity-only rows preserve known balance while explicit null invalidates it',()=>{const points=[{ts:'2026-10-24T01:00:00Z',plat:10},{ts:'2026-10-24T02:00:00Z',trades:1}];assert.deepEqual(historySeries(points,'plat').values.map(p=>p[1]),[10]);assert.deepEqual(historySeries([...points,{ts:'2026-10-24T03:00:00Z',plat:null}],'plat').values.map(p=>p[1]),[null]);});

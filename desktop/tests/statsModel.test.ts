import test from 'node:test';
import assert from 'node:assert/strict';
import {activityDays,activitySummary,calendarMonths,calendarPeriods,confirmedEvents,dateRange,inDateRange,parseDateInput,presetRange,statsSeries} from '../src/statsModel.ts';
import type {Trade,Exchange} from '../src/api';
const time=(day:string)=>Date.parse(day+'T00:00:00Z');
const trade:Trade={id:'confirmed-1',ts:'2026-10-24T23:59:59Z',itemId:'x',name:'X',side:'sale',quantity:1,platinum:8,partner:'A',category:'other'};
test('strict date ranges reject normalized invalid days and include all of the final UTC day',()=>{
 assert.equal(parseDateInput('2026-02-30'),null);assert.equal(parseDateInput('2026-2-03'),null);assert.equal(dateRange('2026-10-25','2026-10-24'),null);
 const r=dateRange('2026-10-24','2026-10-24')!;assert(inDateRange(trade.ts,r));assert(!inDateRange('2026-10-25T00:00:00Z',r));assert(!inDateRange('not-a-date',r));
 assert.deepEqual(presetRange([],7,time('2026-10-24')),{start:time('2026-10-18'),end:time('2026-10-24')});
});
test('UTC grouping counts a day once and never fabricates relic-open observations',()=>{
 const days=activityDays([{ts:'2026-10-24T01:00:00+08:00',plat:1},{ts:'2026-10-23T23:59:59Z',plat:2},{ts:'invalid',plat:5}],[],[]);
 assert.equal(days.length,1);assert.equal(days[0].relics,null);assert.equal(days[0].trades,null);assert.equal(activitySummary(days,dateRange('2026-10-23','2026-10-24')!).days,1);
});
test('confirmed stable IDs are counted once and structured records replace legacy versions',()=>{
 const exchange:Exchange={id:trade.id,ts:trade.ts,partner:'A',kind:'sale',sent:[{itemId:'x',quantity:1}],received:[]};
 assert.equal(confirmedEvents([trade,trade],[exchange]).length,1);
 const days=activityDays([], [trade,trade],[exchange]);assert.equal(days[0].trades,1);assert.equal(days[0].tradesPartial,true);
 assert.deepEqual(activitySummary(days,dateRange('2026-10-24','2026-10-24')!).trades,{value:1,partial:true});
});
test('imported daily counters and local confirmations overlap instead of being added',()=>{
 const days=activityDays([{ts:trade.ts,trades:3,relicOpened:2}],[trade],[]);
 assert.equal(days[0].trades,3);assert.equal(days[0].tradesPartial,false);assert.equal(days[0].relics,2);
 const summary=activitySummary(days,dateRange('2026-10-24','2026-10-24')!);assert.deepEqual(summary.trades,{value:3,partial:false});
});
test('partial activity totals are marked as lower bounds, with all unknown staying null',()=>{
 const days=activityDays([{ts:'2026-10-23T00:00:00Z',relicOpened:2},{ts:trade.ts}],[],[]);
 assert.deepEqual(activitySummary(days,dateRange('2026-10-23','2026-10-24')!).relics,{value:2,partial:true});
 assert.equal(activitySummary(days,dateRange('2026-10-24','2026-10-24')!).relics.value,null);
});
test('balance changes include a known preceding day but never bridge an unknown balance',()=>{
 const points=[{ts:'2026-10-22T10:00:00Z',vitus:10},{ts:'2026-10-23T10:00:00Z',vitus:null},{ts:trade.ts,vitus:4}];
 const days=activityDays(points,[],[]),range=dateRange('2026-10-23','2026-10-24')!;
 assert.deepEqual(statsSeries(points,days,'vitus',range,'change').map(p=>p[1]),[null,null]);
 assert.deepEqual(statsSeries(points,days,'vitus',range,'balance').map(p=>p[1]),[null,4]);
 assert.deepEqual(statsSeries([{ts:'2026-10-23',vitus:9},{ts:'2026-10-24',vitus:4}],days,'vitus',dateRange('2026-10-24','2026-10-24')!,'change').map(p=>p[1]),[-5]);
});
test('Monday-first leap calendar has real February days and weeks cross year boundaries',()=>{
 const range=dateRange('2024-01-01','2024-12-31')!,months=calendarMonths(2024,range,activityDays([{ts:'2024-02-29'}],[],[]));
 assert.equal(months[1].cells.length,29);assert.equal(months[1].offset,3);assert.equal(months[1].count,1);
 const december=months[11];assert.equal(december.weeks.at(-1)!.days.at(-1)!.time,time('2025-01-05'));
 assert.equal(december.weeks.at(-1)!.days.at(-1)!.inRange,false);
});
test('monthly/yearly period records obey the selected range and count unique days',()=>{
 const range=dateRange('2025-12-30','2026-01-03')!,days=activityDays([{ts:'2025-12-31T00:00:00Z'},{ts:'2025-12-31T12:00:00Z'},{ts:'2026-01-01T00:00:00Z'},{ts:'2026-01-04T00:00:00Z'}],[],[]);
 assert.deepEqual(calendarPeriods('yearly',2026,range,days).map(p=>p.count),[1,1]);
 assert.equal(calendarMonths(2026,range,days).length,1);assert.equal(calendarMonths(2026,range,days)[0].count,1);
});

 test('mixed counter observations retain known counts and mark incomplete coverage',()=>{const days=activityDays([{ts:'2026-10-24T01:00:00Z',trades:2,relicOpened:3},{ts:'2026-10-24T02:00:00Z',plat:50}],[],[]);assert.equal(days[0].trades,2);assert.equal(days[0].relics,3);const summary=activitySummary(days,dateRange('2026-10-24','2026-10-24')!);assert.deepEqual(summary.trades,{value:2,partial:true});assert.deepEqual(summary.relics,{value:3,partial:true});});

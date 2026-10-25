import {test} from 'node:test';
import assert from 'node:assert/strict';
import {groupRailFissures,railTime,worldResetTimes} from '../src/worldRailModel.ts';
import type {WorldEvent} from '../src/worldModel.ts';
test('fissures group by relic tier, retaining mission order and unknown groups',()=>{
 const rows=[['a','Axi'],['b','Lith'],['c','Axi'],['d','Omnia'],['e','unknown']].map(([id,tier])=>({id,tier} as WorldEvent));
 assert.deepEqual(groupRailFissures(rows).map(g=>[g.tier,g.missions.map(m=>m.id)]),[['lith',['b']],['axi',['a','c']],['omnia',['d']],['unknown',['e']]]);
});
test('sortie follows Eastern noon in both seasons and across DST transition',()=>{
 for(const [now,expiry] of [['2026-07-01T15:00:00Z','2026-07-01T16:00:00Z'],['2026-01-01T15:00:00Z','2026-01-01T17:00:00Z'],['2026-10-31T17:00:00Z','2026-11-01T17:00:00Z'],['2026-03-07T18:00:00Z','2026-03-08T16:00:00Z']])assert.equal(new Date(worldResetTimes(Date.parse(now)).sortie).toISOString(),new Date(expiry).toISOString());
 const reset=worldResetTimes(Date.parse('2026-10-25T18:00:00Z'));
 assert.equal(new Date(reset.weekly).toISOString(),'2026-10-26T00:00:00.000Z');
 assert.equal(new Date(reset.daily).toISOString(),'2026-10-26T00:00:00.000Z');
 assert.equal(railTime('invalid',0),'—');
 assert.equal(railTime(90061000,0),'1d 1h');
 assert.equal(railTime(359000,0),'5m 59s');
});

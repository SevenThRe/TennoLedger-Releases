import {test} from 'node:test';
import assert from 'node:assert/strict';
import {freshAccount} from '../src/dataFreshness.ts';
test('fresh live data only; cached, disconnected, disabled and aged data are not green',()=>{
 const now=Date.now(),s={enabled:true,accountCode:'synced',scanCode:'helper-current',lastReadAt:new Date(now-1000).toISOString()};
 assert.equal(freshAccount(s,now),true);
 for(const patch of [{enabled:false},{accountCode:'cached'},{scanCode:'game-not-running'},{lastReadAt:null},{lastReadAt:new Date(now-181000).toISOString()}])assert.equal(freshAccount({...s,...patch},now),false);
});
test('a live receipt between 10-second UI ticks is fresh immediately at render time',()=>{
 const tick=Date.parse('2026-10-24T05:12:10Z');
 const s={enabled:true,accountCode:'synced',scanCode:'helper-current',lastReadAt:'2026-10-24T05:12:15Z'};
 assert.equal(freshAccount(s,tick,tick+5001),true);
 assert.equal(freshAccount(s,tick,tick+4000),false);
 assert.equal(freshAccount(s,tick,tick+186000),false);
 assert.equal(freshAccount({...s,scanCode:'game-not-running'},tick,tick+5001),false);
});

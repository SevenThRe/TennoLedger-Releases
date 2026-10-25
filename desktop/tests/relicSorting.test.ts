import test from 'node:test';
import assert from 'node:assert/strict';
import {groupedValue,compareRelicValues,refinementGain} from '../src/relicSorting.ts';

test('upgrade gain uses the full family even when only Radiant is displayed or owned',()=>{
 const family=[{refinement:'Intact',value:10},{refinement:'Radiant',value:40}];
 const shown=family.filter(r=>r.refinement==='Radiant');
 assert.equal(shown.length,1);
 assert.equal(refinementGain(family,r=>r.value),.3);
 assert.equal(refinementGain(shown,r=>r.value),null);
 assert.deepEqual([.1,refinementGain(family,r=>r.value),null].sort((a,b)=>compareRelicValues(a,b,true)),[.3,.1,null]);
});
test('upgrade gain preserves zero, negative gains and unknown endpoint prices',()=>{
 const family=[{refinement:'Intact',value:20},{refinement:'Radiant',value:20}];
 assert.equal(refinementGain(family,r=>r.value),0);
 family[1].value=10;assert.equal(refinementGain(family,r=>r.value),-.1);
 assert.equal(refinementGain(family,r=>r.refinement==='Intact'?null:r.value),null);
 assert.equal(refinementGain(family,()=>NaN),null);
});
test('grouped profit uses the highest or lowest refinement for the selected direction',()=>{
 assert.equal(groupedValue([10,40,null,20],true),40);
 assert.equal(groupedValue([10,40,null,20],false),10);
 assert.equal(groupedValue([null,NaN],false),null);
 assert.equal(groupedValue([0,null],true),0);
});
test('unknown prices sort last in both directions without treating zero as missing',()=>{
 assert.deepEqual([null,10,0,30].sort((a,b)=>compareRelicValues(a,b,true)),[30,10,0,null]);
 assert.deepEqual([null,10,0,30].sort((a,b)=>compareRelicValues(a,b,false)),[0,10,30,null]);
});

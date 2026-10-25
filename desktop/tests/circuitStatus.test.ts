import {test} from 'node:test';import assert from 'node:assert/strict';
import {circuitWarframeStatus} from '../src/circuitStatus.ts';
const item={id:'normal',maxRank:30};
test('sold mastered frame and subsumed frame still complete circuit reward',()=>{assert.equal(circuitWarframeStatus({ranks:{normal:30}},item).complete,true);assert.deepEqual(circuitWarframeStatus({helminth:['normal']},item),{mastered:false,subsumed:true,complete:true});});
test('Prime mastery does not imply normal mastery, unknown does not complete',()=>{assert.equal(circuitWarframeStatus({ranks:{prime:30}},item).complete,false);assert.equal(circuitWarframeStatus(null,item).complete,false);assert.equal(circuitWarframeStatus({ranks:{normal:29}},item).complete,false);});
test('mastery and subsumption remain independent and can both display',()=>{assert.deepEqual(circuitWarframeStatus({ranks:{normal:30},helminth:['normal']},item),{mastered:true,subsumed:true,complete:true});});

import {installedCircuitIncarnon} from '../src/circuitStatus.ts';
test('installed Prime counts for circuit base weapon, unrelated ownership does not',()=>{
 const items=[{id:'okina-prime',name:'Okina Prime'},{id:'dera-vandal',name:'Dera Vandal'}];
 assert.equal(installedCircuitIncarnon(['okina-prime'],'Okina',items),true);
 assert.equal(installedCircuitIncarnon(['dera-vandal'],'Okina',items),false);
 assert.equal(installedCircuitIncarnon(null,'Okina',items),false);
});

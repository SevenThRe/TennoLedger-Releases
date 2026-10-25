import test from 'node:test';
import assert from 'node:assert/strict';
import {matchesFissureMode,fissureModes} from '../src/fissureModes.ts';
test('five reference modes distinguish normal, steel and storms',()=>{
 const rows=[{nodeId:'SolNode1',steelPath:false,voidStorm:false},{nodeId:'SolNode2',steelPath:true,voidStorm:false},{nodeId:'CrewBattleNode1',steelPath:false,voidStorm:true}];
 assert.deepEqual(fissureModes.map(mode=>rows.filter(e=>matchesFissureMode(e,mode)).map(e=>e.nodeId)),[['SolNode1','SolNode2'],['SolNode1'],['SolNode2'],['CrewBattleNode1'],['SolNode1','SolNode2','CrewBattleNode1']]);
});
test('saved snapshots use node family only when explicit source is absent',()=>{
 assert.equal(matchesFissureMode({nodeId:'CrewBattleNode1',steelPath:false},'storm'),true);
 assert.equal(matchesFissureMode({nodeId:'CrewBattleNode1',steelPath:false,voidStorm:false},'storm'),false);
 assert.equal(matchesFissureMode({nodeId:'NewNode',steelPath:false,voidStorm:true},'storm'),true);
});

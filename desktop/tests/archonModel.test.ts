import {test} from 'node:test';
import assert from 'node:assert/strict';
import {archonOverview,describeShard,shardCapacity,shardId,shardRecipes,stelaId,type ShardSnapshot} from '../src/archonModel.ts';
test('all six ascent and three same-tier combination recipes match reference costs',()=>{
 assert.equal(shardRecipes.length,12);
 for(const r of shardRecipes.filter(r=>r.kind==='ascent')){assert.equal(r.stela,100);assert.equal(r.inputs[0].quantity,3);assert.equal(r.output,shardId(r.color,true));}
 const green=shardRecipes.find(r=>r.id==='coalescent-green-tau')!;
 assert.equal(green.stela,50);assert.deepEqual(green.inputs.map(i=>i.id),[shardId('yellow',true),shardId('blue',true)]);
});
test('capacity is bounded by Stela and loose stock, never equipped stones',()=>{
 const snapshot:ShardSnapshot={complete:true,counts:{[stelaId]:199,[shardId('red')]:9},archonShardFrames:[{itemId:'frame',instanceId:'one',slots:[{color:'ACC_RED',upgradeType:'effect'}]}]};
 assert.equal(shardCapacity(snapshot,shardRecipes[0]),1);
 snapshot.counts[stelaId]=999;assert.equal(shardCapacity(snapshot,shardRecipes[0]),3);
 snapshot.counts[shardId('red')]=0;assert.equal(shardCapacity(snapshot,shardRecipes[0]),0);
});
test('incomplete or invalid quantities remain unknown rather than zero',()=>{
 assert.equal(shardCapacity({complete:false,counts:{}},shardRecipes[0]),null);
 assert.equal(shardCapacity({complete:true,counts:{[stelaId]:NaN}},shardRecipes[0]),null);
 assert.equal(archonOverview({complete:true,counts:{}}).colors[0].equipped,null);
});
test('duplicate frames and unknown effects retain identity and count without guessing color',()=>{
 const result=archonOverview({complete:true,counts:{},archonShardFrames:[{itemId:'frame',instanceId:'b',slots:[{color:'ACC_RED_MYTHIC',upgradeType:'effect'},null]},{itemId:'frame',instanceId:'a',slots:[{color:'ACC_NONE',upgradeType:''},{color:'ACC_FUTURE',upgradeType:'future'}]}]});
 assert.deepEqual(result.frames.map(f=>[f.instanceId,f.copy,f.copies]),[['a',1,2],['b',2,2]]);
 assert.equal(result.colors[0].equippedTau,1);assert.equal(result.unknownEquipped,1);
 assert.equal(describeShard({color:'ACC_NONE',upgradeType:''}).installed,false);
 assert.equal(describeShard({color:'ACC_BLUE_MYTHIC',upgradeType:'x'}).removalPercent,30);
});
test('unknown frame slots make aggregate installed totals unknown',()=>{
 const result=archonOverview({complete:true,counts:{},archonShardFrames:[{itemId:'frame',instanceId:'a',slots:null}]});
 assert.equal(result.rosterKnown,false);assert.equal(result.frames[0].equipped,null);assert.equal(result.colors[0].equippedTau,null);
});

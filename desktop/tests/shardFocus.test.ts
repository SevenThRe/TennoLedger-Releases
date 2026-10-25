import {test} from 'node:test';
import assert from 'node:assert/strict';
import {findShardFrame} from '../src/shardFocus.ts';
const frames=[{itemId:'A',instanceId:'empty',slots:[null]},{itemId:'A',instanceId:'installed',slots:[{color:'ACC_RED',upgradeType:'effect'}]},{itemId:'B',instanceId:'other',slots:null}];
test('explicit instance wins over installed copy and missing instances fall back',()=>{
 assert.equal(findShardFrame(frames,{itemId:'A',instanceId:'empty'})?.instanceId,'empty');
 assert.equal(findShardFrame(frames,{itemId:'A',instanceId:'gone'})?.instanceId,'installed');
 assert.equal(findShardFrame(frames,{itemId:'B'})?.instanceId,'other');
 assert.equal(findShardFrame(frames,{itemId:'missing'}),undefined);
});

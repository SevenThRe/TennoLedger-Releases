import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseShardPreferences,shardDefaults} from '../src/shardPreferences.ts';
test('shard tabs and filters round trip without transient selection or search',()=>{
 const value={page:'guide',guideColor:'purple',color:'red',tier:'tau',installation:'full',favorites:true,order:'upgrade'};
 assert.deepEqual(parseShardPreferences(JSON.stringify({...value,search:'Excalibur',selected:'private-id'})),value);
});
test('invalid enum values fall back while damaged storage is reported',()=>{
 assert.deepEqual(parseShardPreferences('{"page":"other","favorites":1,"color":"black"}'),shardDefaults);
 assert.deepEqual(parseShardPreferences(null),shardDefaults);
 assert.throws(()=>parseShardPreferences('[]'));assert.throws(()=>parseShardPreferences('{'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {masteryRows} from '../src/masteryRows.ts';
import type {Recommendation} from '../src/masteryModel.ts';
test('intrinsics participate in normal owned/XP ordering before ready equipment',()=>{
 const rec=(id:string,xp:number,owned:boolean)=>({item:{id},xp,owned,missing:[],ready:true}) as Recommendation;
 const list=[rec('high',6000,true),rec('tie',1500,true),rec('low',100,true),rec('ready',6000,false)];
 const rows=masteryRows(list,'normal',{duviri:{current:10,max:40},railjack:{current:20,max:50}});
 assert.deepEqual(rows.map(r=>r.kind==='intrinsic'?r.id:r.value.item.id),['high','tie','intrinsic:duviri','intrinsic:railjack','low','ready']);
 assert.equal(list.length,4);
});
test('intrinsics require partially advanced known progress and only appear in easy mode',()=>{
 for(const mode of ['relics','platinum'])assert.deepEqual(masteryRows([],mode,{duviri:{current:1,max:40}}),[]);
 assert.deepEqual(masteryRows([],'normal',{duviri:{current:0,max:40},railjack:{current:50,max:50}}),[]);
 assert.deepEqual(masteryRows([],'normal',null),[]);
});

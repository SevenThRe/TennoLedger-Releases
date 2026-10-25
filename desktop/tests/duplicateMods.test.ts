import {test} from 'node:test';
import assert from 'node:assert/strict';
import {duplicateModEstimate,type DuplicateModInput} from '../src/duplicateMods.ts';
const mod:DuplicateModInput={id:'/Lotus/Upgrades/Mods/Test',category:'Warframe Mod',rarity:'Rare',maximumRank:10,favorite:false,owned:4,looseUnranked:3,known:true};
test('instance and ranked copies count toward retention without being dissolved',()=>{
 assert.deepEqual(duplicateModEstimate(mod,1,true),{status:'available',duplicates:3,kept:1,endoEach:15,endo:45});
 assert.deepEqual(duplicateModEstimate(mod,3,true),{status:'available',duplicates:1,kept:3,endoEach:15,endo:15});
 assert.equal(duplicateModEstimate(mod,5,true).status,'none');
});
test('favorites and missing or inconsistent loose counts are protected',()=>{
 assert.equal(duplicateModEstimate({...mod,favorite:true},1,true).status,'protected');
 assert.equal(duplicateModEstimate({...mod,favorite:true},1,false).status,'available');
 for(const value of [null,5,-1,1.5])assert.equal(duplicateModEstimate({...mod,looseUnranked:value},1,true).status,'unknown');
 assert.throws(()=>duplicateModEstimate(mod,0,true));
});
test('special non-Endo categories and randomized/Railjack mods are excluded',()=>{
 for(const category of ['Parazon Mod','Focus Way','Arcane'])assert.equal(duplicateModEstimate({...mod,category},1,true).status,'unsupported');
 for(const id of ['/Lotus/Upgrades/Mods/Randomized/Test','/Lotus/Upgrades/Mods/Railjack/Test','/Lotus/Powersuits/Test'])assert.equal(duplicateModEstimate({...mod,id},1,true).status,'unsupported');
});

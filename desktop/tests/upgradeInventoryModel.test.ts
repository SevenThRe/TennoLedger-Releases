import test from 'node:test';
import assert from 'node:assert/strict';
import {arcaneCopies,arcaneProgress,matchesArcaneProgress,compareArcaneProgress,upgradeInstances,upgradeOwnership} from '../src/upgradeInventoryModel.ts';
const item={id:'arcane',category:'arcane',arcane:{maximumRank:5}};
test('arcane rank equivalents match original triangular formula, including rank 0 and max 5',()=>{
 assert.equal(arcaneCopies(0),1);assert.equal(arcaneCopies(3),10);assert.equal(arcaneCopies(5),21);
 const row=arcaneProgress(item,{arcane:{0:2,3:1}});
 assert.equal(row.owned,3);assert.equal(row.equivalent,12);assert.equal(row.required,21);assert.equal(row.remaining,9);assert.equal(row.highestRank,3);
 assert.ok(matchesArcaneProgress(row,'incomplete'));assert.equal(matchesArcaneProgress(row,'ready'),false);
});
test('ready to max is distinct from owning an already max rank copy',()=>{
 const ready=arcaneProgress(item,{arcane:{0:21}}),maxed=arcaneProgress(item,{arcane:{5:1,0:4}});
 assert.equal(ready.remaining,0);assert.equal(ready.percent,100);assert.ok(matchesArcaneProgress(ready,'ready'));assert.equal(matchesArcaneProgress(ready,'maxed'),false);
 assert.equal(maxed.equivalent,25);assert.equal(maxed.remaining,0);assert.equal(maxed.percent,100);assert.ok(matchesArcaneProgress(maxed,'maxed'));assert.equal(matchesArcaneProgress(maxed,'ready'),false);
});
test('missing whole inventory, null item, illegal ranks and absent max metadata stay unknown',()=>{
 for(const data of [undefined,null,{arcane:null},{arcane:{6:1}},{arcane:{'03':1}},{arcane:{0:-1}},{arcane:{0:1.5}}]){
  const row=arcaneProgress(item,data);assert.equal(row.known,false);assert.equal(row.equivalent,null);assert.ok(matchesArcaneProgress(row,'unknown'));assert.equal(matchesArcaneProgress(row,'missing'),false);
 }
 assert.equal(arcaneProgress({id:'arcane',category:'arcane'},{}).known,false);
 const missing=arcaneProgress(item,{});assert.equal(missing.known,true);assert.equal(missing.owned,0);assert.ok(matchesArcaneProgress(missing,'missing'));
 assert.equal(arcaneCopies(21),null);
});
test('normal inventory instances preserve actual per-rank counts and never repeat aggregate stock',()=>{
 assert.deepEqual(upgradeInstances(item,{arcane:{0:2,3:1,5:4}},7),[{rank:0,count:2,known:true},{rank:3,count:1,known:true},{rank:5,count:4,known:true}]);
 assert.deepEqual(upgradeInstances(item,null,7),[{rank:null,count:7,known:false}]);
 assert.deepEqual(upgradeInstances(item,{},0),[{rank:null,count:0,known:true}]);
 const mod={id:'mod',category:'mod',mod:{fusionLimit:10}};
 assert.deepEqual(upgradeInstances(mod,{mod:{4:2,10:1}},3).map(r=>[r.rank,r.count]),[[4,2],[10,1]]);
 assert.equal(upgradeOwnership({mod:{11:1}},'mod',10).known,false);
});
test('remaining-copy sort keeps unknown values at the end in both directions',()=>{
 const a=arcaneProgress(item,{arcane:{0:20}}),b=arcaneProgress(item,{arcane:{0:2}}),unknown=arcaneProgress(item,null);
 assert.ok(compareArcaneProgress(a,b)<0);assert.ok(compareArcaneProgress(a,b,true)>0);
 assert.ok(compareArcaneProgress(a,unknown)<0);assert.ok(compareArcaneProgress(a,unknown,true)<0);
});
test('reference completion groups keep ready first and maxed after missing even when reversed',()=>{
 const ready=arcaneProgress(item,{arcane:{0:21}}),collecting=arcaneProgress(item,{arcane:{0:2}}),missing=arcaneProgress(item,{}),maxed=arcaneProgress(item,{arcane:{5:1}}),unknown=arcaneProgress(item,null);
 for(const reverse of [false,true])assert.deepEqual([unknown,maxed,missing,collecting,ready].sort((a,b)=>compareArcaneProgress(a,b,reverse)).map(r=>r.known?r.maxed!>0?'maxed':r.remaining===0?'ready':r.owned?'collecting':'missing':'unknown'),['ready','collecting','missing','maxed','unknown']);
});

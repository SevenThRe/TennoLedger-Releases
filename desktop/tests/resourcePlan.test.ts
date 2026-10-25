import {test} from 'node:test';
import assert from 'node:assert/strict';
import {planResources,type ResourceRecipe} from '../src/resourcePlan.ts';
const recipe=(itemId:string,quantity=1,output=1):ResourceRecipe=>({output,parts:[{itemId,quantity}]});
test('two targets share stock instead of each claiming the same resources',()=>{
 const p=planResources([{itemId:'a',quantity:1},{itemId:'b',quantity:1}],{a:recipe('ore',4),b:recipe('ore',4)},{ore:5});
 assert.equal(p.requirements.ore.needed,8);assert.equal(p.requirements.ore.allocated,5);assert.equal(p.requirements.ore.missing,3);
 assert.deepEqual(p.goals[0].missing,[]);assert.deepEqual(p.goals[1].missing,['ore']);
});
test('finished goals are reserved before recursive materials',()=>{
 const p=planResources([{itemId:'a',quantity:1},{itemId:'b',quantity:1}],{a:recipe('b'),b:recipe('ore',2)},{b:1,ore:2});
 assert.equal(p.goals[1].owned,1);assert.equal(p.requirements.b.allocated,0);assert.equal(p.requirements.ore.needed,2);
});
test('pending outputs cover demand without consuming inputs again',()=>{
 const p=planResources([{itemId:'a',quantity:1}],{a:recipe('b'),b:recipe('ore',2)},{},{b:1});
 assert.equal(p.requirements.b.pending,1);assert.equal(p.requirements.ore,undefined);assert.equal(p.goals[0].waiting,true);
});
test('batch leftovers share costs and missing dependency with later targets',()=>{
 const p=planResources([{itemId:'a',quantity:1},{itemId:'c',quantity:1}],{a:recipe('b'),c:recipe('b'),b:recipe('ore',5,3)},{ore:2});
 assert.equal(p.requirements.ore.needed,5);assert.equal(p.requirements.b.fromBatches,1);assert.deepEqual(p.goals[1].missing,['ore']);
 assert.deepEqual(p.requirements.ore.usedBy,['a','c']);
});
test('reusable blueprint is retained once across batches and goals',()=>{
 const r:ResourceRecipe={output:1,parts:[{itemId:'bp',quantity:1,reusable:true},{itemId:'ore',quantity:2}]};
 const p=planResources([{itemId:'a',quantity:3},{itemId:'b',quantity:1}],{a:r,b:r},{bp:1,ore:8});
 assert.equal(p.requirements.bp.needed,1);assert.equal(p.requirements.ore.needed,8);assert.equal(p.incomplete,false);
});
test('unknown inventory, missing recipe, cycles and overflow never imply readiness',()=>{
 assert.equal(planResources([{itemId:'a',quantity:1}],{a:recipe('ore')},{}, {},false).incomplete,true);
 assert.equal(planResources([{itemId:'a',quantity:1}],{},{}).incomplete,true);
 assert.equal(planResources([{itemId:'a',quantity:1}],{a:recipe('b'),b:recipe('a')},{}).incomplete,true);
 assert.equal(planResources([{itemId:'a',quantity:2}],{a:recipe('ore',Number.MAX_SAFE_INTEGER)},{}).incomplete,true);
});
test('paused targets consume nothing and credits share the same budget',()=>{
 const r={...recipe('ore'),credits:10};
 const p=planResources([{itemId:'a',quantity:3,paused:true},{itemId:'b',quantity:2}],{a:r,b:r},{ore:2,credits:15});
 assert.equal(p.requirements.credits.missing,5);assert.equal(p.requirements.ore.needed,2);
});

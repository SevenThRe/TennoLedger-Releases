import {test} from 'node:test';import assert from 'node:assert/strict';
import {relicRewardTiers,relicDucatValues} from '../src/relicOverviewModel.ts';
import type {Relic} from '../src/relicModel.ts';
import {expectedBest} from '../src/relicExtrasModel.ts';
test('Radiant retains bronze silver gold order despite inverted common and uncommon chances',()=>{
 const intact={base:'Lith T1',refinement:'Intact',rewards:[{id:'c',chance:25.33},{id:'u',chance:11},{id:'r',chance:2}]} as Relic;
 const radiant={...intact,refinement:'Radiant',rewards:[{id:'c',chance:16.67},{id:'u',chance:20},{id:'r',chance:10}]} as Relic;
 assert.deepEqual(relicRewardTiers(radiant,[intact,radiant]).map(r=>[r.id,r.tier]),[['c',0],['u',1],['r',2]]);
 assert.ok(relicRewardTiers(radiant,[radiant]).every(r=>r.tier===-1));
});
test('Forma blueprint contributes zero ducats without turning other unknown rewards into zero',()=>{
 const r={rewards:[{id:'/Lotus/Types/Recipes/Components/FormaBlueprint',ducats:null},{id:'unknown',ducats:null},{id:'prime',ducats:45}]} as Relic;
 const values=relicDucatValues(r);assert.equal(values[r.rewards[0].id],0);assert.equal(values.unknown,null);assert.equal(values.prime,45);
});
test('known zero-value rewards permit squad expected ducats but missing metadata still blocks it',()=>{
 const relic={rewards:[{id:'/Lotus/Types/Recipes/Components/FormaBlueprint',chance:50,ducats:null},{id:'prime',chance:50,ducats:100}]} as Relic;
 assert.equal(expectedBest(relic,relicDucatValues(relic),1),50);
 assert.equal(expectedBest(relic,relicDucatValues(relic),4),93.75);
 const unknown={...relic,rewards:[relic.rewards[0],{id:'unknown',chance:50,ducats:null}]};
 assert.equal(expectedBest(unknown,relicDucatValues(unknown),4),null);
});

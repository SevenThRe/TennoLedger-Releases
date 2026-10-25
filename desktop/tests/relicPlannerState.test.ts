import test from 'node:test';
import assert from 'node:assert/strict';
import {allState,accepts,missingReward,allRewardState,isFormaReward} from '../src/relicPlannerState.ts';

test('Forma does not block all-owned filters while unknown prime rewards remain unknown',()=>{
 const rewards=[{id:'/Lotus/Types/Recipes/Components/FormaBlueprint'},{id:'prime'}];
 assert.equal(allRewardState(rewards,id=>id==='prime'?true:false),true);
 assert.equal(allRewardState(rewards,()=>null),null);
 assert.equal(allRewardState(rewards,()=>false),false);
 assert.equal(accepts(allRewardState(rewards,()=>null),'no'),false);
});
test('Forma exemption uses the catalog ID instead of partial display names',()=>{
 assert.equal(isFormaReward('/Lotus/Types/Recipes/Components/FormaBlueprint'),true);
 assert.equal(isFormaReward('/Other/FormaPrimeBlueprint'),false);
 assert.equal(allRewardState([{id:'/Other/FormaPrimeBlueprint'}],()=>false),false);
 assert.equal(allRewardState([],()=>true),null);
});
test('ownership tri-state does not turn unknown into missing',()=>{assert.equal(allState([true,null]),null);assert.equal(allState([false,null]),false);assert.equal(allState([]),null);assert.equal(accepts(null,'no'),false);assert.equal(accepts(null,'yes'),false);assert.equal(accepts(null,'all'),true);});
test('missing reward requires both known zero and known absent parent',()=>{assert.equal(missingReward(0,false),true);assert.equal(missingReward(0,null),null);assert.equal(missingReward(null,false),null);assert.equal(missingReward(1,null),false);assert.equal(missingReward(null,true),false);assert.equal(missingReward(0,true),false);});

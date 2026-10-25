import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseResourcePreferences,resourceDefaults,sortCraftingGoals,craftingGoalStatus} from '../src/resourcePreferences.ts';
import type {GoalResult} from '../src/resourcePlan.ts';
test('view and independent inventory/material filters survive serialization',()=>{
 const prefs={...resourceDefaults,view:'plan',ownedOnly:false,inventoryOrder:'quantity',materialType:'blueprint',materialOrder:'owned',missingOnly:false};
 assert.deepEqual(parseResourcePreferences(JSON.stringify(prefs)),prefs);
 assert.deepEqual(parseResourcePreferences(null),resourceDefaults);
 assert.equal(parseResourcePreferences('{"view":"shards"}').view,'shards');
});
test('invalid fields use defaults and malformed storage is reported without accepting transient state',()=>{
 assert.throws(()=>parseResourcePreferences('{'));
 assert.throws(()=>parseResourcePreferences('null'));
 assert.deepEqual(parseResourcePreferences('{"view":"wrong","ownedOnly":"false","materialOrder":{},"search":"ore","focus":"goal"}'),resourceDefaults);
});
const goal=(itemId:string,patch:Partial<GoalResult>={}):GoalResult=>({itemId,quantity:1,owned:0,pending:0,toCraft:1,missing:[],unknown:false,waiting:false,...patch});
test('goal presentation uses reference state order without mutating allocation order',()=>{
 const input=[goal('unknown',{unknown:true}),goal('missing',{missing:['ore']}),goal('ready'),goal('waiting',{waiting:true}),goal('owned',{owned:1})];
 assert.deepEqual(sortCraftingGoals(input,id=>id).map(g=>g.itemId),['owned','waiting','ready','missing','unknown']);
 assert.equal(input[0].itemId,'unknown');
 assert.equal(craftingGoalStatus(goal('mixed',{waiting:true,missing:['ore']})),'missing');
 assert.equal(craftingGoalStatus(goal('unverified',{owned:1,unknown:true})),'unknown');
});
test('same-state goals sort by display name with stable ID tie break',()=>{
 assert.deepEqual(sortCraftingGoals([goal('b'),goal('a'),goal('z')],id=>id==='z'?'A':'B').map(g=>g.itemId),['z','a','b']);
});

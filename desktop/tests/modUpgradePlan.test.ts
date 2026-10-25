import {test} from 'node:test';
import assert from 'node:assert/strict';
import {modUpgradeCost,modUpgradePlan,modRankOwnership,type ModUpgradeTarget} from '../src/modUpgradePlan.ts';
const target=(id:string,patch:Partial<ModUpgradeTarget>={}):ModUpgradeTarget=>({id,currentRank:0,targetRank:1,maximumRank:10,rarityMultiplier:1,owned:true,known:true,...patch});
test('upgrade costs use exponential deltas and four rarity multipliers',()=>{
 assert.deepEqual(modUpgradeCost(0,10,4),{endo:40920,credits:1976436});
 assert.deepEqual(modUpgradeCost(9,10,4),{endo:20480,credits:989184});
 assert.deepEqual(modUpgradeCost(5,3,2),{endo:0,credits:0});
 for(const args of [[0,21,1],[-1,1,1],[0,1,0],[0,1,5],[0,1.5,1]])assert.equal(modUpgradeCost(...args as [number,number,number]),null);
});
test('unowned goals reserve budgets in order; pauses and complete goals do not',()=>{
 const plan=modUpgradePlan([target('paused',{paused:true}),target('complete',{currentRank:1}),target('first',{owned:false}),target('second'),target('second')],{endo:15,credits:1000},true);
 assert.deepEqual(plan.goals.map(g=>g.status),['paused','complete','not_owned','saving']);
 assert.equal(plan.goals[3].allocatedEndo,5);assert.equal(plan.goals[3].missingEndo,5);
 assert.equal(plan.totalEndo,20);assert.equal(plan.totalCredits,966);
});
test('unknown ranks never consume resources; unknown balances never imply ready',()=>{
 const plan=modUpgradePlan([target('unknown',{known:false}),target('ready')],{endo:10,credits:483},true);
 assert.deepEqual(plan.goals.map(g=>g.status),['unknown','ready']);assert.equal(plan.incomplete,true);
 const missing=modUpgradePlan([target('one')],{endo:null,credits:483},true);
 assert.equal(missing.goals[0].status,'unknown');assert.equal(missing.goals[0].missingEndo,null);
 assert.equal(modUpgradePlan([target('one')],{endo:100,credits:1000},false).goals[0].endo,null);
});
test('reserves reduce each independent budget and invalid ranks remain unknown',()=>{
 const plan=modUpgradePlan([target('one')],{endo:30,credits:1000,reservedEndo:21,reservedCredits:600},true);
 assert.equal(plan.goals[0].missingEndo,1);assert.equal(plan.goals[0].missingCredits,83);
 assert.equal(modUpgradePlan([target('bad',{currentRank:11})],{endo:100,credits:1000},true).unknown,1);
});
test('rank inventory distinguishes absent, unowned, unknown and duplicate ranks',()=>{
 assert.equal(modRankOwnership(null,'one',10).known,false);
 assert.deepEqual(modRankOwnership({},'one',10),{known:true,owned:0,highestRank:0,maxed:0});
 assert.deepEqual(modRankOwnership({one:{0:5,5:2,10:1}},'one',10),{known:true,owned:8,highestRank:10,maxed:1});
 for(const value of [null,{'11':1},{'1':-1},{'1':1.5},{'01':1}])assert.equal(modRankOwnership({one:value},'one',10).known,false);
});

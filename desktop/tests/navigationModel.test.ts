import test from 'node:test';
import assert from 'node:assert/strict';
import {navigationChild,navigationChildren,navigationDetailEqual,navigationGroups,navigationIcons,navigationLabels} from '../src/navigationModel.ts';

test('navigation only exposes implemented module views',()=>{
 assert.deepEqual(Object.keys(navigationChildren).sort(),['analytics','market','planner','resources','rivens']);
 assert.deepEqual(navigationChildren.analytics.map(child=>child.detail.view),['personal','market']);
 assert.deepEqual(navigationChildren.market.map(child=>child.detail.view),['orders','contracts']);
 assert.deepEqual(navigationChildren.resources.map(child=>child.detail.view),['inventory','plan','shards']);
 assert.deepEqual(navigationChildren.planner.map(child=>child.detail.view),['mods','endo']);
 assert.deepEqual(navigationChildren.rivens.map(child=>child.detail.view),['unveiled','veiled','finder','sniper']);
 for(const children of Object.values(navigationChildren))for(const child of children){assert.equal(navigationChild(child.detail),child);assert.ok(child.zh);assert.ok(child.en);}
});
test('unrecognized page/view combinations do not resolve to an actionable destination',()=>{
 for(const value of [null,[],{},'resources',{page:'resources',view:'mods'},{page:'market',view:'unrecognized'},{page:'__proto__',view:'inventory'},{page:'planner',view:'builds'}])assert.equal(navigationChild(value),undefined);
 assert.equal(navigationDetailEqual(undefined,{page:'planner',view:'mods'}),false);
 assert.equal(navigationDetailEqual({page:'planner',view:'mods'},{page:'planner',view:'endo'}),false);
 assert.equal(navigationDetailEqual({page:'planner',view:'mods'},{page:'planner',view:'mods'}),true);
});

test('strict reference rail preserves original entry order and icon identities',()=>{
 assert.deepEqual(navigationGroups.flatMap(group=>[...group.pages]),['foundry','mastery','inventory','relic','resources','rivens','market','analytics','arbitrations','overview','planner','help']);
 assert.equal(navigationIcons.inventory.file,'vaulted.png');
 assert.equal(navigationIcons.market.file,'wfMarketIconBW.png');
 assert.equal(navigationIcons.relic.file,'fissure.webp');
 assert.equal(navigationIcons.resources.file,'resources.svg');
 assert.equal(navigationLabels.overview.en,'Stats');
});

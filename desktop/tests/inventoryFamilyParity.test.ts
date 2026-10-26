import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inventoryMarketSlugs,inventoryDucatRatio} from '../src/inventoryMarketModel.ts';
import {relicFamilyCount,matchesRelicTenCopies,plannerRefinementRows,readPlannerOverlayFilters} from '../src/relicPlannerFilters.ts';
import type {Relic} from '../src/relicModel.ts';
test('market identity mapping retains exact upgrade identities, strips only StoreItems prefix and rejects invalid slugs',()=>{
 const rows=[{gameRef:'/Lotus/StoreItems/Upgrades/Mod',slug:'valid_mod'},{gameRef:'/Lotus/Upgrades/Arcane',slug:'arcane'},{gameRef:'/Lotus/X',slug:'bad slug'}] as any;
 assert.deepEqual(inventoryMarketSlugs(rows,{'/known':'known'}),{'/known':'known','/Lotus/Upgrades/Mod':'valid_mod','/Lotus/Upgrades/Arcane':'arcane'});
 assert.equal(inventoryDucatRatio(100,5),20);assert.equal(inventoryDucatRatio(100,0),null);assert.equal(inventoryDucatRatio(0,5),null);
});
test('planner owned refinements and ten-copy filter use complete family totals without fabricating unknown inventory',()=>{
 const variants=[{id:'a',aliases:['alias'],refinement:'Intact'},{id:'b',refinement:'Radiant'}] as Relic[];
 const inventory={counts:{a:4,alias:4,b:6},complete:true};
 assert.equal(relicFamilyCount(variants,inventory),14);assert(matchesRelicTenCopies(10,'yes'));assert(!matchesRelicTenCopies(9,'yes'));assert(!matchesRelicTenCopies(null,'no'));
 assert.deepEqual(plannerRefinementRows(variants,{counts:{b:6},complete:true},'owned').map(r=>r.id),['b']);
 assert.equal(relicFamilyCount(variants,{counts:{a:4},complete:false}),null);
});
test('planner overlay preferences validate every supported filter and squad size',()=>{
 const f={era:'Meso',refinement:'Radiant',vault:'no',favorites:'order',sort:'missing',descending:true,players:4,search:'Atlas',rewardFilter:'no',parentFilter:'all',tenCopies:'yes'};
 assert.deepEqual(readPlannerOverlayFilters(f),f);assert.equal(readPlannerOverlayFilters({...f,players:5}),null);assert.equal(readPlannerOverlayFilters({...f,sort:'unknown'}),null);
});

import {resourceInventoryNeed} from '../src/resourceInventoryNeed.ts';
import {refinementTraceCost} from '../src/relicPlannerFilters.ts';
import {inventoryCategoryFilters,inventoryCategoryOrder} from '../src/inventoryFiltersModel.ts';
import {compareInventory} from '../src/inventoryViewModel.ts';
test('resource reserves retain partial shortages and use computed missing after batch output',()=>{
 const plan={inventoryKnown:true,incomplete:false,requirements:{r:{needed:10,missing:0,owned:0,fromBatches:10}}} as any;
 assert.deepEqual(resourceInventoryNeed(plan,'r'),{kind:'keep',quantity:10,covered:true});
 assert.deepEqual(resourceInventoryNeed({...plan,incomplete:true},'r'),{kind:'unverified',quantity:null,covered:false});
 plan.requirements.r.missing=3;
 assert.deepEqual(resourceInventoryNeed({...plan,incomplete:true},'r'),{kind:'atLeast',quantity:3,covered:false});
 assert.equal(resourceInventoryNeed(null,'r').kind,'unavailable');
});
test('refinement cards use actual trace costs for all four tiers',()=>{
 assert.deepEqual(['Intact','Exceptional','Flawless','Radiant'].map(refinementTraceCost),[0,25,50,100]);
});
test('category changes retain shared filters and normalize unsupported sorting',()=>{
 const filters={vaulted:'yes',favorite:'no',minPlat:'15',completeSet:'yes'};
 assert.deepEqual(inventoryCategoryFilters(filters,'mod'),{favorite:'no',minPlat:'15'});
 assert.deepEqual(inventoryCategoryFilters(filters,'arcane',true),{favorite:'no'});
 assert.deepEqual(inventoryCategoryFilters(filters,'resource'),{});
 assert.equal(inventoryCategoryOrder('ducanator','relics'),'amount');
 assert.equal(inventoryCategoryOrder('platPrice','mod'),'platPrice');
 const row=(name:string)=>({id:name,name,amount:1,price:1,ducats:1,completion:1});
 assert(compareInventory(row('Ash'),row('Volt'),{view:'cards',order:'name',descending:true})<0);
});

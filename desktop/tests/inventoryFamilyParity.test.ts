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

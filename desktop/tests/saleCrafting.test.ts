import {applyListingReservations} from '../src/saleListings.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {reserveCraftingStock,type SaleComponent,type SaleRecipe} from '../src/saleCrafting.ts';
const part=(id:string,needed=1,components:SaleComponent[]|null=[],output=1,kind:'other'|'blueprint'='other'):SaleComponent=>({id,needed,components,output,kind});
const recipe=(id:string,components:SaleComponent[]):SaleRecipe=>({id,components});
const run=(recipes:SaleRecipe[],completed:(r:SaleRecipe)=>boolean|null=()=>false,counts:(id:string)=>number|null=()=>0,pending=new Set<string>())=>reserveCraftingStock([{id:'A',owned:5}],recipes,completed,counts,pending)[0];
test('incomplete recipes share stock and completed recipes reserve nothing',()=>{
 const r=run([recipe('Z',[part('A',3)]),recipe('B',[part('A',4)])]);assert.equal(r.keepForCrafting,5);assert.equal(r.safeToSell,0);assert.deepEqual(r.neededForItems,['B','Z']);
 assert.equal(run([recipe('B',[part('A',4)])],()=>true).safeToSell,5);
});
test('owned intermediate and manufacturing batch surplus prevent duplicate reservation',()=>{
 const r=run([recipe('B',[part('middle',1,[part('A',2)],3)]),recipe('C',[part('middle',2,[part('A',2)],3)])]);assert.equal(r.keepForCrafting,2);
 assert.equal(run([recipe('B',[part('middle',1,[part('A',2)])])],()=>false,id=>id==='middle'?1:0).keepForCrafting,0);
});
test('pending parent skips consumption; pending intermediate output counts once',()=>{
 const bp=part('bp',1,[],1,'blueprint');
 assert.equal(run([recipe('B',[bp,part('A',3)])],()=>false,()=>0,new Set(['bp'])).keepForCrafting,0);
 const middle=part('middle',1,[bp,part('A',2)],1);
 assert.equal(run([recipe('B',[middle])],()=>false,()=>0,new Set(['bp'])).keepForCrafting,0);
});
test('missing completion, recipes, stock and cycles stay unknown',()=>{
 assert.equal(run([recipe('B',[part('A')])],()=>null).safeToSell,null);
 assert.equal(run([recipe('B',[part('middle',1,[part('A')])])],()=>false,()=>null).safeToSell,null);
 const cycle=part('A');cycle.components=[cycle];assert.equal(run([recipe('B',[cycle])]).safeToSell,null);
 assert.equal(run([recipe('B',[part('A',1,null)])]).safeToSell,null);
 assert.equal(reserveCraftingStock([{id:'A',owned:5}],null,()=>false,()=>0,new Set())[0].safeToSell,null);
 assert.equal(run([]).safeToSell,null);
});

test('crafting and listings compose without spending the same copy twice',()=>{
 const crafted=reserveCraftingStock([{id:'A',owned:5}],[recipe('weapon',[part('A',2)])],()=>false,()=>0,new Set());
 const listed=applyListingReservations(crafted,[{id:'sell',type:'sell',quantity:1}],()=>new Map([['A',1]]));
 assert.equal(listed[0].keepForCrafting,2);assert.equal(listed[0].safeToSell,3);assert.equal(listed[0].safeToList,2);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {saleAvailability} from '../src/saleAvailability.ts';
const read=(file:string)=>JSON.parse(readFileSync(new URL('../public/'+file,import.meta.url),'utf8'));
test('real Ash Prime recipe and set mapping compose against captured stock and an existing set order',()=>{
 const catalog=read('catalog.json').items,recipes=read('sale-crafting-index.json').recipes,sources=read('mastery-sources.json');
 const ash='/Lotus/Powersuits/Ninja/AshPrime';
 const component=sources.items[ash].parts[0].itemId;
 const snapshot={complete:true,counts:{[component]:5},ranks:{},favorites:[ash],masteryAccount:{ranksComplete:true},pendingRecipes:{}};
 const market=[{id:'ashset',slug:'ash_prime_set',gameRef:ash,tags:['set']}];
 const orders=[{id:'listing',itemId:'ashset',type:'sell',quantity:1}];
 const result=saleAvailability([{id:component,owned:5}],catalog,recipes,sources,snapshot,market,orders,true)[0];
 assert.equal(result.keepForCrafting,1);assert.equal(result.listedForSale,1);assert.equal(result.safeToList,3);
 assert.equal(saleAvailability([{id:component,owned:5}],catalog,recipes,sources,snapshot,market,null,true)[0].safeToList,null);
});

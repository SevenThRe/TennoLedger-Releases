import test from 'node:test';
import assert from 'node:assert/strict';
import {matchesInventoryFilters,availableInventoryGroups,type InventoryFacts} from '../src/inventoryFiltersModel.ts';
const facts:InventoryFacts={itemOwned:true,copies:2,vaulted:true,listed:0,prime:true,favorite:false,price:17,completeSet:true,rank:0,equipped:null};
test('reference inventory filters compose and price thresholds are strict',()=>{
 assert.equal(matchesInventoryFilters({itemOwned:'yes',minPlat:'15',completeSet:'yes'},facts),true);
 assert.equal(matchesInventoryFilters({minPlat:'15'},{...facts,price:15}),false);
 assert.equal(matchesInventoryFilters({partType:'normal'},facts),false);
 assert.equal(matchesInventoryFilters({moreThanOneCopies:'no'},facts),false);
 assert.equal(matchesInventoryFilters({orderPlaced:'no'},facts),true);
});
test('unread ownership/orders/equipment never becomes a negative filter match',()=>{
 for(const [key,field] of [['itemOwned','itemOwned'],['orderPlaced','listed'],['equipped','equipped'],['completeSet','completeSet']] as const){
  for(const value of ['yes','no'])assert.equal(matchesInventoryFilters({[key]:value},{...facts,[field]:null}),false);
 }
 assert.deepEqual(availableInventoryGroups('resource'),[]);
 assert.deepEqual(availableInventoryGroups('arcane',true).map(g=>g.key),['favorite']);
});

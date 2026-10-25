import test from 'node:test';
import assert from 'node:assert/strict';
import {compareInventory,inventoryCompletion,inventoryScore,readInventoryView,type InventorySortRow,type InventoryViewPreferences} from '../src/inventoryViewModel.ts';
const row=(id:string,amount:number|null,price:number|null=10,ducats:number|null=45):InventorySortRow=>({id,name:id,amount,price,ducats,completion:null});
test('inventory numeric sorts precede pagination and unknowns remain last in both directions',()=>{
 const rows=[row('unknown',null),row('low',1),row('high',50)];
 for(const descending of [true,false]){
  const p:InventoryViewPreferences={view:'compact',order:'amount',descending};
  const sorted=[...rows].sort((a,b)=>compareInventory(a,b,p));
  assert.equal(sorted.at(-1)?.id,'unknown');assert.equal(sorted.slice(0,1)[0].id,descending?'high':'low');
 }
});
test('Ducanator matches reference float ratio and distinguishes missing and zero prices',()=>{
 assert.equal(inventoryScore(row('a',2,5,100),'ducanator'),20);
 assert.equal(inventoryScore(row('a',2,0,100),'ducanator'),1000000);
 assert.equal(inventoryScore(row('a',2,null,100),'ducanator'),null);
 assert.equal(inventoryScore(row('a',2,5,0),'ducanator'),0);
});
test('completion requires quantities, combines repeated identities and preserves incomplete inventory',()=>{
 const parts=[{itemId:'a',quantity:2},{itemId:'a',quantity:1},{itemId:'b',quantity:1}];
 assert.equal(inventoryCompletion(parts,id=>id==='a'?2:1),0.5);
 assert.equal(inventoryCompletion(parts,id=>id==='a'?3:1),1);
 assert.equal(inventoryCompletion(parts,id=>id==='a'?null:1),null);
 assert.equal(inventoryCompletion([],()=>0),null);
});
test('preferences recover from malformed data and preserve valid selection',()=>{
 assert.deepEqual(readInventoryView('{'),{view:'cards',order:'amount',descending:true});
 assert.deepEqual(readInventoryView('{"view":"compact","order":"ducats","descending":false}'),{view:'compact',order:'ducats',descending:false});
 assert.equal(readInventoryView('{"order":"injected"}').order,'amount');
});
test('equal values have deterministic name and identity tie breaks',()=>{
 const p:InventoryViewPreferences={view:'cards',order:'platPrice',descending:true};
 assert.ok(compareInventory(row('a',2),row('b',1),p)<0);
});

test('repeated requirement quantities must stay within safe integers',()=>{assert.equal(inventoryCompletion([{itemId:'x',quantity:Number.MAX_SAFE_INTEGER},{itemId:'x',quantity:Number.MAX_SAFE_INTEGER}],()=>Number.MAX_SAFE_INTEGER),null);});

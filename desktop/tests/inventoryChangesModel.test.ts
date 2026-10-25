import test from 'node:test';import assert from 'node:assert/strict';
import {harrowChassisId,parseInventoryChanges,inventoryChangeRows,inventoryChangeTotals,type PendingChange} from '../src/inventoryChangesModel.ts';
const part='/Lotus/Part',mod='/Lotus/Mod',arcane='/Lotus/Arcane',other='/Lotus/Other';
const change=(quantity:number,extra:Partial<PendingChange>={}):PendingChange=>({quantity,firstSeen:'2026-10-25T00:00:00Z',lastSeen:'2026-10-25T00:01:00Z',arcaneCopies:false,...extra});
const catalog=new Map([[part,{id:part,name:'Part',category:'component'}],[mod,{id:mod,name:'Mod',category:'mod'}],[arcane,{id:arcane,name:'Arcane',category:'arcane'}],[other,{id:other,name:'Weapon',category:'secondary'}]]);
const tradables={[part]:'part',[mod]:'mod',[arcane]:'arcane',[other]:'other'};
test('default deltas contain only tradable parts; Harrow is separate from copies and Ducats',()=>{
 const data=parseInventoryChanges({revision:1,pending:{[part]:change(2),[mod]:change(3),[other]:change(1),[harrowChassisId]:change(10)}});
 const rows=inventoryChangeRows(data,catalog,tradables,'parts');assert.deepEqual(rows.map(r=>r.id),[part]);
 const total=inventoryChangeTotals(rows,{[part]:{price:20,platform:'pc',fetchedAt:'2026-10-25T00:00:00Z'}},{[part]:45,[harrowChassisId]:100},'pc');
 assert.equal(total.copies,2);assert.equal(total.itemTypes,1);assert.equal(total.platinum,40);assert.equal(total.ducats,90);
 assert.equal(inventoryChangeRows(data,catalog,tradables,'all').length,3);
});
test('ranked arcane gains price actual instances instead of rank-zero equivalents',()=>{
 const data=parseInventoryChanges({revision:2,pending:{[arcane]:change(21,{arcaneCopies:true,rankQuantities:{5:1}}),[mod]:change(3,{rankQuantities:{0:2,10:1}})}});
 const rows=inventoryChangeRows(data,catalog,tradables,'all');assert.equal(rows.find(r=>r.id===arcane)!.quantity,1);
 const quotes=Object.fromEntries(rows.map(r=>[r.key,{price:r.rank===5?100:r.rank===10?200:10,platform:'pc',fetchedAt:'2026-10-25T00:00:00Z'}]));
 const total=inventoryChangeTotals(rows,quotes,{},'pc');assert.equal(total.copies,4);assert.equal(total.platinum,320);assert.equal(total.unknownEquivalent,0);
 assert.equal(inventoryChangeTotals(rows,quotes,{},'ps4').platinum,null);
});
test('legacy/mixed ranks remain unknown; unpriced and unknown Ducats never become zero',()=>{
 const data=parseInventoryChanges({revision:1,pending:{[arcane]:change(3,{arcaneCopies:true}),[mod]:change(1),[part]:change(2)}});
 const rows=inventoryChangeRows(data,catalog,tradables,'all');
 const attempted=Object.fromEntries(rows.map(r=>[r.key,{price:99,platform:'pc',fetchedAt:'2026-10-25T00:00:00Z'}]));
 const total=inventoryChangeTotals(rows,attempted,{},'pc');assert.equal(total.platinum,198);assert.equal(total.unpriced,2);assert.equal(total.unknownEquivalent,3);assert.equal(total.ducats,null);assert.equal(total.ducatUnknown,1);
 assert.equal(inventoryChangeTotals(inventoryChangeRows(data,catalog,tradables,'parts'),{}, {[part]:0},'pc').ducats,0);
});
test('rank quantity mismatches, unsafe numbers and malformed keys reject the whole delta response',()=>{
 for(const row of [change(21,{arcaneCopies:true,rankQuantities:{5:21}}),change(1,{rankQuantities:{101:1}}),change(1,{rankQuantities:{'01':1}}),change(0),change(Number.MAX_SAFE_INTEGER+1)])assert.throws(()=>parseInventoryChanges({revision:1,pending:{[mod]:row}}));
});

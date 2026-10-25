import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inventorySetState,inventorySetQuotes,compareInventorySets,inventorySetResultWindow,type InventorySet} from '../src/inventorySetsModel.ts';
test('inventory sets honor the 100-match default and explicit all-results preference',()=>{
 const rows=Array.from({length:157},(_,id)=>({id}));
 assert.deepEqual(inventorySetResultWindow(rows,false,false),{items:rows.slice(0,100),limited:true});
 assert.deepEqual(inventorySetResultWindow(rows,true,false),{items:rows,limited:false});
 assert.deepEqual(inventorySetResultWindow(rows,false,true),{items:rows,limited:false});
 assert.deepEqual(inventorySetResultWindow(rows.slice(0,100),false,false),{items:rows.slice(0,100),limited:false});
 assert.equal(rows.length,157);
});
const set:InventorySet={id:'set',slug:'real_set',parentId:'builtWeapon',name:'Set',unverifiedReason:null,parts:[{itemId:'barrel',quantity:2,slug:'barrel',ducats:15},{itemId:'blueprint',quantity:1,slug:'bp',ducats:25}]};
test('set count divides actual tradeable part counts by required quantities, never built equipment',()=>{
 const a=inventorySetState(set,{complete:true,counts:{barrel:5,blueprint:3,builtWeapon:999}});
 assert.equal(a.ready,2);assert.equal(a.completion,1);assert.equal(a.ducats,55);
 assert.equal(inventorySetState(set,{complete:true,counts:{builtWeapon:999}}).ready,0);
 assert.equal(inventorySetState(set,{complete:true,counts:{barrel:1,blueprint:3}}).completion,0.5);
});
test('unknown components and partial inventories stay unknown rather than zero or complete',()=>{
 assert.equal(inventorySetState({...set,parts:null},{complete:true,counts:{}}).ready,null);
 assert.equal(inventorySetState(set,{complete:false,counts:{barrel:5}}).completion,null);
 assert.equal(inventorySetState(set,{complete:true,counts:{barrel:-1,blueprint:1}}).ready,null);
});
test('repeated exact component identities consume required copies only once',()=>{
 const duplicate={...set,parts:[set.parts![0],set.parts![0],set.parts![1]]};
 const r=inventorySetState(duplicate,{complete:true,counts:{barrel:7,blueprint:5}});
 assert.equal(r.ready,1);assert.equal(r.ducats,85);
});
test('set prices match set slug, never its parent or a component quote',()=>{
 assert.deepEqual(inventorySetQuotes([set],[{slug:'barrel',unitPrice:999},{slug:'real_set',unitPrice:12}]),{real_set:12});
 assert.deepEqual(inventorySetQuotes([set],[{slug:'barrel',unitPrice:999}]),{});
 assert.deepEqual(inventorySetQuotes([set],[{slug:'real_set',unitPrice:12},{slug:'real_set',unitPrice:15}]),{});
});
test('set sorting uses true completion and original platinum-per-ducat direction, unknown stays last',()=>{
 const a={set,name:'a',price:100,...inventorySetState(set,{complete:true,counts:{barrel:2,blueprint:1}})},b={...a,name:'b',price:10},unknown={...a,name:'u',completion:null};
 assert.ok(compareInventorySets(a,b,{view:'cards',order:'ducanator',descending:true})<0);
 for(const descending of [true,false])assert.ok(compareInventorySets(a,unknown,{view:'cards',order:'complete',descending})<0);
});
test('production set index records incomplete coverage and verified parts have unique market identities',()=>{
 const index=JSON.parse(readFileSync(new URL('../public/inventory-sets.json',import.meta.url),'utf8'));
 const market=JSON.parse(readFileSync(new URL('./fixtures/market-catalog.json',import.meta.url),'utf8')).data;
 assert.ok(index.coverage.verified>0);assert.equal(index.coverage.verified+index.coverage.unverified.length,index.coverage.total);
 for(const s of index.sets){assert.ok(s.slug.endsWith('_set'));if(!s.parts){assert.ok(s.unverifiedReason);continue;}for(const p of s.parts){const matches=market.filter((m:any)=>m.gameRef===p.itemId&&!m.tags?.includes('set'));assert.equal(matches.length,1);assert.equal(matches[0].slug,p.slug);assert.ok(p.quantity>0);}}
 const frost=index.sets.find((s:any)=>s.slug==='frost_prime_set');assert.ok(frost.parts.some((p:any)=>p.itemId.endsWith('FrostPrimeChassisBlueprint')));assert.equal(frost.parts.some((p:any)=>p.itemId.endsWith('FrostPrimeChassisComponent')),false);
});
test('official physical set members use explicit zero-XP instances, never historical mastery or aggregate ownership',()=>{
 const physical:InventorySet={...set,parentId:'suit',parts:[{itemId:'suit',slug:'prisma_shade',quantity:1,ducats:null,countPolicy:'unranked-instance'},{itemId:'gun',slug:'prisma_burst_laser',quantity:1,ducats:null,countPolicy:'unranked-instance'}]};
 const base={complete:true,counts:{suit:5,gun:3},ranks:{suit:0,gun:30}};
 assert.equal(inventorySetState(physical,base).ready,null);
 assert.equal(inventorySetState(physical,{...base,unrankedEquipmentCounts:{suit:1,gun:1}}).ready,1);
 assert.equal(inventorySetState(physical,{...base,unrankedEquipmentCounts:{suit:0,gun:1}}).ready,0);
 assert.equal(inventorySetState(physical,{...base,unrankedEquipmentCounts:{suit:null,gun:1}}).ready,null);
 assert.equal(inventorySetState(physical,{complete:true,counts:{},unrankedEquipmentCounts:{}}).ready,null,'optional collection absence is not proven empty');
 assert.equal(inventorySetState(physical,{complete:true,counts:{suit:0,gun:0}}).ready,0);
 assert.equal(inventorySetState(physical,{complete:true,counts:{},unrankedEquipmentCounts:{suit:1,gun:1}}).ready,1,'explicit XP evidence is sufficient even without aggregate defaults');
});
test('invalid duplicate policies, aggregate overflow, and explicit null counts stay unverified',()=>{
 assert.equal(inventorySetState({...set,parts:[{...set.parts![0],quantity:Number.MAX_SAFE_INTEGER},{...set.parts![0],quantity:1}]},{complete:true,counts:{}}).ready,null);
 assert.equal(inventorySetState({...set,parts:[{...set.parts![0],countPolicy:'count'},{...set.parts![0],countPolicy:'unranked-instance'}]},{complete:true,counts:{barrel:99}}).ready,null);
 assert.equal(inventorySetState(set,{complete:true,counts:{barrel:null,blueprint:1}}).ready,null);
});

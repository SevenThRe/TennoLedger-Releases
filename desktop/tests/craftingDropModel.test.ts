import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {craftingDrops} from '../src/craftingDropModel.ts';
import {craftingState,craftableQuantity} from '../src/craftingNodeModel.ts';
import type {TreeNode} from '../src/craftingDisplay.ts';
const read=(file:string)=>JSON.parse(readFileSync(new URL('../public/'+file,import.meta.url),'utf8'));
test('real prime blueprint sources collapse refinements, count owned tiers once, and open a real relic',()=>{
 const id='/Lotus/Types/Recipes/WarframeRecipes/AshPrimeHelmetBlueprint',relics=read('relic-catalog.json').items;
 const matched=relics.find((r:any)=>r.refinement==='Intact'&&r.rewards.some((reward:any)=>reward.id===id));
 assert.ok(matched);
 const rows=craftingDrops(id,false,read('item-details.json').items,relics,read('mastery-sources.json'),{complete:true,counts:{[matched.id]:3}});
 assert.ok(rows.length);assert.equal(new Set(rows.map(r=>r.location)).size,rows.length);
 assert.equal(rows.find(r=>r.location===matched.base+' Relic')?.owned,3);
 assert.equal(rows.find(r=>r.location===matched.base+' Relic')?.chance,matched.rewards.find((r:any)=>r.id===id).chance);
 assert.equal(rows[0].relic?.refinement,'Radiant');
});
test('blueprint counterpart fallback uses its exact built component, never the parent weapon or another blueprint',()=>{
 const details={'/ExactComponent':{drops:[{location:'Mission X',chance:22}]},'/OtherComponent':{drops:[{location:'Mission Y',chance:99}]}};
 assert.deepEqual(craftingDrops('/ExactBlueprint',false,details,[],null,{counts:{},complete:false}),[{location:'Mission X',chance:22}]);
 assert.deepEqual(craftingDrops('/ExactComponent',true,details,[],null,{counts:{},complete:true}),[]);
});
test('native craft status is rendered craftable and inspector quantity is not allocated inventory',()=>{
 const node:TreeNode={itemId:'part',needed:2,owned:0,allocated:0,missing:2,status:'craft',children:[{itemId:'ore',needed:6,owned:10,allocated:6,missing:0,status:'owned',children:[]}]};
 assert.equal(craftingState(node),'craftable');
 const items=new Map([['part',{id:'part',name:'Part',zh:'部件',image:'',imageUrl:'',recipe:{output:1,parts:[{itemId:'ore',quantity:3}]}}]]);
 assert.equal(craftableQuantity(node,items),2);node.children[0].allocated=3;assert.equal(craftableQuantity(node,items),1);
 node.children[0].allocated=null;assert.equal(craftableQuantity(node,items),null);
});

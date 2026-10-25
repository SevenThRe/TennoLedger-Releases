import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {saleGoalCompleted,saleSnapshot} from '../src/saleSnapshot.ts';
import type {DemandSnapshot} from '../src/resourceDemand.ts';
import type {SaleRecipe} from '../src/saleCrafting.ts';
const items=new Map([['weapon',{id:'weapon',maxRank:30}]]);
const base:DemandSnapshot={complete:true,counts:{part:5},ranks:{weapon:30},masteryAccount:{ranksComplete:true},favorites:[],pendingRecipes:{}};
const recipes:SaleRecipe[]=[{id:'weapon',components:[{id:'part',needed:2,output:0,kind:'blueprint',components:[]}]}];
test('default mastery completion and favorites-only ownership use different rules',()=>{
 assert.equal(saleGoalCompleted('weapon',items,base,false),true);
 assert.equal(saleGoalCompleted('weapon',items,{...base,favorites:['weapon']},true),false);
 assert.equal(saleGoalCompleted('weapon',items,{...base,counts:{weapon:1},favorites:['weapon']},true),true);
 assert.equal(saleGoalCompleted('weapon',items,{...base,favorites:undefined},true),null);
 assert.equal(saleGoalCompleted('missing',items,base,false),null);
 assert.equal(saleGoalCompleted('weapon',items,{...base,ranks:{},masteryAccount:null},false),null);
});
test('snapshot adapter reserves favorite copies and protects missing capture sections',()=>{
 const rows=[{id:'part',owned:5}];
 assert.equal(saleSnapshot(rows,recipes,items,base)[0].safeToSell,5);
 assert.equal(saleSnapshot(rows,recipes,items,{...base,favorites:['weapon']},true)[0].safeToSell,3);
 assert.equal(saleSnapshot(rows,recipes,items,{...base,pendingRecipes:null})[0].safeToSell,null);
 assert.equal(saleSnapshot(rows,recipes,items,{...base,complete:false})[0].safeToSell,null);
 assert.equal(saleSnapshot(rows,recipes,items,{...base,pendingRecipes:{part:-1}})[0].safeToSell,null);
 const pending=saleSnapshot(rows,recipes,items,{...base,pendingRecipes:{part:1}});
 assert.equal(pending[0].owned,4);assert.equal(pending[0].safeToSell,4);assert.equal(rows[0].owned,5);
});
test('exported real recipe catalog preserves recursive blueprint identity and quantities',()=>{
 const index=JSON.parse(readFileSync(new URL('../public/sale-crafting-index.json',import.meta.url),'utf8'));
 assert.equal(index.schemaVersion,1);assert.match(index.sourceSha256,/^[a-f0-9]{64}$/);
 assert.equal(new Set(index.recipes.map((r:SaleRecipe)=>r.id)).size,index.recipes.length);
 let nested=0,blueprints=0;
 function visit(c:any){assert.ok(c.id);assert.ok(Number.isInteger(c.needed)&&c.needed>0);assert.ok(Number.isInteger(c.output)&&c.output>=0);assert.ok(Array.isArray(c.components));if(c.components.length)nested++;if(c.kind==='blueprint')blueprints++;c.components.forEach(visit);}
 index.recipes.forEach((r:SaleRecipe)=>r.components!.forEach(visit));assert.ok(nested>0);assert.ok(blueprints>0);
});

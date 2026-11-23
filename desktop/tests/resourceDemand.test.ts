import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resourceDemand,type DemandCatalog,type DemandSnapshot} from '../src/resourceDemand.ts';
import {pendingCrafts} from '../src/pendingCrafts.ts';
const catalog:DemandCatalog={ids:['ore'],blueprintIds:['bp'],goalIds:['a','b'],recipes:{a:{output:1,parts:[{itemId:'bp',quantity:1},{itemId:'ore',quantity:5}]},b:{output:1,parts:[{itemId:'ore',quantity:4}]}}};
const items=new Map([['a',{name:'A',maxRank:30}],['b',{name:'B',maxRank:30}]]);
const snapshot=():DemandSnapshot=>({complete:true,counts:{ore:6,bp:1},credits:100,pendingRecipes:{},favorites:['a'],ranks:{},masteryAccount:{ranksComplete:true}});
test('favorite and remaining scopes have independent allocation pools',()=>{
 const d=resourceDemand(catalog,snapshot(),items);
 assert.equal(d.favorites.requirements.ore.needed,5);assert.equal(d.favorites.requirements.ore.missing,0);
 assert.equal(d.remaining.requirements.ore.needed,9);assert.equal(d.remaining.requirements.ore.missing,3);
});
test('mastered sold equipment is excluded only from remaining unlocks',()=>{
 const s=snapshot();s.ranks={a:30};const d=resourceDemand(catalog,s,items);
 assert.equal(d.remaining.requirements.ore.needed,4);assert.equal(d.favorites.requirements.ore.needed,5);
});
test('pending production avoids reserving materials a second time',()=>{
 const s=snapshot();s.pendingRecipes={bp:1};const d=resourceDemand(catalog,s,items);
 assert.equal(d.favorites.requirements.ore,undefined);assert.equal(d.favorites.goals[0].waiting,true);
});
test('missing history or queue does not imply zero demand',()=>{
 const s=snapshot();delete s.pendingRecipes;assert.equal(resourceDemand(catalog,s,items).favorites.inventoryKnown,false);
 s.pendingRecipes={};delete s.masteryAccount;const d=resourceDemand(catalog,s,items);
 assert.equal(d.favorites.inventoryKnown,true);assert.equal(d.remaining.inventoryKnown,false);
});

test('resource recipes expand as explicit goals but stay unexpanded as ingredients',()=>{
 const c:DemandCatalog={ids:['forma'],blueprintIds:[],goalIds:['forma','weapon'],recipes:{forma:{output:1,parts:[{itemId:'ore',quantity:10}]},weapon:{output:1,parts:[{itemId:'forma',quantity:2}]}}};
 const s=snapshot();s.counts={};s.favorites=['forma','weapon'];
 const d=resourceDemand(c,s,new Map());
 assert.equal(d.favorites.incomplete,false);
 assert.equal(d.favorites.requirements.ore.needed,10);
 assert.equal(d.favorites.requirements.forma.missing,2);
});

test('complete shipped crafting catalog resolves every remaining target without double-counting sub-components',()=>{
 const c=JSON.parse(readFileSync(new URL('../public/resource-index.json',import.meta.url),'utf8'));
 const rows=JSON.parse(readFileSync(new URL('../public/catalog.json',import.meta.url),'utf8')).items;
 const itemMap=new Map<string,{id:string;name:string;maxRank?:number}>([...rows,...c.items].map((item:{id:string;name:string;maxRank?:number})=>[item.id,item]));
 const s=snapshot();s.counts={};s.favorites=c.goalIds;
 const d=resourceDemand(c,s,itemMap);
 assert.ok(d.favorites.goals.length>1000);
 assert.ok(d.remaining.goals.length>600&&d.remaining.goals.length<750);
 assert.deepEqual(d.remaining.goals.filter(g=>g.unknown).map(g=>g.itemId),[]);
 assert.equal(d.remaining.incomplete,false);
 assert.equal(d.favorites.incomplete,false);

 const goalSet=new Set(c.goalIds);
 const childGoals=new Set<string>();
 for(const gid of c.goalIds){
  for(const part of c.recipes[gid]?.parts??[]){
   if(!part.reusable&&goalSet.has(part.itemId)&&part.itemId!==gid)childGoals.add(part.itemId);
  }
 }
 const leakedSubParts=d.remaining.goals.filter(g=>!((itemMap.get(g.itemId)?.maxRank??0)>0)&&childGoals.has(g.itemId));
 assert.deepEqual(leakedSubParts,[]);
 assert.equal(d.remaining.goals.some(g=>g.itemId==='/Lotus/Types/Friendly/Pets/CreaturePets/CreaturePetParts/Deimos/InfestedCritterAntigenA'),true);

 const cryo=d.remaining.requirements['/Lotus/Types/Items/MiscItems/Cryotic'];
 assert.equal(cryo?.needed,123590);
 assert.equal(Object.values(cryo?.demandByGoal??{}).reduce((sum,n)=>sum+n,0),123590);
});

test('selected resource crafting expands ingredients and can be switched back',()=>{
 const c:DemandCatalog={ids:['alloy'],blueprintIds:[],goalIds:['weapon'],recipes:{weapon:{output:1,parts:[{itemId:'alloy',quantity:7}]},alloy:{output:5,parts:[{itemId:'ore',quantity:3}]}}};
 const s=snapshot();s.counts={alloy:2,ore:3};s.favorites=['weapon'];
 const expanded=resourceDemand(c,s,new Map(),new Set(['alloy'])).favorites;
 assert.equal(expanded.requirements.alloy.crafts,1);
 assert.equal(expanded.requirements.ore.needed,3);
 assert.deepEqual(expanded.goals[0].missing,[]);
 const bought=resourceDemand(c,s,new Map()).favorites;
 assert.equal(bought.requirements.ore,undefined);
 assert.equal(bought.requirements.alloy.missing,5);
});

test('Forma adapter queues resolve even when absent from the crafting tree',()=>{
 const c=JSON.parse(readFileSync(new URL('../public/resource-index.json',import.meta.url),'utf8'));
 const aura='/Lotus/Types/Recipes/Components/FormaAuraBlueprint',umbra='/Lotus/Types/Recipes/Components/UmbraFormaBlueprint';
 const p=pendingCrafts(c.recipes,new Set(c.blueprintIds),{[aura]:1,[umbra]:1},{[aura]:1,[umbra]:2},c.pendingRecipeOutputs);
 assert.equal(p.known,true);
 assert.equal(p.outputs['/Lotus/Types/Items/MiscItems/FormaAura'],1);
 assert.equal(p.outputs['/Lotus/Types/Items/MiscItems/FormaUmbra'],1);
 assert.equal(p.stock[aura],0);assert.equal(p.stock[umbra],1);
 const s=snapshot();s.pendingRecipes={[aura]:1,[umbra]:1};s.favorites=[];
 assert.equal(resourceDemand(c,s,new Map()).favorites.inventoryKnown,true);
});

test('non-mastery sub-components are excluded from remaining so parent and built parts are not double-counted',()=>{
 const frame='/Lotus/Powersuits/TestFrame',chassis='/Lotus/Types/Recipes/TestChassisComponent';
 const c:DemandCatalog={
  ids:['ore'],
  blueprintIds:[],
  goalIds:[frame,chassis],
  recipes:{
   [frame]:{output:1,parts:[{itemId:chassis,quantity:1},{itemId:'ore',quantity:3}]},
   [chassis]:{output:1,parts:[{itemId:'ore',quantity:7}]},
  },
 };
 const frameItems=new Map([[frame,{name:'Test Frame',maxRank:30}],[chassis,{name:'Test Chassis',maxRank:0}]]);
 const unowned=snapshot();unowned.counts={};unowned.ranks={};unowned.favorites=[];
 const unownedDemand=resourceDemand(c,unowned,frameItems).remaining;
 assert.deepEqual(unownedDemand.goals.map(g=>g.itemId),[frame]);
 assert.equal(unownedDemand.requirements.ore?.needed,10);
 assert.equal(unownedDemand.requirements.ore?.demandByGoal?.[frame],10);

 const ownedChassis=snapshot();ownedChassis.counts={[chassis]:1};ownedChassis.ranks={};ownedChassis.favorites=[];
 const withBuiltChassis=resourceDemand(c,ownedChassis,frameItems).remaining;
 assert.deepEqual(withBuiltChassis.goals.map(g=>g.itemId),[frame]);
 assert.equal(withBuiltChassis.requirements.ore?.needed,3);

 const masteredSold=snapshot();masteredSold.counts={};masteredSold.ranks={[frame]:30};masteredSold.favorites=[];
 const afterMastery=resourceDemand(c,masteredSold,frameItems).remaining;
 assert.equal(afterMastery.goals.length,0);
 assert.equal(afterMastery.requirements.ore,undefined);

 const ownedUnmastered=snapshot();ownedUnmastered.counts={[frame]:1};ownedUnmastered.ranks={};ownedUnmastered.favorites=[];
 const afterOwned=resourceDemand(c,ownedUnmastered,frameItems).remaining;
 assert.equal(afterOwned.goals.length,0);
 assert.equal(afterOwned.requirements.ore,undefined);
});

test('optional missing owned groups and non-catalog Foundry consumables preserve known demand',()=>{
 const optional=snapshot();
 optional.complete=false;
 optional.missingOwnedGroups=['Hoverboards','MechSuits'];
 const optionalDemand=resourceDemand(catalog,optional,items);
 assert.equal(optionalDemand.favorites.inventoryKnown,true);
 assert.equal(optionalDemand.remaining.inventoryKnown,true);

 const nonOptional=snapshot();
 nonOptional.complete=false;
 nonOptional.missingOwnedGroups=['Recipes'];
 assert.equal(resourceDemand(catalog,nonOptional,items).favorites.inventoryKnown,false);

 const withConsumable=snapshot();
 withConsumable.pendingRecipes={'/Lotus/Types/Recipes/Consumables/LargeTeamEnergyRestoreBlueprint':2};
 const consumableDemand=resourceDemand(catalog,withConsumable,items);
 assert.equal(consumableDemand.favorites.inventoryKnown,true);
 assert.equal(consumableDemand.remaining.inventoryKnown,true);
});

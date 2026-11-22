import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 OPEN_WORLD_ZONES,
 RAW_MINERALS,
 RAW_MINERAL_BY_ID,
 isRefinedMineral,
 mineralZoneFromId,
 refinedMineralIds,
} from '../src/miningCatalogModel.ts';
import {buildMiningPlan,type MiningPlannerItem,type MiningPlannerOptions} from '../src/miningPlannerModel.ts';
import type {DemandCatalog,DemandSnapshot} from '../src/resourceDemand.ts';

const defaultOptions=(patch:Partial<MiningPlannerOptions>={}):MiningPlannerOptions=>({
 scope:'unmastered_weapons',
 mrEligibleOnly:false,
 expandRefined:true,
 hideFounders:false,
 ...patch,
});

const baseSnapshot=(patch:Partial<DemandSnapshot>={}):DemandSnapshot=>({
 complete:true,
 counts:{},
 credits:1_000_000,
 pendingRecipes:{},
 favorites:[],
 ranks:{},
 masteryRank:30,
 masteryAccount:{ranksComplete:true},
 ...patch,
});

test('miningCatalogModel matches every /Lotus/Types/Items/Gems/ item in shipped resource-index.json',()=>{
 const resourceIndex=JSON.parse(readFileSync(new URL('../public/resource-index.json',import.meta.url),'utf8')) as DemandCatalog&{items:{id:string;name:string}[]};
 const gemItems=resourceIndex.items.filter(item=>item.id.startsWith('/Lotus/Types/Items/Gems/'));
 assert.equal(RAW_MINERALS.length,30);
 assert.equal(gemItems.length,60);

 const indexById=new Map(resourceIndex.items.map(item=>[item.id,item]));
 for(const raw of RAW_MINERALS){
  assert.ok(indexById.has(raw.id),`Missing raw mineral in resource-index: ${raw.id}`);
  assert.equal(Object.hasOwn(resourceIndex.recipes,raw.id),false,`Raw mineral should not have a recipe: ${raw.id}`);
  assert.equal(mineralZoneFromId(raw.id),raw.zone);
 }

 const refined=refinedMineralIds(resourceIndex.recipes);
 assert.equal(refined.size,30);
 for(const item of gemItems){
  const raw=RAW_MINERAL_BY_ID.has(item.id);
  const ref=isRefinedMineral(item.id,resourceIndex.recipes);
  assert.notEqual(raw,ref,`Gem item must be exclusively raw or refined: ${item.id}`);
  if(ref){
   const parts=resourceIndex.recipes[item.id].parts;
   assert.ok(parts.some(p=>RAW_MINERAL_BY_ID.has(p.itemId)),`Refined mineral missing raw mineral part: ${item.id}`);
   assert.ok(OPEN_WORLD_ZONES.includes(mineralZoneFromId(item.id)!));
  }
 }
});

test('cross-open-world refined alloy expansion accounts for stock, pending queue, batch rounding, and blueprint gaps',()=>{
 const adramalAlloy='/Lotus/Types/Items/Gems/Deimos/DeimosCommonOreAAlloyItem';
 const adramalBp='/Lotus/Types/Recipes/DeimosRecipes/Prospecting/DeimosCommonOreAAlloyBlueprint';
 const adramalium='/Lotus/Types/Items/Gems/Deimos/DeimosCommonOreAItem';
 const travoride='/Lotus/Types/Items/Gems/Solaris/SolarisCommonOreAItem';
 const temperedBapholite='/Lotus/Types/Items/Gems/Deimos/DeimosCommonOreBAlloyItem';
 const bapholiteBp='/Lotus/Types/Recipes/DeimosRecipes/Prospecting/DeimosCommonOreBAlloyBlueprint';
 const bapholite='/Lotus/Types/Items/Gems/Deimos/DeimosCommonOreBItem';
 const pyrol='/Lotus/Types/Items/Gems/Eidolon/CommonOreAItem';

 const catalog:DemandCatalog={
  ids:[adramalAlloy,adramalium,travoride,temperedBapholite,bapholite,pyrol],
  resourceIds:[adramalAlloy,adramalium,travoride,temperedBapholite,bapholite,pyrol],
  blueprintIds:[adramalBp,bapholiteBp],
  goalIds:['weapon'],
  recipes:{
   weapon:{output:1,parts:[{itemId:adramalAlloy,quantity:25},{itemId:temperedBapholite,quantity:10}]},
   [adramalAlloy]:{output:20,parts:[{itemId:adramalBp,quantity:1,reusable:true},{itemId:adramalium,quantity:20},{itemId:travoride,quantity:20}]},
   [temperedBapholite]:{output:20,parts:[{itemId:bapholiteBp,quantity:1,reusable:true},{itemId:bapholite,quantity:20},{itemId:pyrol,quantity:20}]},
  },
 };

 const items=new Map<string,MiningPlannerItem>([
  ['weapon',{id:'weapon',name:'Cross Zone Gun',category:'primary',maxRank:30,xpPerRank:100,masteryReq:5}],
 ]);

 // Own 6 Adramal Alloy -> deficit 19 -> 1 batch of 20.
 // Tempered Bapholite has 1 batch pending in Foundry -> 20 pending -> 0 crafts needed.
 // Own adramalBp=0 -> blueprint gap flagged; own 5 Adramalium & 25 Travoride -> need 15 Adramalium, 0 Travoride.
 const snap=baseSnapshot({
  counts:{[adramalAlloy]:6,[adramalium]:5,[travoride]:25},
  pendingRecipes:{[bapholiteBp]:1},
 });

 const result=buildMiningPlan(catalog,snap,items,defaultOptions());
 assert.equal(result.inventoryKnown,true);
 assert.equal(result.incomplete,false);

 const deimosAdramalium=result.zones.deimos.ores.find(r=>r.id===adramalium)!;
 assert.equal(deimosAdramalium.needed,20);
 assert.equal(deimosAdramalium.owned,5);
 assert.equal(deimosAdramalium.missing,15);
 assert.equal(deimosAdramalium.refinedSteps.length,1);
 assert.equal(deimosAdramalium.refinedSteps[0].crafts,1);
 assert.equal(deimosAdramalium.refinedSteps[0].blueprintMissing,true);
 assert.deepEqual(deimosAdramalium.refinedSteps[0].crossZoneInputs,['solaris']);

 // Tempered Bapholite was covered by Foundry pending queue, so Pyrol & Bapholite need 0.
 const eidolonPyrol=result.zones.eidolon.ores.find(r=>r.id===pyrol)!;
 assert.equal(eidolonPyrol.needed,0);
 assert.equal(eidolonPyrol.missing,0);

 // Travoride is required by the Deimos alloy (20 needed), covered by 25 owned.
 const solarisTravoride=result.zones.solaris.ores.find(r=>r.id===travoride)!;
 assert.equal(solarisTravoride.needed,20);
 assert.equal(solarisTravoride.missing,0);
 assert.equal(solarisTravoride.refinedSteps[0].zone,'deimos');

 assert.equal(result.zones.deimos.missingBlueprints.length,1);
 assert.equal(result.zones.deimos.missingBlueprints[0].blueprintId,adramalBp);
 assert.equal(result.goalsById.weapon.miningOnlyBlocked,false);
 assert.deepEqual(result.goalsById.weapon.missingOtherMaterials,[adramalBp]);
 assert.equal(result.miningOnlyGoalsCount,0);

 // Once the refining blueprint is owned, only raw minerals remain missing.
 const withBp=baseSnapshot({
  counts:{[adramalAlloy]:6,[adramalium]:5,[travoride]:25,[adramalBp]:1},
  pendingRecipes:{[bapholiteBp]:1},
 });
 const readyResult=buildMiningPlan(catalog,withBp,items,defaultOptions());
 assert.equal(readyResult.zones.deimos.missingBlueprints.length,0);
 assert.equal(readyResult.goalsById.weapon.miningOnlyBlocked,true);
 assert.equal(readyResult.miningOnlyGoalsCount,1);
 assert.equal(readyResult.miningOnlyXp,3000);

 // Toggling expandRefined=false stops expanding Adramal Alloy into raw ores.
 const unexpanded=buildMiningPlan(catalog,snap,items,defaultOptions({expandRefined:false}));
 assert.equal(unexpanded.zones.deimos.ores.find(r=>r.id===adramalium)!.needed,0);
 assert.equal(unexpanded.goalsById.weapon.miningOnlyBlocked,false);
});

test('scopes respect unmastered weapons, all mastery gear, MR filter, hideFounders, and favorites',()=>{
 const pyrol='/Lotus/Types/Items/Gems/Eidolon/CommonOreAItem';
 const rubedo='/Lotus/Types/Items/MiscItems/Rubedo';
 const skanaPrime='/Lotus/Weapons/Tenno/Melee/LongSword/SkanaPrime';
 const balla='/Lotus/Weapons/Ostron/Melee/ModularMelee01/Tip/TipOne';
 const chassis='/Lotus/Types/Recipes/WarframeRecipes/TestChassisComponent';

 const catalog:DemandCatalog={
  ids:[pyrol,rubedo],
  resourceIds:[pyrol,rubedo],
  blueprintIds:[],
  goalIds:['frame','highMrGun'],
  recipes:{
   [balla]:{output:1,parts:[{itemId:pyrol,quantity:10}]},
   highMrGun:{output:1,parts:[{itemId:pyrol,quantity:5},{itemId:rubedo,quantity:100}]},
   [skanaPrime]:{output:1,parts:[{itemId:pyrol,quantity:5}]},
   frame:{output:1,parts:[{itemId:chassis,quantity:1}]},
   [chassis]:{output:1,parts:[{itemId:pyrol,quantity:20}]},
   masteredWeapon:{output:1,parts:[{itemId:pyrol,quantity:50}]},
  },
 };

 const items=new Map<string,MiningPlannerItem>([
  [balla,{id:balla,name:'Balla',category:'melee',maxRank:30,xpPerRank:100,masteryReq:0}],
  ['highMrGun',{id:'highMrGun',name:'High MR Gun',category:'primary',maxRank:30,xpPerRank:100,masteryReq:14}],
  [skanaPrime,{id:skanaPrime,name:'Skana Prime',category:'melee',maxRank:30,xpPerRank:100,masteryReq:0}],
  ['frame',{id:'frame',name:'Mineral Frame',category:'warframe',maxRank:30,xpPerRank:200,masteryReq:0}],
  [chassis,{id:chassis,name:'Test Chassis',category:'component',maxRank:0,xpPerRank:0,masteryReq:0}],
  ['masteredWeapon',{id:'masteredWeapon',name:'Done Gun',category:'secondary',maxRank:30,xpPerRank:100,masteryReq:0}],
 ]);

 const snap=baseSnapshot({
  masteryRank:8,
  ranks:{masteredWeapon:30},
  favorites:['frame'],
 });

 // unmastered_weapons with hideFounders=true, mrEligibleOnly=false: Balla + highMrGun (excludes frame, chassis, masteredWeapon, skanaPrime)
 const weapons=buildMiningPlan(catalog,snap,items,defaultOptions({hideFounders:true}));
 assert.deepEqual(Object.keys(weapons.goalsById).sort(),[balla,'highMrGun']);
 assert.equal(weapons.goalsById[balla].miningOnlyBlocked,true);
 assert.equal(weapons.goalsById.highMrGun.miningOnlyBlocked,false);
 assert.equal(weapons.zones.eidolon.ores.find(r=>r.id===pyrol)!.needed,15);
 assert.deepEqual(weapons.zones.eidolon.miningOnlyGoalIds,[balla]);
 assert.equal(weapons.zones.eidolon.miningOnlyXp,3000);

 // mrEligibleOnly=true excludes highMrGun (MR 14 > player MR 8)
 const mrFiltered=buildMiningPlan(catalog,snap,items,defaultOptions({hideFounders:true,mrEligibleOnly:true}));
 assert.deepEqual(Object.keys(mrFiltered.goalsById),[balla]);

 // unmastered_all includes Warframe and expands chassis without double-counting chassis as an independent goal
 const allUnmastered=buildMiningPlan(catalog,snap,items,defaultOptions({scope:'unmastered_all',hideFounders:true}));
 assert.ok('frame' in allUnmastered.goalsById);
 assert.equal(chassis in allUnmastered.goalsById,false);
 assert.equal(allUnmastered.zones.eidolon.ores.find(r=>r.id===pyrol)!.needed,35);

 // favorites scope evaluates only snapshot.favorites
 const favs=buildMiningPlan(catalog,snap,items,defaultOptions({scope:'favorites'}));
 assert.deepEqual(Object.keys(favs.goalsById),['frame']);
 assert.equal(favs.zones.eidolon.ores.find(r=>r.id===pyrol)!.needed,20);
});

test('shipped catalog.json and resource-index.json build clean full mining plan including 11 Zaw strikes',()=>{
 const resourceIndex=JSON.parse(readFileSync(new URL('../public/resource-index.json',import.meta.url),'utf8')) as DemandCatalog;
 const catalog=JSON.parse(readFileSync(new URL('../public/catalog.json',import.meta.url),'utf8')) as {items:MiningPlannerItem[]};
 const items=new Map(catalog.items.map(it=>[it.id,it]));

 const plan=buildMiningPlan(resourceIndex,baseSnapshot(),items,defaultOptions({scope:'unmastered_all'}));
 assert.equal(plan.inventoryKnown,true);
 assert.equal(plan.incomplete,false);
 assert.ok('/Lotus/Weapons/Ostron/Melee/ModularMelee01/Tip/TipOne' in plan.goalsById,'Expected Balla Zaw strike in mining goals');
 for(const zone of OPEN_WORLD_ZONES){
  assert.ok(plan.zones[zone].missingCount>0,`Expected missing minerals in zone ${zone}`);
  assert.ok(plan.zones[zone].potentialXp>0,`Expected potential XP in zone ${zone}`);
 }
});

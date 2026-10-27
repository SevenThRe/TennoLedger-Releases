import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildModPlan,visiblePlannerMods,type PlannerMod} from '../src/modPlannerModel.ts';
const catalog:PlannerMod[]=JSON.parse(readFileSync(new URL('../public/mod-planner-index.json',import.meta.url),'utf8')).items;
const supported=catalog.filter(row=>row.upgradeSupported),mod=supported.find(row=>row.maximumRank===10&&row.rarity==='Legendary')!;

test('Warm Coat internal variants do not inflate missing collection; real owned copies remain distinct',()=>{
 const normal='/Lotus/Upgrades/Mods/Warframe/AvatarMissionSpecificResistanceIce';
 const expert='/Lotus/Upgrades/Mods/Warframe/Expert/AvatarMissionSpecificResistanceIceExpert';
 const intermediate='/Lotus/Upgrades/Mods/Warframe/Intermediate/AvatarMissionSpecificResistanceIceIntermediate';
 const subset=catalog.filter(m=>[normal,expert,intermediate].includes(m.id));
 assert.equal(subset.length,3);
 const build=(ranks:Record<string,Record<string,number>>,favorites:string[]=[])=>buildModPlan(subset,{upgradeCountsByRank:ranks,favorites},{useFavorites:true,goals:[]});
 assert.deepEqual(visiblePlannerMods(build({}).items).map(m=>m.id),[normal]);
 assert.equal(visiblePlannerMods(build({}).items,true).length,3);
 const owned=visiblePlannerMods(build({[expert]:{'5':1}}).items);
 assert.equal(owned.find(m=>m.id===expert)?.highestRank,5);
 assert.equal(owned.find(m=>m.id===normal)?.owned,0);
 assert.equal(visiblePlannerMods(build({},[intermediate]).items).length,2);
});
test('patched production catalog has bounded supported costs and distinct IDs',()=>{
 assert.equal(new Set(catalog.map(m=>m.id)).size,catalog.length);
 assert.ok(supported.length>1000);
 for(const row of supported){assert.ok(row.maximumRank>0&&row.maximumRank<=20);assert.ok(row.rarityMultiplier>=1&&row.rarityMultiplier<=4);assert.ok(!row.id.includes('/Railjack/'));}
});
test('real MOD metadata and rank snapshot produce exact full upgrade budget',()=>{
 const result=buildModPlan(catalog,{upgradeCountsByRank:{[mod.id]:{'0':1}},credits:1976436,playerProfile:{endo:40920}},{useFavorites:false,goals:[{id:mod.id,targetRank:10}]});
 assert.equal(result.plan.goals[0].status,'ready');assert.equal(result.plan.totalEndo,40920);
 assert.equal(buildModPlan(catalog,null,{useFavorites:false,goals:[{id:mod.id,targetRank:10}]}).plan.goals[0].status,'unknown');
});
test('favorites select supported targets and disregard manual reserves',()=>{
 const unsupported=catalog.find(row=>!row.upgradeSupported)!;
 const result=buildModPlan(catalog,{upgradeCountsByRank:{[mod.id]:{'0':1}},favorites:[mod.id,unsupported.id],credits:1976436,playerProfile:{endo:40920}},{useFavorites:true,goals:[],reservedEndo:1e9,reservedCredits:1e12});
 assert.equal(result.plan.goals.length,1);assert.equal(result.plan.goals[0].status,'ready');
 assert.throws(()=>buildModPlan(catalog,null,{useFavorites:false,goals:Array(101).fill({id:mod.id,targetRank:10})}));
});

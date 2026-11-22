import {planResources,type ResourceGoal} from './resourcePlan.ts';
import {pendingCrafts} from './pendingCrafts.ts';
import type {DemandCatalog,DemandSnapshot} from './resourceDemand.ts';
import {founderIds} from './masteryModel.ts';
import {
 OPEN_WORLD_ZONES,
 RAW_MINERALS,
 RAW_MINERAL_BY_ID,
 ZONE_VENDOR,
 mineralZoneFromId,
 refinedMineralIds,
 type MineralRarity,
 type MiningVendor,
 type OpenWorldZone,
 type RawMineralMeta,
} from './miningCatalogModel.ts';

export type MiningTargetScope='unmastered_weapons'|'unmastered_all'|'favorites';

export type MiningPlannerItem={
 id:string;
 name:string;
 zh?:string;
 category?:string;
 maxRank?:number;
 xpPerRank?:number;
 masteryReq?:number;
 prime?:boolean;
};

export type MiningPlannerOptions={
 scope:MiningTargetScope;
 mrEligibleOnly:boolean;
 expandRefined:boolean;
 hideFounders:boolean;
};

export type MiningBlueprintGap={
 blueprintId:string;
 refinedId:string;
 zone:OpenWorldZone;
 vendor:MiningVendor;
 owned:number;
 craftsNeeded:number;
};

export type RefinedStep={
 refinedId:string;
 zone:OpenWorldZone;
 crafts:number;
 outputPerCraft:number;
 needed:number;
 missing:number;
 owned:number;
 pending:number;
 blueprintId:string|null;
 blueprintMissing:boolean;
 crossZoneInputs:OpenWorldZone[];
};

export type MineralDemandRow={
 id:string;
 meta:RawMineralMeta;
 needed:number;
 owned:number;
 allocated:number;
 missing:number;
 usedByGoals:string[];
 refinedSteps:RefinedStep[];
 readyAfterMiningGoals:string[];
 potentialXp:number;
};

export type MiningGoalRow={
 itemId:string;
 category:string;
 xp:number;
 masteryReq:number;
 masteryBlocked:boolean;
 owned:number;
 pending:number;
 missingRawMinerals:string[];
 missingOtherMaterials:string[];
 miningOnlyBlocked:boolean;
 favorite:boolean;
};

export type ZoneMiningPlan={
 zone:OpenWorldZone;
 vendor:MiningVendor;
 ores:MineralDemandRow[];
 gems:MineralDemandRow[];
 missingCount:number;
 totalMissingUnits:number;
 needsSunpointDrill:boolean;
 missingBlueprints:MiningBlueprintGap[];
 goalIds:string[];
 miningOnlyGoalIds:string[];
 potentialXp:number;
 miningOnlyXp:number;
};

export type MiningPlanResult={
 inventoryKnown:boolean;
 incomplete:boolean;
 scope:MiningTargetScope;
 totalGoals:number;
 goalsUsingMining:number;
 miningOnlyGoalsCount:number;
 totalPotentialXp:number;
 miningOnlyXp:number;
 zones:Record<OpenWorldZone,ZoneMiningPlan>;
 goalsById:Record<string,MiningGoalRow>;
 allMissingBlueprints:MiningBlueprintGap[];
};

const WEAPON_CATEGORIES=new Set(['primary','secondary','melee','archgun','archmelee','sentinelweapon']);
const RARITY_WEIGHT:Readonly<Record<MineralRarity,number>>={common:0,uncommon:1,rare:2,eidolon:3};

function sortByItemName(ids:Iterable<string>,items:ReadonlyMap<string,MiningPlannerItem>):string[]{
 return [...ids].sort((a,b)=>(items.get(a)?.name??a).localeCompare(items.get(b)?.name??b)||a.localeCompare(b));
}

function compareMinerals(a:MineralDemandRow,b:MineralDemandRow):number{
 return (
  Number(b.missing>0)-Number(a.missing>0)||
  b.readyAfterMiningGoals.length-a.readyAfterMiningGoals.length||
  b.usedByGoals.length-a.usedByGoals.length||
  b.missing-a.missing||
  RARITY_WEIGHT[b.meta.rarity]-RARITY_WEIGHT[a.meta.rarity]||
  a.id.localeCompare(b.id)
 );
}

function uniqueSorted(ids:Iterable<string>):string[]{
 return [...new Set(ids)].sort((a,b)=>a.localeCompare(b));
}

export function buildMiningPlan(
 catalog:DemandCatalog,
 snapshot:DemandSnapshot|null,
 items:ReadonlyMap<string,MiningPlannerItem>,
 options:MiningPlannerOptions
):MiningPlanResult{
 const blueprints=new Set(catalog.blueprintIds);
 const prepared=pendingCrafts(catalog.recipes,blueprints,snapshot?.pendingRecipes,snapshot?.counts??{},catalog.pendingRecipeOutputs);
 const stock:Record<string,number>={...prepared.stock,credits:snapshot?.credits??0};

 const baseKnown=!!snapshot?.complete&&prepared.known&&snapshot.credits!=null;
 const inventoryKnown=options.scope==='favorites'
  ?baseKnown&&Array.isArray(snapshot?.favorites)
  :baseKnown&&snapshot?.masteryAccount?.ranksComplete===true;

 const candidateSet=new Set<string>();
 if(options.scope==='favorites'){
  for(const id of snapshot?.favorites??[]){
   if(Object.hasOwn(catalog.recipes,id))candidateSet.add(id);
  }
 }else{
  for(const item of items.values()){
   if(!Object.hasOwn(catalog.recipes,item.id))continue;
   const maxRank=item.maxRank??0;
   if(maxRank<=0||item.name.startsWith('Kavasa Prime'))continue;
   if(options.scope==='unmastered_weapons'&&!WEAPON_CATEGORIES.has(item.category??''))continue;
   if(options.hideFounders&&founderIds.has(item.id))continue;
   if((stock[item.id]??0)>0||(prepared.outputs[item.id]??0)>0)continue;
   if((snapshot?.ranks?.[item.id]??0)>=maxRank)continue;
   if(options.mrEligibleOnly&&snapshot?.masteryRank!=null&&(item.masteryReq??0)>snapshot.masteryRank)continue;
   candidateSet.add(item.id);
  }
 }

 const goalIds=sortByItemName(candidateSet,items);
 const goalInputs:ResourceGoal[]=goalIds.map(itemId=>({itemId,quantity:1}));

 const refinedIds=refinedMineralIds(catalog.recipes);
 const unexpanded=new Set(catalog.resourceIds??catalog.ids);
 if(options.expandRefined){
  for(const id of refinedIds)unexpanded.delete(id);
 }

 const plan=planResources(goalInputs,catalog.recipes,stock,prepared.outputs,inventoryKnown,unexpanded);

 const favoriteSet=new Set(snapshot?.favorites??[]);
 const goalsById:Record<string,MiningGoalRow>={};
 for(const g of plan.goals){
  const item=items.get(g.itemId);
  const maxRank=item?.maxRank??0;
  const rank=snapshot?.ranks?.[g.itemId]??0;
  const xpPerRank=item?.xpPerRank??(item?.category==='warframe'||item?.category==='archwing'||item?.category==='pet'?200:100);
  const xp=maxRank>0?Math.max(0,maxRank-rank)*xpPerRank:0;
  const masteryReq=item?.masteryReq??0;
  const masteryBlocked=masteryReq>0&&snapshot?.masteryRank!=null&&snapshot.masteryRank<masteryReq;
  const missingRawMinerals=g.missing.filter(id=>RAW_MINERAL_BY_ID.has(id));
  const missingOtherMaterials=g.missing.filter(id=>!RAW_MINERAL_BY_ID.has(id));
  goalsById[g.itemId]={
   itemId:g.itemId,
   category:item?.category??'other',
   xp,
   masteryReq,
   masteryBlocked,
   owned:g.owned,
   pending:g.pending,
   missingRawMinerals,
   missingOtherMaterials,
   miningOnlyBlocked:missingRawMinerals.length>0&&missingOtherMaterials.length===0,
   favorite:favoriteSet.has(g.itemId),
  };
 }

 const stepsByRawMineral=new Map<string,RefinedStep[]>();
 const blueprintGapsByZone:Record<OpenWorldZone,MiningBlueprintGap[]>={eidolon:[],solaris:[],deimos:[]};
 const seenBlueprints=new Set<string>();

 for(const refinedId of uniqueSorted(refinedIds)){
  const req=plan.requirements[refinedId];
  if(!req||req.needed<=0)continue;
  if(req.crafts<=0&&req.missing<=0)continue;
  const recipe=catalog.recipes[refinedId];
  if(!recipe)continue;
  const zone=mineralZoneFromId(refinedId)??'eidolon';
  const bpPart=recipe.parts.find(p=>blueprints.has(p.itemId));
  const blueprintId=bpPart?.itemId??null;
  const bpReq=blueprintId?plan.requirements[blueprintId]:undefined;
  const blueprintMissing=!!(blueprintId&&bpReq&&bpReq.missing>0);

  const rawInputs=recipe.parts.map(p=>p.itemId).filter(id=>RAW_MINERAL_BY_ID.has(id));
  const crossZones=new Set<OpenWorldZone>();
  for(const rawId of rawInputs){
   const inputZone=RAW_MINERAL_BY_ID.get(rawId)?.zone;
   if(inputZone&&inputZone!==zone)crossZones.add(inputZone);
  }
  const crossZoneInputs=OPEN_WORLD_ZONES.filter(z=>crossZones.has(z));

  const step:RefinedStep={
   refinedId,
   zone,
   crafts:req.crafts,
   outputPerCraft:Math.max(1,recipe.output),
   needed:req.needed,
   missing:req.missing,
   owned:req.owned,
   pending:req.pending,
   blueprintId,
   blueprintMissing,
   crossZoneInputs,
  };

  for(const rawId of new Set(rawInputs)){
   const list=stepsByRawMineral.get(rawId)??[];
   list.push(step);
   stepsByRawMineral.set(rawId,list);
  }

  if(blueprintId&&blueprintMissing&&req.crafts>0&&!seenBlueprints.has(blueprintId)){
   seenBlueprints.add(blueprintId);
   blueprintGapsByZone[zone].push({
    blueprintId,
    refinedId,
    zone,
    vendor:ZONE_VENDOR[zone],
    owned:inventoryKnown?(stock[blueprintId]??0):0,
    craftsNeeded:req.crafts,
   });
  }
 }

 for(const list of stepsByRawMineral.values()){
  list.sort((a,b)=>b.crafts-a.crafts||b.missing-a.missing||b.needed-a.needed||a.refinedId.localeCompare(b.refinedId));
 }

 const zoneGoals:Record<OpenWorldZone,Set<string>>={eidolon:new Set(),solaris:new Set(),deimos:new Set()};
 const zoneMiningOnlyGoals:Record<OpenWorldZone,Set<string>>={eidolon:new Set(),solaris:new Set(),deimos:new Set()};
 for(const goal of Object.values(goalsById)){
  for(const rawId of goal.missingRawMinerals){
   const zone=RAW_MINERAL_BY_ID.get(rawId)?.zone;
   if(!zone)continue;
   zoneGoals[zone].add(goal.itemId);
   if(goal.miningOnlyBlocked)zoneMiningOnlyGoals[zone].add(goal.itemId);
  }
 }

 const zoneRows:Record<OpenWorldZone,{ores:MineralDemandRow[];gems:MineralDemandRow[]}>={
  eidolon:{ores:[],gems:[]},
  solaris:{ores:[],gems:[]},
  deimos:{ores:[],gems:[]},
 };

 for(const meta of RAW_MINERALS){
  const req=plan.requirements[meta.id];
  const rawOwned=inventoryKnown?(stock[meta.id]??0):0;
  const usedByGoals=(req?.usedBy??[]).filter((id,idx,arr)=>arr.indexOf(id)===idx&&Object.hasOwn(goalsById,id));
  usedByGoals.sort((a,b)=>{
   const ga=goalsById[a],gb=goalsById[b];
   return (
    Number(gb.missingRawMinerals.includes(meta.id))-Number(ga.missingRawMinerals.includes(meta.id))||
    Number(gb.miningOnlyBlocked)-Number(ga.miningOnlyBlocked)||
    gb.xp-ga.xp||
    a.localeCompare(b)
   );
  });
  const readyAfterMiningGoals=usedByGoals.filter(id=>goalsById[id].miningOnlyBlocked&&goalsById[id].missingRawMinerals.includes(meta.id));
  const potentialXp=usedByGoals.reduce((sum,id)=>sum+goalsById[id].xp,0);
  const row:MineralDemandRow={
   id:meta.id,
   meta,
   needed:req?.needed??0,
   owned:req?.owned??rawOwned,
   allocated:req?.allocated??0,
   missing:req?.missing??0,
   usedByGoals,
   refinedSteps:stepsByRawMineral.get(meta.id)??[],
   readyAfterMiningGoals,
   potentialXp,
  };
  if(meta.vein==='ore')zoneRows[meta.zone].ores.push(row);
  else zoneRows[meta.zone].gems.push(row);
 }

 const zones={} as Record<OpenWorldZone,ZoneMiningPlan>;
 const allMissingBlueprints:MiningBlueprintGap[]=[];
 for(const zone of OPEN_WORLD_ZONES){
  const ores=zoneRows[zone].ores.sort(compareMinerals);
  const gems=zoneRows[zone].gems.sort(compareMinerals);
  const allMinerals=[...ores,...gems];
  const missingMinerals=allMinerals.filter(m=>m.missing>0);
  const zGoals=uniqueSorted(zoneGoals[zone]);
  const zReady=uniqueSorted(zoneMiningOnlyGoals[zone]);
  const missingBlueprints=blueprintGapsByZone[zone].sort((a,b)=>b.craftsNeeded-a.craftsNeeded||a.blueprintId.localeCompare(b.blueprintId));
  allMissingBlueprints.push(...missingBlueprints);
  zones[zone]={
   zone,
   vendor:ZONE_VENDOR[zone],
   ores,
   gems,
   missingCount:missingMinerals.length,
   totalMissingUnits:missingMinerals.reduce((sum,m)=>sum+m.missing,0),
   needsSunpointDrill:missingMinerals.some(m=>m.meta.drillTier==='sunpoint'),
   missingBlueprints,
   goalIds:zGoals,
   miningOnlyGoalIds:zReady,
   potentialXp:zGoals.reduce((sum,id)=>sum+goalsById[id].xp,0),
   miningOnlyXp:zReady.reduce((sum,id)=>sum+goalsById[id].xp,0),
  };
 }

 const miningGoals=Object.values(goalsById).filter(g=>g.missingRawMinerals.length>0);
 const miningOnlyGoals=miningGoals.filter(g=>g.miningOnlyBlocked);

 return {
  inventoryKnown,
  incomplete:plan.incomplete,
  scope:options.scope,
  totalGoals:plan.goals.length,
  goalsUsingMining:miningGoals.length,
  miningOnlyGoalsCount:miningOnlyGoals.length,
  totalPotentialXp:miningGoals.reduce((sum,g)=>sum+g.xp,0),
  miningOnlyXp:miningOnlyGoals.reduce((sum,g)=>sum+g.xp,0),
  zones,
  goalsById,
  allMissingBlueprints,
 };
}

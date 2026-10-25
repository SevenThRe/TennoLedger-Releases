import test from 'node:test';
import assert from 'node:assert/strict';
import {buildEndoRows} from '../src/endoModel.ts';
import type {PlannerMod} from '../src/modPlannerModel.ts';
const id='/Lotus/Upgrades/Mods/Rifle/Test';
const catalog:PlannerMod[]=[{id,category:'Primary Mod',rarity:'Rare',maximumRank:5,rarityMultiplier:3,upgradeSupported:true,hidden:false,description:'',levels:[],sources:[]}];
test('Endo rows keep upgraded and instanced copies before loose copies',()=>{
 const snapshot={upgradeCountsByRank:{[id]:{'0':8,'5':1}},looseUnrankedMods:{[id]:7}};
 const a=buildEndoRows(catalog,snapshot,3,true);assert.equal(a.rows[0].duplicates,6);assert.equal(a.rows[0].kept,3);assert.equal(a.rows[0].endo,90);
 assert.equal(buildEndoRows(catalog,{...snapshot,favorites:[id]},1,true).rows.length,0);
 assert.equal(buildEndoRows(catalog,{...snapshot,favorites:[id]},1,false).rows[0].duplicates,7);
});
test('missing legacy loose inventory and inconsistent rank-zero count stay unknown',()=>{
 assert.equal(buildEndoRows(catalog,{upgradeCountsByRank:{[id]:{'0':8}}},1,true).inventoryAvailable,false);
 const bad=buildEndoRows(catalog,{upgradeCountsByRank:{[id]:{'0':2,'5':8}},looseUnrankedMods:{[id]:7}},1,true);assert.equal(bad.unknown,1);assert.equal(bad.rows.length,0);
 assert.equal(buildEndoRows(catalog,{upgradeCountsByRank:{},looseUnrankedMods:{}},1,true).unknown,0);
 assert.throws(()=>buildEndoRows(catalog,null,0,true));
});

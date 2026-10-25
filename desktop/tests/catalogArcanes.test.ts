import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {arcaneProgress} from '../src/upgradeInventoryModel.ts';

const items=JSON.parse(readFileSync(new URL('../public/catalog.json',import.meta.url),'utf8')).items;
test('Steadfast collection contains the real rank-five arcane and no ability listeners',()=>{
 const rows=items.filter((i:any)=>i.category==='arcane'&&i.name==='Arcane Steadfast');
 assert.equal(rows.length,1);
 assert.equal(rows[0].id,'/Lotus/Upgrades/CosmeticEnhancers/Utility/NoCostCastChanceOnCast');
 assert.equal(rows[0].arcane.maximumRank,5);
 assert.equal(arcaneProgress(rows[0],{}).required,21);
 const owned=arcaneProgress(rows[0],{[rows[0].id]:{'5':1}});
 assert.equal(owned.remaining,0);assert.equal(owned.equivalent,21);
});
test('canonical arcane keeps its artwork after internal listener removal',()=>{
 const row=items.find((i:any)=>i.id==='/Lotus/Upgrades/CosmeticEnhancers/Utility/NoCostCastChanceOnCast');
 assert.ok(row.image?.startsWith('/reference/artwork/'));
 for(let ability=1;ability<=4;ability++)assert.ok(!items.some((i:any)=>i.id===`/Lotus/Upgrades/CosmeticEnhancers/Utility/NoCostCastChanceAbility${ability}Listener`));
});

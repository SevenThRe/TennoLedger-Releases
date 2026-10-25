import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {shardEffectDescription as describe,shardEffectSummary,shardEffectDefinitions} from '../src/shardEffects.ts';
const prefix='/Lotus/Upgrades/Invigorations/ArchonCrystalUpgrades/ArchonCrystalUpgrade';
const catalog=JSON.parse(readFileSync(new URL('../public/shard-effects.json',import.meta.url),'utf8')).effects;
test('actual catalog applies numerical and trigger corrections to the intended effects',()=>{
 const get=(suffix:string)=>describe(prefix+suffix,catalog[prefix+suffix]);
 assert.equal(get('WarframeCritDamageBoostMythic'),'+37.5% Melee critical damage (2x over 500 Energy)');
 assert.equal(get('WarframeCritDamageBoost'),'+25% Melee critical damage (2x over 500 Energy)');
 assert.equal(get('WarframeBlastProc'),'+5 Shields per enemy killed with Blast Damage');
 assert.equal(get('WarframeBlastProcMythic'),'+7.5 Shields per enemy killed with Blast Damage');
 for(const suffix of ['WarframeElectricDamage','WarframeElectricDamageMythic'])assert.match(get(suffix)!,/per additional Crimson, Azure, or Violet shard/);
 assert.equal(get('WarframeElectricDamageBoost'),'+10% Ability damage on enemies affected by Electricity');
});
test('frame summary groups ordinary and Tau effects without losing multiplicity',()=>{
 const slot=(effectId:string)=>({installed:true,effectId:prefix+effectId});
 assert.deepEqual(shardEffectSummary([slot('WarframeAbilityStrength'),slot('WarframeAbilityStrengthMythic'),slot('WarframeShieldMax'),slot('Unknown'),{installed:false,effectId:''}]),[
  {name:'Ability strength',amount:2},{name:'Shields',amount:1},{name:'Unrecognized effect',amount:1},
 ]);
 assert.equal(shardEffectDefinitions.length,27);
 for(const definition of shardEffectDefinitions)for(const tier of ['', 'Mythic'])assert.ok(catalog[prefix+definition.id+tier]);
 assert.deepEqual(shardEffectSummary([]),[]);
});
test('unknown catalog text stays unknown and corrections do not leak to other IDs',()=>{
 assert.equal(describe('other','+37% unrelated'),' +37% unrelated'.trim());
 assert.equal(describe('other','<DT_NEW_TYPE>'),'<DT_NEW_TYPE>');
 for(const value of [null,undefined,3,{},'  '])assert.equal(describe('other',value),null);
 for(const [id,text] of Object.entries(catalog))assert.ok(describe(id,text));
});


test('all 54 known shard effects and 27 headings are Chinese with numerical conditions preserved',()=>{
 for(const definition of shardEffectDefinitions){
  assert.match(shardEffectSummary([{installed:true,effectId:prefix+definition.id}], '未知效果', false)[0].name, /[\u4e00-\u9fff]/);
  for(const tier of ['', 'Mythic']){
   const text=describe(prefix+definition.id+tier,catalog[prefix+definition.id+tier],false)!;
   assert.match(text,/[\u4e00-\u9fff]/);assert.doesNotMatch(text,/[a-zA-Z<>]/);
   const english=describe(prefix+definition.id+tier,catalog[prefix+definition.id+tier])!;
   assert.deepEqual(text.match(/\d+(?:\.\d+)?/g)?.sort(),english.replace('2x','翻倍').match(/\d+(?:\.\d+)?/g)?.sort(),definition.id+tier);
  }
 }
 assert.match(describe(prefix+'WarframeElectricDamage',catalog[prefix+'WarframeElectricDamage'],false)!,/深红、蔚蓝或紫晶/);
 assert.match(describe(prefix+'WarframeToxinHeal',catalog[prefix+'WarframeToxinHeal'],false)!,/受到毒素异常状态伤害/);
 assert.match(describe(prefix+'WarframeBlastProc',catalog[prefix+'WarframeBlastProc'],false)!,/击杀/);
 assert.equal(describe('future','untranslated',false),null);
});

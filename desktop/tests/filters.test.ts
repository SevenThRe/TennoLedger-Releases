import {test} from 'node:test';import assert from 'node:assert/strict';
import {clearFilters,matches,toggle,compactCount} from '../src/filterModel.ts';
test('negative filters exclude unknown; separate mastery and materials',()=>{const f=clearFilters();const facts={prime:true,mastered:false,owned:null,vaulted:true,ready:true,enough:false,resurgence:null,used:false,favorite:false,helminth:null,shards:null,incarnon:null};f.ready='yes';f.enough='no';assert(matches(f,facts));f.owned='no';assert(!matches(f,facts));});
test('toggle removes a selected condition and combined filters narrow results',()=>{assert.equal(toggle('yes','yes'),'all');assert.equal(toggle('yes','no'),'no');const f=clearFilters();f.prime='yes';f.mastered='no';assert(!matches(f,{prime:true,mastered:true,owned:true,vaulted:true,ready:true,enough:true,resurgence:true,used:true,favorite:true,helminth:true,shards:true,incarnon:true}));});
test('counts compact without falsely rounding up requirements',()=>{assert.equal(compactCount(3000),'3K');assert.equal(compactCount(1999),'1.9K');assert.equal(compactCount(null),'—');});

import {knownRank,type MasterySnapshot} from '../src/masteryModel.ts';
import {inCollectionPage,inCollectionCategory,masteredState} from '../src/filterModel.ts';
const account=(complete:boolean):MasterySnapshot=>({masteryRank:1,credits:0,complete:true,counts:{},ranks:{sold:30},favorites:[],masteryAccount:{ranksComplete:complete}});
test('full history identifies absent equipment as unmastered without requiring ownership or recipe',()=>{const s=account(true);assert.equal(masteredState(30,knownRank(s,'absent')),false);assert.equal(masteredState(30,knownRank(s,'sold')),true);assert(inCollectionPage({maxRank:30},'foundry'));});
test('partial history and missing account retain unknown mastery',()=>{assert.equal(masteredState(30,knownRank(account(false),'absent')),null);assert.equal(masteredState(30,knownRank(null,'absent')),null);assert.equal(masteredState(0,0),null);});
test('foundry retains recipe entries and groups arch and companion equipment',()=>{assert(inCollectionPage({maxRank:0,recipe:{}},'foundry'));assert(!inCollectionPage({maxRank:0},'foundry'));assert(inCollectionCategory({category:'archgun'},'archwing'));assert(inCollectionCategory({category:'sentinelweapon'},'pet'));assert(!inCollectionCategory({category:'primary'},'pet'));});

test('modular category keeps Zaw and Kitgun equipment without unrelated weapons',()=>{assert(inCollectionCategory({id:'/Lotus/Weapons/Ostron/Melee/ModularMelee01/Tip/TipOne',category:'melee'},'modular'));assert(inCollectionCategory({id:'/Lotus/Weapons/SolarisUnited/Secondary/SUModularSecondarySet1/Barrel/A',category:'secondary'},'modular'));assert(!inCollectionCategory({id:'/Lotus/Weapons/Rifle',category:'primary'},'modular'));});

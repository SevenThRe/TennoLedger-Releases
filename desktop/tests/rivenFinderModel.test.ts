import test from 'node:test';import assert from 'node:assert/strict';
import {defaultWanted,evaluate,type Riven} from '../src/rivenModel.ts';
import {finderSlots,wantedFromFinderSlots} from '../src/rivenFinderModel.ts';
import {mergedRivenRequest,mergedRivenRows,type MergedRiven} from '../src/rivenMergedModel.ts';
test('four slots preserve required/optional signs and reject duplicates',()=>{
 const slots=finderSlots(defaultWanted);assert.equal(slots.length,4);assert.deepEqual(slots.map(s=>s.positive),[true,true,true,false]);
 slots[0]={attribute:'critical_chance',positive:true,required:false};slots[1]={attribute:'critical_damage',positive:true,required:true};slots[3]={attribute:'zoom',positive:false,required:false};
 const wanted=wantedFromFinderSlots(defaultWanted,slots);assert.deepEqual(wanted.required,['critical_damage']);assert.deepEqual(wanted.optional,['critical_chance']);assert.equal(wanted.negativeOptional,true);
 const request=mergedRivenRequest(wanted,false,'pc');assert.equal(request.attrs.find(a=>!a.positive)?.required,false);
 slots[2]={...slots[0]};assert.throws(()=>wantedFromFinderSlots(wanted,slots),/Duplicate/);
});
test('ranges and negative conditions are enforced without inventing direct-source similarity',()=>{
 const riven:Riven={id:'r',name:'Test',weaponSlug:'torid',rank:0,maxRank:8,masteryLevel:8,rerolls:5,polarity:'naramon',veiled:false,tradeable:false,attributes:[{slug:'critical_chance',name:'Critical chance',value:10,positive:true}]};
 assert.equal(evaluate(riven,{...defaultWanted,minPrice:11},10).match,false);
 assert.equal(evaluate(riven,{...defaultWanted,minRerolls:6},20).match,false);
 assert.equal(evaluate(riven,{...defaultWanted,negative:'zoom',negativeOptional:true},20).match,true);
 assert.equal(evaluate(riven,{...defaultWanted,negativeRequired:true},20).match,false);
 assert.equal(evaluate(riven,{...defaultWanted,minSimilarity:1},20).match,false);
 const row:MergedRiven={id:'r',source:2,price:20,link:'https://warframe.market/auction/r',time:0,similarity:.75,attributes:[{tag:'WeaponCritChanceMod',value:10,positive:true,matches:true}]};
 assert.equal(mergedRivenRows([row],'all',{...defaultWanted,minSimilarity:75}).length,1);
 assert.equal(mergedRivenRows([row],'all',{...defaultWanted,minSimilarity:76}).length,0);
 assert.equal(mergedRivenRows([row],'all',{...defaultWanted,minPrice:21}).length,0);
 assert.equal(mergedRivenRows([row],'all',{...defaultWanted,negativeRequired:true}).length,0);
});
test('original similarity ranges and any-negative flag reach the actual merged request',()=>{
 const request=mergedRivenRequest({...defaultWanted,minPrice:10,maxPrice:200,minRerolls:3,maxRerolls:20,minSimilarity:75,negativeRequired:true},false,'pc');
 assert.deepEqual(request.attrs,[]);assert.deepEqual(request.filters,{minPrice:10,maxPrice:200,minRerolls:3,maxRerolls:20,minSimilarity:75,negativeRequired:true});
 assert.throws(()=>mergedRivenRequest({...defaultWanted,minPrice:11,maxPrice:10},false,'pc'));
 assert.throws(()=>mergedRivenRequest({...defaultWanted,minSimilarity:101},false,'pc'));
});

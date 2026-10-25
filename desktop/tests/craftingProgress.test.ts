import {test} from 'node:test';
import assert from 'node:assert/strict';
import {craftingProgress,matchesCraftingCollection} from '../src/craftingProgress.ts';
import type {DemandSnapshot} from '../src/resourceDemand.ts';
const item={id:'weapon',maxRank:30,masteryReq:10};
const snapshot=():DemandSnapshot=>({complete:true,counts:{},ranks:{},masteryRank:9,masteryAccount:{ranksComplete:true}});
test('sold mastered equipment is not an unfinished collection target',()=>{
 const s=snapshot();s.ranks={weapon:30};
 assert.equal(matchesCraftingCollection('missing',item,s),false);
 assert.deepEqual(craftingProgress(item,s),{owned:0,mastered:true,masteryBlocked:true});
});
test('owned and unfinished filters treat ownership independently of mastery',()=>{
 const s=snapshot();s.counts={weapon:1};
 assert.equal(matchesCraftingCollection('owned',item,s),true);
 assert.equal(matchesCraftingCollection('missing',item,s),false);
 s.counts={};assert.equal(matchesCraftingCollection('missing',item,s),true);
});
test('unknown inventory or mastery history never implies unfinished',()=>{
 const s=snapshot();s.complete=false;
 assert.equal(matchesCraftingCollection('missing',item,s),false);
 s.complete=true;s.masteryAccount=null;
 assert.equal(matchesCraftingCollection('missing',item,s),false);
 s.ranks={weapon:5};assert.equal(matchesCraftingCollection('missing',item,s),true);
 assert.equal(matchesCraftingCollection('all',item,null),true);
});
test('mastery threshold equality is allowed and unknown rank stays unknown',()=>{
 const s=snapshot();s.masteryRank=10;
 assert.equal(craftingProgress(item,s).masteryBlocked,false);
 s.masteryRank=null;assert.equal(craftingProgress(item,s).masteryBlocked,null);
 assert.equal(craftingProgress({...item,maxRank:0,masteryReq:0},null).mastered,false);
});

test('invalid explicit values do not become known zero on complete snapshots',()=>{
 const s=snapshot();s.counts={weapon:-1};s.ranks={weapon:NaN};
 assert.equal(craftingProgress(item,s).owned,null);
 assert.equal(craftingProgress(item,s).mastered,null);
 assert.equal(matchesCraftingCollection('missing',item,s),false);
});

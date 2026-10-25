import test from 'node:test';
import assert from 'node:assert/strict';
import {masteryRequirement,masteryLockState,candidates,recommend,previewWidths,type MasteryItem,type MasterySnapshot} from '../src/masteryModel.ts';
const item:MasteryItem={id:'weapon',name:'Weapon',zh:'武器',category:'primary',prime:false,maxRank:30,xpPerRank:100,masteryReq:14,displayParts:[{itemId:'blueprint',quantity:1}],recipe:{parts:[{itemId:'blueprint',quantity:1}]}};
const snapshot=():MasterySnapshot=>({complete:true,counts:{blueprint:1},ranks:{weapon:0},favorites:[],masteryRank:5,credits:0,pendingRecipes:{}});
test('Easy MR lock follows catalog requirement without removing ready recommendations',()=>{
 const s=snapshot(),rows=candidates([item],s,{items:{},marketSlugs:{}},{});
 assert.equal(rows[0].masteryBlocked,true);assert.equal(masteryLockState(rows[0],'normal'),'blocked');
 assert.equal(recommend(rows,'normal',true)[0].item.id,item.id);
 assert.equal(masteryLockState(rows[0],'relics'),null);assert.equal(masteryLockState(rows[0],'platinum'),null);
 assert.equal(masteryRequirement(item,{...s,masteryRank:14}).masteryBlocked,false);
});
test('owned and queued items bypass the lock, unrelated queues do not',()=>{
 const s=snapshot();
 assert.equal(masteryRequirement(item,{...s,counts:{weapon:1},pendingRecipes:null}).masteryBlocked,false);
 assert.deepEqual(masteryRequirement(item,{...s,pendingRecipes:{blueprint:1}}),{masteryBlocked:false,pendingInFoundry:true});
 assert.equal(masteryRequirement(item,{...s,pendingRecipes:{other:2}}).masteryBlocked,true);
 assert.equal(masteryRequirement(item,{...s,pendingRecipes:{blueprint:0}}).pendingInFoundry,false);
});
test('unknown MR, catalog requirement, ownership and queue stay unverified',()=>{
 const s=snapshot();
 assert.equal(masteryRequirement(item,{...s,masteryRank:null}).masteryBlocked,null);
 assert.equal(masteryRequirement({...item,masteryReq:undefined},s).masteryBlocked,null);
 assert.equal(masteryRequirement(item,{...s,pendingRecipes:null}).masteryBlocked,null);
 assert.equal(masteryRequirement(item,{...s,complete:false}).masteryBlocked,null);
 const row=candidates([item],{...s,masteryRank:null},{items:{},marketSlugs:{}},{})[0];
 assert.equal(masteryLockState(row,'normal'),'unknown');
});
test('queue metadata does not change recommendation ranking or XP preview',()=>{
 const s=snapshot(),sources={items:{},marketSlugs:{}};
 const before=candidates([item],s,sources,{}),after=candidates([item],{...s,pendingRecipes:{blueprint:1}},sources,{});
 assert.deepEqual(recommend(before,'normal',true).map(r=>[r.item.id,r.xp]),recommend(after,'normal',true).map(r=>[r.item.id,r.xp]));
 assert.deepEqual(previewWidths(50,100,20,15),{fav:20,hover:15});
});

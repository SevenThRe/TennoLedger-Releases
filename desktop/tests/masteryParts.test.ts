import test from 'node:test';
import assert from 'node:assert/strict';
import {masteryPartCount,masteryPartCounts,masteryDisplayPartCount,candidates,recommend,type MasterySnapshot,type MasteryItem} from '../src/masteryModel.ts';
const snapshot=(counts:Record<string,number>,complete=false):MasterySnapshot=>({counts,complete,ranks:{},favorites:[],masteryRank:0,credits:0});
const part={itemId:'blueprint',ownedItemId:'built',quantity:2};
const sources={items:{frame:{parts:[{...part,drops:[]}]}},marketSlugs:{}};

test('repeated recipe slots consume the same inventory once, including built aliases',()=>{
 const single={...part,quantity:1};
 assert.deepEqual(masteryPartCounts(snapshot({blueprint:1},true),[single,single]),[1,0]);
 assert.deepEqual(masteryPartCounts(snapshot({built:1},true),[single,single]),[1,0]);
 assert.deepEqual(masteryPartCounts(snapshot({built:1}),[single,single]),[1,null]);
 assert.equal(masteryDisplayPartCount(snapshot({built:1},true),'frame',{itemId:'built',quantity:1},sources,1),0);
});

test('duplicate missing copies affect readiness, cost and probability together',()=>{
 const s={...snapshot({relic:2},true),masteryAccount:{ranksComplete:true}};
 const item:MasteryItem={id:'dual',name:'Dual Prime',zh:'Dual',category:'secondary',maxRank:30,xpPerRank:100,prime:true};
 const p={itemId:'barrel',quantity:1,drops:[{relicId:'relic',chance:.1}]};
 const data={items:{dual:{parts:[p,p]}},marketSlugs:{}};
 let row=candidates([item],s,data,{barrel:10})[0];
 assert.equal(row.cost,20);assert.ok(Math.abs(row.probability!-.01)<1e-10);
 s.counts.barrel=1;row=candidates([item],s,data,{barrel:10})[0];
 assert.equal(row.cost,10);assert.equal(row.ready,false);assert.equal(row.missing?.length,1);
 assert.equal(recommend([row],'normal',true).length,0);assert.ok(Math.abs(row.probability!-.19)<1e-10);
 s.counts.barrel=2;assert.equal(candidates([item],s,data,{barrel:10})[0].ready,true);
});

test('assembled display component needs all underlying parts, not just the first barrel',()=>{
 const data={items:{dual:{parts:[{itemId:'barrel',ownedItemId:'built',quantity:1,drops:[]},{itemId:'receiver',ownedItemId:'built',quantity:1,drops:[]}]}},marketSlugs:{}};
 assert.equal(masteryDisplayPartCount(snapshot({barrel:1},true),'dual',{itemId:'built',quantity:1},data),0);
 assert.equal(masteryDisplayPartCount(snapshot({barrel:1,receiver:1},true),'dual',{itemId:'built',quantity:1},data),1);
});
test('component badges resolve both display IDs with the same blueprint and built inventory',()=>{
 const s=snapshot({blueprint:1,built:1});
 assert.equal(masteryPartCount(s,part),2);
 for(const itemId of ['blueprint','built'])assert.equal(masteryDisplayPartCount(s,'frame',{itemId,quantity:2},sources),2);
});
test('partial component data is unknown unless the known copies already satisfy the requirement',()=>{
 assert.equal(masteryPartCount(snapshot({built:1}),part),null);
 assert.equal(masteryPartCount(snapshot({built:2}),part),2);
 assert.equal(masteryPartCount(snapshot({built:1},true),part),1);
 assert.equal(masteryPartCount(null,part),null);
});
test('aliases do not double count identical IDs and unrelated materials stay independent',()=>{
 assert.equal(masteryPartCount(snapshot({blueprint:1},true),{...part,ownedItemId:'blueprint'}),1);
 assert.equal(masteryDisplayPartCount(snapshot({built:2},true),'other',{itemId:'blueprint',quantity:2},sources),0);
 assert.equal(masteryDisplayPartCount(snapshot({built:2},true),'frame',{itemId:'resource',quantity:1},sources),0);
});

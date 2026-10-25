import {test} from 'node:test';
import assert from 'node:assert/strict';
import {progress,summary,candidates,recommend,previewWidths,copyProbability,type MasterySnapshot,type MasteryItem} from '../src/masteryModel.ts';
const item:MasteryItem={id:'frame',name:'Frame Prime',zh:'Frame',prime:true,category:'warframe',maxRank:30,xpPerRank:200,recipe:{parts:[{itemId:'blueprint',quantity:1}]}};
const snapshot=():MasterySnapshot=>({masteryRank:35,credits:0,complete:false,counts:{},ranks:{},favorites:[],masteryAccount:{totalXp:3047038,ranksComplete:false}});
test('screenshot XP and preview never exceed next rank',()=>{const p=progress(snapshot())!;assert.equal(p.current,59538);assert.equal(p.needed,147500);assert.equal(p.percent,40);assert.deepEqual(previewWidths(95,100,10,20),{fav:5,hover:0});assert.equal(progress({...snapshot(),masteryAccount:null}),null);});
test('counts completeness never implies rank completeness',()=>{const s=snapshot();s.complete=true;assert.equal(summary([item],s).content[0].known,false);assert.equal(summary([item],s).prime,null);assert.equal(candidates([item],s,{items:{},marketSlugs:{}},{}).length,0);s.masteryAccount!.ranksComplete=true;assert.equal(summary([item],s).content[0].current,0);});
test('built prime component satisfies blueprint and unknown price is excluded',()=>{const s=snapshot();s.complete=true;s.masteryAccount!.ranksComplete=true;s.counts.built=1;const source={items:{frame:{parts:[{itemId:'blueprint',quantity:1,ownedItemId:'built',drops:[]}]}},marketSlugs:{}};let all=candidates([item],s,source,{});assert.equal(all[0].missing?.length,0);assert.equal(recommend(all,'normal',true).length,1);assert.equal(recommend(all,'platinum',true).length,0);s.counts.built=0;all=candidates([item],s,source,{blueprint:100});assert.equal(all[0].cost,100);assert.equal(recommend(all,'platinum',true).length,1);});
test('relic estimate uses owned refinement counts; duplicate needs use a binomial tail',()=>{const s=snapshot();s.complete=true;s.masteryAccount!.ranksComplete=true;s.counts.relic=2;const source={items:{frame:{parts:[{itemId:'blueprint',quantity:1,drops:[{relicId:'relic',chance:.1}]}]}},marketSlugs:{}};assert.ok(Math.abs(candidates([item],s,source,{})[0].probability!-.19)<1e-10);source.items.frame.parts[0].quantity=2;assert.ok(Math.abs(candidates([item],s,source,{})[0].probability!-.01)<1e-10);});

test('Founders filter removes only unowned items from denominators',()=>{const founder={...item,id:'/Lotus/Powersuits/Excalibur/ExcaliburPrime'};const s=snapshot();s.complete=true;s.masteryAccount!.ranksComplete=true;assert.equal(summary([founder,item],s,true).content[0].max,1);s.counts[founder.id]=1;assert.equal(summary([founder,item],s,true).content[0].max,2);});

test('repeated relic estimate handles certainty, impossible needs, and sparse snapshots',()=>{const s=snapshot();s.complete=true;s.counts.r=3;assert.equal(copyProbability([{relicId:'r',chance:1}],s,2),1);assert.equal(copyProbability([{relicId:'r',chance:.1}],s,4),0);s.complete=false;assert.equal(copyProbability([{relicId:'unknown',chance:.1}],s,2),null);s.complete=true;s.counts.r=10000;assert.ok(copyProbability([{relicId:'r',chance:.07}],s,1000)!<.01);});

test('easy recommendations require ownership or resolved complete components',()=>{
 const s=snapshot();s.complete=true;s.masteryAccount!.ranksComplete=true;
 const source={items:{frame:{parts:[{itemId:'blueprint',quantity:1,ownedItemId:'built',drops:[]}]}},marketSlugs:{}};
 assert.equal(recommend(candidates([item],s,source,{}),'normal',true).length,0);
 s.counts.built=1;
 const ready=candidates([item],s,source,{});
 assert.equal(ready[0].ready,true);assert.equal(recommend(ready,'normal',true).length,1);
 s.counts={};s.complete=false;
 assert.equal(recommend(candidates([item],s,source,{}),'normal',true).length,0);
 s.counts.frame=1;
 assert.equal(recommend(candidates([item],s,source,{}),'normal',true).length,1);
});

test('platinum ratio ties follow reference satisfied component count then stable input order',()=>{
 const s=snapshot();s.complete=true;s.masteryAccount!.ranksComplete=true;s.counts.built=1;
 const other={...item,id:'other'},same={...item,id:'same'};
 const missing={itemId:'missing',quantity:1,drops:[]};
 const sources={items:{frame:{parts:[{itemId:'bp',ownedItemId:'built',quantity:1,drops:[]},missing]},other:{parts:[missing]},same:{parts:[missing]}},marketSlugs:{}};
 const all=candidates([item,other,same],s,sources,{missing:100});
 assert.deepEqual(all.map(r=>r.satisfiedParts),[1,0,0]);
 assert.deepEqual(recommend(all,'platinum',true).map(r=>r.item.id),['other','same','frame']);
 all[0].cost=50;
 assert.deepEqual(recommend(all,'platinum',true).map(r=>r.item.id),['frame','other','same']);
});

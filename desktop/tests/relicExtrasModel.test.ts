import test from 'node:test';
import assert from 'node:assert/strict';
import {expectedBest,lowestSell} from '../src/relicExtrasModel.ts';
const r={id:'r',name:'r',base:'r',era:'Lith',refinement:'Intact',vaulted:false,rewards:[{id:'a',name:'a',chance:50},{id:'b',name:'b',chance:50}]};
test('expected chosen maximum is not sum of squad rewards',()=>{assert.equal(expectedBest(r,{a:10,b:20},1),15);assert.equal(expectedBest(r,{a:10,b:20},4),19.375);assert.equal(expectedBest(r,{a:10,b:null},4),null);assert.equal(expectedBest(r,{a:0,b:20},1),10);assert.throws(()=>expectedBest(r,{a:1,b:2},0));});
test('rounded probabilities normalize but incomplete rewards remain unknown',()=>{assert.ok(expectedBest({...r,rewards:r.rewards.map(x=>({...x,chance:50.005}))},{a:10,b:20},1)!-15<1e-8);assert.equal(expectedBest({...r,rewards:[r.rewards[0]]},{a:10},1),null);});
test('price excludes offline buys hidden orders and ranked mods',()=>{const sell={type:'sell',visible:true,quantity:1,user:{status:'ingame'},platinum:10};assert.equal(lowestSell([sell,{...sell,type:'buy',platinum:1},{...sell,rank:3,platinum:1},{...sell,visible:false,platinum:1},{...sell,user:{status:'offline'},platinum:1}]),10);assert.equal(lowestSell([]),null);});
import {rewardParents,rewardRank,rewardParentState,parseFavorites,serializeFavorites} from '../src/relicExtrasModel.ts';
test('reward links only mastery-bearing finished equipment and reads its rank',()=>{const item={id:'parent',name:'parent',zh:'',category:'primary',maxRank:30,xpPerRank:100,prime:true};const sources={marketSlugs:{},items:{parent:{parts:[{itemId:'blueprint',ownedItemId:'built',quantity:1,drops:[]}]}}};assert.deepEqual(rewardParents('blueprint',[item,{...item,id:'blueprint',maxRank:0}],sources).map(x=>x.id),['parent']);assert.deepEqual(rewardParents('built',[item],sources).map(x=>x.id),['parent']);assert.equal(rewardRank({complete:true,counts:{}},'parent'),null);assert.equal(rewardRank({complete:true,counts:{},ranks:{parent:30}},'parent'),30);assert.equal(rewardRank({complete:false,counts:{},masteryAccount:{ranksComplete:true}},'parent'),0);assert.equal(rewardRank(null,'parent'),null);});
test('favorite roundtrip preserves refinement IDs and tolerates corrupt preferences',()=>{assert.deepEqual(parseFavorites(serializeFavorites(['intact','radiant','intact'])),['intact','radiant']);assert.deepEqual(parseFavorites('{'),[]);assert.deepEqual(parseFavorites('{"x":true}'),[]);assert.deepEqual(parseFavorites('[null,1,"","intact"]'),['intact']);assert.deepEqual(parseFavorites(null),[]);});
test('parent completion preserves sold mastery, owned unranked equipment and unknown history',()=>{
 const parent={id:'frame',name:'Frame',zh:'',category:'warframe',maxRank:30,xpPerRank:200,prime:true};
 assert.equal(rewardParentState([parent],{complete:true,counts:{},ranks:{frame:30}}),'mastered');
 assert.equal(rewardParentState([parent],{complete:false,counts:{frame:1}}),'owned');
 assert.equal(rewardParentState([parent],{complete:true,counts:{}}),'unknown');
 assert.equal(rewardParentState([parent],{complete:true,counts:{},masteryAccount:{ranksComplete:true}}),'missing');
 assert.equal(rewardParentState([],null),'unknown');
});

test('cached valuations use unit prices and reject impossible bundle quantities',()=>{
 const q={type:'sell',visible:true,quantity:6,perTrade:6,platinum:60,user:{status:'ingame'}};
 assert.equal(lowestSell([q,{...q,perTrade:1,platinum:15}]),10);
 for(const perTrade of [0,-1,1.5,7])assert.equal(lowestSell([{...q,perTrade}]),null);
 assert.equal(lowestSell([{...q,platinum:61}]),61/6);
});

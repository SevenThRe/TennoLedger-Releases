import test from 'node:test';
import assert from 'node:assert/strict';
import {owned,squadChance,desiredChance,matchesRelic} from '../src/relicModel.ts';
const relic={id:'x',name:'Axi A1 Radiant',base:'Axi A1',era:'Axi',refinement:'Radiant',vaulted:true,rewards:[{id:'a',name:'Target Prime',chance:10},{id:'b',name:'Other',chance:20}]};
test('partial inventory does not imply zero and refinement IDs stay distinct',()=>{assert.equal(owned(null,'x'),null);assert.equal(owned({complete:false,counts:{x:0}},'x'),0);assert.equal(owned({complete:false,counts:{x:1}},'y'),null);assert.equal(owned({complete:true,counts:{}},'x'),0);});
test('independent squad probability and union avoid double counting',()=>{assert.ok(Math.abs(squadChance(10,4)-34.39)<1e-9);assert.ok(Math.abs(desiredChance(relic,new Set(['a','b']),4)-75.99)<1e-9);assert.equal(desiredChance(relic,new Set(),4),0);assert.throws(()=>squadChance(10,5));});
test('search includes rewards and requires all terms',()=>{assert.equal(matchesRelic(relic,'axi target'),true);assert.equal(matchesRelic(relic,'meso target'),false);});
test('localized rewards remain searchable alongside English and mixed queries',()=>{
 const labels=(id:string)=>id==='a'?'目标 Prime 枪管':'';
 assert.equal(matchesRelic(relic,'目标 枪管',labels),true);
 assert.equal(matchesRelic(relic,'AXI 枪管',labels),true);
 assert.equal(matchesRelic(relic,'target',labels),true);
 assert.equal(matchesRelic(relic,'目标 机体',labels),false);
 assert.equal(matchesRelic(relic,'目标'),false);
});
import {groupRelics} from '../src/relicModel.ts';
test('compact groups preserve refinement identity and canonical order',()=>{
 const rows=[relic,{...relic,id:'i',refinement:'Intact'},{...relic,id:'y',base:'Lith A1'}];
 const groups=groupRelics(rows);
 assert.equal(groups.length,2);assert.deepEqual(groups[0].variants.map(x=>x.id),['i','x']);assert.equal(rows[0].id,'x');
});

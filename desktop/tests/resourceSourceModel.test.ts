import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resourceSources} from '../src/resourceSourceModel.ts';
import type {Relic} from '../src/relicModel.ts';
const relic=(id:string,refinement='Intact',base='Lith A1',aliases:string[]=[]):Relic=>({id,base,name:`${base} ${refinement}`,refinement,era:'Lith',vaulted:false,aliases,rewards:[{id:'reward',name:'Reward',chance:refinement==='Intact'?25:40}]});
test('source families aggregate refinements and deduplicate alias inventory IDs',()=>{
 const rows=resourceSources([{location:'Lith A1 Relic (Radiant)',chance:40},{location:'Lith A1 Relic (Intact)',chance:25}],[relic('a','Intact','Lith A1',['alias']),relic('alias'),relic('b','Radiant')],new Set(['reward']),{complete:true,counts:{a:2,alias:3,b:4}});
 assert.equal(rows.length,1);assert.equal(rows[0].owned,9);assert.equal(rows[0].chance,25);assert.equal(rows[0].relic?.id,'a');
});
test('unknown ownership and absent intact chances are preserved',()=>{
 const [row]=resourceSources([],[relic('a','Radiant')],new Set(['reward']),{complete:false,counts:{}});
 assert.equal(row.owned,null);assert.equal(row.chance,null);
});
test('sources keep non-relic drops, remove duplicates, and prioritize owned relics',()=>{
 const rows=resourceSources([{location:'Enemy',chance:NaN},{location:'Enemy',chance:NaN},{location:'Mission',chance:5}],[relic('a'),relic('b','Intact','Lith B1')],new Set(['reward']),{complete:true,counts:{b:2}});
 assert.deepEqual(rows.map(r=>r.location),['Lith B1 Relic','Lith A1 Relic','Enemy','Mission']);assert.equal(rows[2].chance,null);
});
test('different rewards and rotations at one location remain separate sources',()=>{
 const drops=[{location:'Mission',chance:null,reward:'2X Ore',rotation:'A'},{location:'Mission',chance:null,reward:'3X Ore',rotation:'A'},{location:'Mission',chance:null,reward:'3X Ore',rotation:'B'}];
 assert.deepEqual(resourceSources([...drops,drops[0]],[],new Set(),null),drops);
});

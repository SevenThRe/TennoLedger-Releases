import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {rivenChallengeText} from '../src/rivenChallengeLocalization.ts';

test('every bundled challenge and allowed complication translates without losing the count',()=>{
 const catalog=JSON.parse(readFileSync(new URL('../public/riven-catalog.json',import.meta.url),'utf8'));
 let checked=0;
 for(const type of Object.values(catalog.types) as any[]){
  for(const [id,data] of Object.entries(type.challenges??{}) as [string,any][]){
   for(const suffix of ['',...Object.values(data.complications??{}).map((x:any)=>x.description)]){
    const c={id,group:data.description.replace('|COUNT| ',''),description:data.description.replace('|COUNT|','20')+(suffix?' '+suffix:''),required:20,progress:7};
    const zh=rivenChallengeText(c);
    assert.notEqual(zh.description,c.description,id+' '+suffix);
    assert.match(zh.description,/[\u3400-\u9fff]/);
    if(data.description.includes('|COUNT|'))assert.ok(zh.description.includes('20'));
    assert.deepEqual(rivenChallengeText(c,'en'),{group:c.group,description:c.description});
    assert.equal(c.progress,7);checked++;
   }
  }
 }
 assert.ok(checked>100);
});
test('unknown, modified and already translated challenges retain all original conditions',()=>{
 for(const [id,description] of [['RandomizedKill','Kill 20 Enemies with a new condition'],['RandomizedKill','Kill 20 special Enemies'],['NewChallenge','New text'],['RandomizedKill','击杀 20 名敌人']]){
  const c={id:'/Lotus/Types/Challenges/'+id,group:'group',description,required:20,progress:null};
  assert.deepEqual(rivenChallengeText(c),{group:c.group,description});
 }
 const c={id:'/Lotus/Types/Challenges/RandomizedKill',group:'Kill Enemies',description:'Kill — Enemies without taking damage',required:null,progress:null};
 assert.equal(rivenChallengeText(c).group,'击杀敌人');
 assert.equal(rivenChallengeText(c).description,'击杀 — 名敌人，不受到伤害');
});

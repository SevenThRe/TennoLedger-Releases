import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {defaultWanted} from '../src/rivenModel.ts';
import {alecaRivenTag,mergedRivenRequest,parseMergedRivens,mergedRivenRows} from '../src/rivenMergedModel.ts';
test('original similarity tags are explicit and preserve required positive, optional and negative contracts',()=>{
 const request=mergedRivenRequest({...defaultWanted,required:['critical_chance'],optional:['critical_damage'],negative:'zoom',maxPrice:200,maxRerolls:3},false,'pc');
 assert.deepEqual(request.attrs,[{name:'WeaponCritChanceMod',positive:true,required:true},{name:'WeaponCritDamageMod',positive:true,required:false},{name:'WeaponZoomFovMod',positive:false,required:true}]);
 assert.equal(request.filters.maxPrice,200);assert.equal(request.filters.maxRerolls,3);assert.equal(request.filters.negativeRequired,true);
 assert.equal(alecaRivenTag('constructor',false),null);assert.equal(alecaRivenTag('__proto__',false),null);
 assert.equal(alecaRivenTag('base_damage_/_melee_damage',false),'WeaponDamageAmountMod');assert.equal(alecaRivenTag('base_damage_/_melee_damage',true),'WeaponMeleeDamageMod');assert.equal(alecaRivenTag('damage_vs_corpus',true),'WeaponMeleeFactionDamageCorpus');
 assert.throws(()=>mergedRivenRequest({...defaultWanted,required:['unknown_new_trait']},false,'pc'),/待核实/);
 assert.throws(()=>mergedRivenRequest({...defaultWanted,required:['critical_chance']},false,'ps4'),/平台/);
 assert.throws(()=>mergedRivenRequest({...defaultWanted,required:['critical_chance'],maxMastery:8},false,'pc'),/MR/);
 assert.throws(()=>mergedRivenRequest({...defaultWanted,required:['critical_chance'],negative:'critical_chance'},false,'pc'),/冲突/);
});
test('real public merged response retains both sources, source timestamps, raw values and safe links',()=>{
 const fixture=JSON.parse(readFileSync(new URL('./fixtures/riven-merged-public.json',import.meta.url),'utf8'));
 const rows=parseMergedRivens(fixture.similarRivens);assert.equal(rows.length,100);assert.equal(rows.filter(r=>r.source===2).length,50);assert.equal(rows.filter(r=>r.source===4).length,50);
 assert.equal(rows[0].attributes[0].value,163.2);assert.ok(rows.some(r=>r.time>=Date.UTC(2026,9,23)));assert.ok(rows.some(r=>r.time<Date.UTC(2026,0,1)),'old listings retain their actual old source time');
 assert.equal(mergedRivenRows(rows,'all').length,25);assert.ok(mergedRivenRows(rows,'wfm').every(r=>r.source===2));assert.ok(mergedRivenRows(rows,'riven-market').every(r=>r.source===4));
 assert.throws(()=>parseMergedRivens([{...fixture.similarRivens[0],link:'https://evil.example/auction/x'}]));
 assert.throws(()=>parseMergedRivens([{...fixture.similarRivens[0],source:'2'}]));assert.throws(()=>parseMergedRivens([{...fixture.similarRivens[0],price:NaN}]));
});

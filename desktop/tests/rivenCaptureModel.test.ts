import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseRivenCapture,capturedWeaponName,captureComparisonRows} from '../src/rivenCaptureModel.ts';
const fixture=()=>JSON.parse(readFileSync(new URL('../../collector/fixtures/riven-capture-synthetic-event.json',import.meta.url),'utf8'));
test('Python synthetic protocol preserves bilingual names and left/right observed values',()=>{
 const result=parseRivenCapture(fixture());assert.ok(result);assert.equal(result.evidence,'synthetic-ocr');assert.equal(result.cards[0].side,'left');assert.equal(result.cards[1].attributes[0].signedValue,145);assert.equal(capturedWeaponName(result.cards[0],'zh-CN'),'托里德');assert.equal(captureComparisonRows(result)[0].delta,45);
});
test('unknown metadata stays null and zero remains explicitly observed zero',()=>{
 const value=fixture();value.cards[0].rank=null;value.cards[0].masteryLevel=null;value.cards[0].rerolls=0;
 const result=parseRivenCapture(value);assert.ok(result);assert.equal(result.cards[0].rank,null);assert.equal(result.cards[0].rerolls,0);assert.equal(captureComparisonRows(result)[0].delta,null);
});
test('comparison needs same frame position, weapon and explicit proof',()=>{
 for(const mutate of [v=>v.comparisonEvidence=null,v=>v.cards.reverse(),v=>v.cards[1].weaponId='/Lotus/Other',v=>v.cards[1].bounds[0]=200]) {const value=fixture();mutate(value);assert.equal(parseRivenCapture(value),null);}
});
test('raw credentials, invalid geometry, stats and low confidence fail closed',()=>{
 for(const mutate of [v=>v.cards[0].rawBlocks[0].text='Bearer secret',v=>v.cards[0].rawBlocks[0].x=-1,v=>v.cards[0].confidence=.84,v=>v.cards[0].attributes[0].signedValue=NaN,v=>v.cards[0].attributes[1].slug=v.cards[0].attributes[0].slug,v=>v.cards[0].attributes[0].printedSign='-',v=>v.cards[0].rank=9]) {const value=fixture();mutate(value);assert.equal(parseRivenCapture(value),null);}
});
test('whitelist copy excludes inferred quality and arbitrary capture credentials',()=>{
 const value=fixture();value.token='private';value.cards[0].grade='S';value.cards[0].perfectness=100;value.cards[0].attributes[0].positive=true;
 const result=parseRivenCapture(value);assert.ok(result);const serialized=JSON.stringify(result);assert.ok(!serialized.includes('private'));assert.ok(!serialized.includes('grade'));assert.ok(!serialized.includes('perfectness'));assert.ok(!serialized.includes('positive'));
});
test('unknown mode has one card and no comparison deltas',()=>{
 const value=fixture();value.mode='unknown';value.comparisonEvidence=null;value.cards=value.cards.slice(0,1);value.cards[0].side='single';
 const result=parseRivenCapture(value);assert.ok(result);assert.deepEqual(captureComparisonRows(result),[]);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {masteryPercent} from '../src/masteryModel.ts';

test('mastery categories use reference midpoint-to-even rounding for intrinsic ranks',()=>{
 for(const [current,expected] of [[1,2],[3,8],[5,12],[9,22],[39,98],[40,100]]){
  assert.equal(masteryPercent({current,max:40}),expected);
  assert.equal(masteryPercent({current,max:40},true),expected);
 }
 assert.equal(masteryPercent({current:12,max:13}),92);
 assert.equal(masteryPercent({current:120,max:125}),96);
 assert.equal(masteryPercent({current:0,max:40}),0);
});

test('unknown and invalid mastery tally is not rendered as zero or NaN',()=>{
 for(const tally of [null,undefined,{current:0,max:0},{current:NaN,max:40},{current:1,max:Infinity},{current:-1,max:40}])assert.equal(masteryPercent(tally),null);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {analyticsNumber,analyticsNumberTitle} from '../src/analyticsNumber.ts';
test('analytics matches exact reference SI boundaries, precision and negative-value behavior',()=>{
 for(const [value,text] of [[0,'-'],[999,'999'],[1000,'1000'],[1001,'1.0K'],[15549,'15.5K'],[1000000,'1000.0K'],[1000001,'1.00M'],[2345678,'2.35M'],[-1500,'-1500']] as const)assert.equal(analyticsNumber(value),text);
});
test('unknown is not zero and compact values retain exact accessible hover values',()=>{
 for(const value of [null,undefined,NaN,Infinity]){assert.equal(analyticsNumber(value),'—');assert.equal(analyticsNumberTitle(value,'zh-CN'),'未知');}
 assert.equal(analyticsNumberTitle(0,'zh-CN'),'0');
 assert.equal(analyticsNumberTitle(15549,'en-US'),'15,549');
 assert.equal(analyticsNumberTitle(null,'en-US'),'Unknown');
});

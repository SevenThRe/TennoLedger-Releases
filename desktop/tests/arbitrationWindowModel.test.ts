import test from 'node:test';import assert from 'node:assert/strict';import {restoreMiniPosition} from '../src/arbitrationWindowModel.ts';
test('detached monitor and DPI changes restore mini into visible work area',()=>{
 assert.deepEqual(restoreMiniPosition({x:3000,y:2000},[{x:0,y:0,width:1920,height:1040,scale:1.5}]),{x:1350,y:560});
 assert.deepEqual(restoreMiniPosition({x:-1000,y:50},[{x:-1920,y:0,width:1920,height:1080,scale:1}]),{x:-1000,y:50});
 assert.equal(restoreMiniPosition({x:NaN,y:10},[{x:0,y:0,width:100,height:100,scale:1}]),null);
});

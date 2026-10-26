import test from 'node:test';import assert from 'node:assert/strict';
import {spatialPoints,spatialBounds,agentComposition} from '../src/arbitrationSpatialModel.ts';
import type {SpawnPosition} from '../src/arbitrationRunModel.ts';
const points:SpawnPosition[]=[{seconds:1,x:-10,y:50,z:20,kind:'enemy',name:'enemy'},{seconds:10,x:10,y:60,z:40,kind:'drone',name:'drone'},{seconds:0,x:0,y:55,z:30,kind:'objective',name:'target'}];
test('range and kind filtering retain objective context and reject invalid coordinates',()=>{assert.deepEqual(spatialPoints(points,5,15,'drone').map(p=>p.name),['drone','target']);assert.equal(spatialPoints([{...points[0],x:NaN}],0,20).length,0);});
test('projection uses stable all-run bounds and handles empty points',()=>{assert.deepEqual(spatialBounds(points,'xz'),{axes:['x','z'],x:0,y:30,span:20});assert.equal(spatialBounds([],'yz').span,1);});
test('composition keeps unclassified names separate and sorts counts',()=>{assert.deepEqual(agentComposition([{name:'Pet',kind:'agent',count:3},{name:'Drone',kind:'drone',count:9},{name:'bad',kind:'agent',count:NaN}]).map(a=>a.name),['Drone','Pet']);});

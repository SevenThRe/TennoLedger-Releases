import test from 'node:test';
import assert from 'node:assert/strict';
import {liveClock,livePhase} from '../src/arbitrationLiveModel.ts';
import type {ArbitrationRun} from '../src/arbitrationRunModel.ts';
const run={id:'run',status:'recording',lastLogSeconds:120,gameplayStart:100,gameplayEnd:null,intervals:[{index:1,kind:'wave',start:100,end:115,complete:true,drones:2}]} as ArbitrationRun;
test('quiet logs do not freeze live time after five seconds',()=>assert.equal(liveClock(run,{id:'run',log:120,wall:1000},31000),150));
test('finished runs freeze at observed end, not elapsed wall time',()=>assert.equal(liveClock({...run,status:'completed',gameplayEnd:125},{id:'run',log:120,wall:1000},31000),125));
test('preparing, active interval and intermission have distinct clocks',()=>{
 assert.equal(livePhase({...run,gameplayStart:null},150).phase,'preparing');
 assert.deepEqual(livePhase(run,150),{phase:'intermission',index:1,seconds:15,breakSeconds:35});
 assert.deepEqual(livePhase({...run,intervals:[{...run.intervals[0],end:null,complete:false}]},150),{phase:'running',index:1,seconds:50,breakSeconds:null});
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {droneTrend,filterRunLibrary,readRunLibrary,reportIntervals,firstIntervalsRange,observationSeries,droneCadence,waveRecap,runPhases,type DroneHistory} from '../src/arbitrationRunView.ts';
import type {ArbitrationRun} from '../src/arbitrationRunModel.ts';
const run:DroneHistory={droneTelemetry:true,gameplayStart:100,gameplayEnd:null,startLogSeconds:80,lastLogSeconds:220,droneTimes:[90,100,115,160,190,220,230]};
test('spawn rate measures before view clipping and excludes preparation/extraction observations',()=>{
 const points=droneTrend(run,90);
 assert.deepEqual(points[0],{seconds:115,rate:8});
 assert.deepEqual(points.at(-1),{seconds:220,rate:2});
 assert.deepEqual(points.filter(p=>p.seconds>=190).at(-1),points.at(-1));
 assert.deepEqual(droneTrend({...run,gameplayEnd:160},90).at(-1),{seconds:160,rate:3});
});
test('telemetry and interval validity remain explicit instead of producing a zero line',()=>{
 assert.deepEqual(droneTrend({...run,droneTelemetry:false},90),[]);
 assert.deepEqual(droneTrend({...run,lastLogSeconds:100},90),[]);
 for(const window of [0,-1,NaN,Infinity])assert.deepEqual(droneTrend(run,window),[]);
 assert.deepEqual(droneTrend({...run,droneTimes:[]},90).at(-1),{seconds:220,rate:0});
});

const complete=():ArbitrationRun=>({id:'run-a',nodeId:'A',node:'Hyf',planet:'Deimos',missionType:'Defense',source:'test',status:'completed',startUtc:'2026-10-25T00:00:00Z',endUtc:null,startLogSeconds:100,lastLogSeconds:300,gameplayStart:110,gameplayEnd:290,isHost:true,startObserved:true,hasGap:false,droneTelemetry:true,wavesCompleted:2,rewardCycles:0,enemySpawns:15,droneSpawns:4,intervals:[{index:1,kind:'wave',start:110,end:160,complete:true,drones:2},{index:2,kind:'wave',start:180,end:240,complete:true,drones:2}],timeline:[],samples:[{seconds:110,enemies:0,drones:0,live:2},{seconds:140,enemies:10,drones:2,live:8},{seconds:170,enemies:15,drones:2,live:3}],droneTimes:[120,140,190,210],qualityNotes:[],metadata:{notes:'support',role:'DPS',favorite:true,manualVitus:null}});
test('library filtering and sorting apply to the full list before slicing',()=>{
 const older={...complete(),id:'old',startUtc:'2026-10-01T00:00:00Z',isHost:false,hasGap:true},newer={...complete(),id:'new',startUtc:'2026-10-25T01:00:00Z',lastLogSeconds:400};
 assert.deepEqual(filterRunLibrary([older,newer],'',{},'oldest').map(r=>r.id),['old','new']);
 assert.deepEqual(filterRunLibrary([older,newer],'',{},'duration').map(r=>r.id),['new','old']);
 assert.equal(filterRunLibrary([older,newer],'support',{perspective:'host',captureQuality:'complete',favorite:'yes'},'newest').length,1);
 assert.equal(filterRunLibrary([older,newer],'', {date:'7'},'newest',Date.parse('2026-10-25T02:00:00Z')).length,1);
 assert.equal(filterRunLibrary([older,newer],'火卫二',{},'newest',Date.now(),{A:'火卫二'}).length,2);
 assert.equal(filterRunLibrary([{...complete(),status:'recording'}],'',{},'newest').length,0);
});
test('all pages are acquired before sort; cancellation and changing libraries do not leak partial rows',async()=>{
 const rows=Array.from({length:61},(_,i)=>({...complete(),id:'r'+i})),calls:number[]=[];
 const result=await readRunLibrary(async offset=>{calls.push(offset);return {runs:rows.slice(offset,offset+50),total:rows.length};},()=>true);
 assert.equal(result!.length,61);assert.deepEqual(calls,[0,50]);
 let active=true;assert.equal(await readRunLibrary(async()=>{active=false;return {runs:rows.slice(0,50),total:61};},()=>active),null);
 await assert.rejects(readRunLibrary(async offset=>({runs:rows.slice(0,Math.min(50,61-offset)),total:61}),()=>true),/changed/);
});
test('interval views infer observed pauses conservatively and first-N requires contiguous identities',()=>{
 const r=complete(),rows=reportIntervals(r);assert.equal(rows[0].active,50);assert.equal(rows[0].pause,20);assert.equal(rows[0].duration,70);assert.deepEqual(firstIntervalsRange(r,2),[10,140]);
 r.intervals[0].end=180;assert.equal(reportIntervals(r)[0].active,null);assert.equal(reportIntervals(r)[0].pause,null);
 r.intervals[1].index=3;assert.equal(firstIntervalsRange(r,2),null);
});
test('observed rates use adjacent samples and keep an unobserved first sample null',()=>{
 const r=complete();assert.deepEqual(observationSeries(r,'enemyRate').map(p=>p.y),[null,20,10]);
 assert.deepEqual(observationSeries({...r,enemySpawns:null},'enemies'),[]);
 assert.deepEqual(observationSeries({...r,droneTelemetry:false},'droneRate'),[]);
});
test('drone cadence clips range, excludes a spawn on the open sliding-window boundary and retains gaps',()=>{
 const r=complete(),cadence=droneCadence(r,0,200);assert.equal(cadence.count,4);assert.equal(cadence.mean,30);assert.equal(cadence.median,20);assert.equal(cadence.peak,2);assert.equal(cadence.longest[0].seconds,50);
 assert.equal(droneCadence(r,50,80).count,0);assert.equal(droneCadence({...r,droneTelemetry:false},0,200).known,false);
});
test('wave recap only appears after an observed completion with no newer active wave',()=>{
 const r={...complete(),status:'recording',gameplayEnd:null};const recap=waveRecap(r)!;assert.equal(recap.index,2);assert.equal(recap.drones,2);assert.equal(recap.seconds,60);assert.equal(recap.averageRate,2.4);
 r.intervals.push({index:3,kind:'wave',start:280,end:null,complete:false,drones:0});assert.equal(waveRecap(r),null);
 assert.ok(runPhases(complete()).reduce((n,p)=>n+p.seconds,0)<=200);
});

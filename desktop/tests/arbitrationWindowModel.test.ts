import test from 'node:test';
import assert from 'node:assert/strict';
import {
 MINI_HEIGHT_COLLAPSED,
 MINI_HEIGHT_NORMAL,
 miniPhaseLabel,
 miniStatusBadge,
 miniWindowHeight,
 restoreMiniPosition,
} from '../src/arbitrationWindowModel.ts';

test('detached monitor and DPI changes restore mini into visible work area',()=>{
 assert.deepEqual(restoreMiniPosition({x:3000,y:2000},[{x:0,y:0,width:1920,height:1040,scale:1.5}]),{x:1350,y:560});
 assert.deepEqual(restoreMiniPosition({x:-1000,y:50},[{x:-1920,y:0,width:1920,height:1080,scale:1}]),{x:-1000,y:50});
 assert.equal(restoreMiniPosition({x:NaN,y:10},[{x:0,y:0,width:100,height:100,scale:1}]),null);
});

test('miniWindowHeight scales cleanly between collapsed, normal, and interval details',()=>{
 assert.equal(miniWindowHeight(true,true,5),MINI_HEIGHT_COLLAPSED);
 assert.equal(miniWindowHeight(false,false,5),MINI_HEIGHT_NORMAL);
 const twoRows=miniWindowHeight(false,true,2);
 const manyRows=miniWindowHeight(false,true,12);
 assert.ok(twoRows>MINI_HEIGHT_NORMAL);
 assert.ok(twoRows<manyRows);
 assert.equal(manyRows,440);
});

test('miniPhaseLabel picks exact defense wave or survival rotation wording',()=>{
 assert.equal(miniPhaseLabel({phase:'preparing',index:null},'wave',false),'准备中');
 assert.equal(miniPhaseLabel({phase:'active',index:2},'wave',false),'波次 2');
 assert.equal(miniPhaseLabel({phase:'active',index:3},'rotation',false),'轮次 3');
 assert.equal(miniPhaseLabel({phase:'active',index:1},'rotation',true),'Rotation 1');
});

test('miniStatusBadge summarizes run and watcher states concisely with hover titles',()=>{
 assert.equal(miniStatusBadge({status:'recording',hasGap:false,lastLogSeconds:100},105,'watching',false).label,'实时');
 assert.equal(miniStatusBadge({status:'recording',hasGap:false,lastLogSeconds:100},120,'watching',false).label,'计时推算');
 assert.equal(miniStatusBadge({status:'completed',hasGap:false,lastLogSeconds:100},120,'watching',false).label,'已结束');
 assert.equal(miniStatusBadge(null,0,'waiting-account',false).label,'未同步');
 assert.equal(miniStatusBadge(null,0,'log-unavailable',false).label,'无日志');
 assert.equal(miniStatusBadge(null,0,'watching',false).label,'监听中');
});

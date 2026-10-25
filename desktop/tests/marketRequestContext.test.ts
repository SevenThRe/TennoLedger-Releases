import test from 'node:test';
import assert from 'node:assert/strict';
import {inMarketContext} from '../src/marketRequestContext.ts';

test('old account responses cannot publish and stale follow-up requests never start',async()=>{
 let current=true,calls=0,release!:(value:string)=>void;
 const pending=inMarketContext(()=>current,()=>{calls++;return new Promise<string>(r=>{release=r;});});
 current=false;release('old account orders');
 await assert.rejects(pending,/账号已切换/);
 await assert.rejects(inMarketContext(()=>current,async()=>{calls++;return 'write';}),/账号已切换/);
 assert.equal(calls,1);
 assert.equal(await inMarketContext(()=>true,async()=>'new account orders'),'new account orders');
});

test('old account errors are replaced by context change without retrying',async()=>{
 let current=true,reject!:(error:Error)=>void;
 const pending=inMarketContext(()=>current,()=>new Promise((_resolve,r)=>{reject=r;}));
 current=false;reject(Error('old failure'));
 await assert.rejects(pending,/账号已切换/);
 await assert.rejects(inMarketContext(()=>true,async()=>{throw Error('current failure');}),/current failure/);
});

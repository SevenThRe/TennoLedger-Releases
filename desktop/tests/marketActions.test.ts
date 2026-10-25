import test from 'node:test';
import assert from 'node:assert/strict';
import {MarketActionGate,publishMarketOrder,publishRivenAuction} from '../src/marketActions.ts';

test('synchronous action latch suppresses duplicate clicks until receipt and refresh finish',async()=>{
 const gate=new MarketActionGate();let release!:()=>void,calls=0;
 const first=gate.run(async()=>{calls++;await new Promise<void>(resolve=>{release=resolve;});});
 await gate.run(async()=>{calls++;});assert.equal(calls,1);
 release();await first;await gate.run(async()=>{calls++;});assert.equal(calls,2);
});
test('action latch releases after rejection without automatically retrying',async()=>{
 const gate=new MarketActionGate();let calls=0;
 await assert.rejects(gate.run(async()=>{calls++;throw Error('timeout');}),/timeout/);
 assert.equal(calls,1);await gate.run(async()=>{calls++;});assert.equal(calls,2);
});
test('valid creation receipt remains success when only list refresh fails',async()=>{
 let creates=0;
 const result=await publishMarketOrder(async()=>{creates++;return {data:{id:'confirmed-order'}};},async()=>{throw Error('offline');});
 assert.equal(creates,1);assert.match(result,/上架成功 · confirmed-order/);assert.match(result,/刷新失败/);
 assert.equal(await publishMarketOrder(async()=>({data:{id:'ok'}}),async()=>{}),'上架成功 · ok');
});
test('missing or malformed receipt never produces a success message',async()=>{
 for(const data of [null,{}, {id:''},{id:' '},{id:123},'order']){
  await assert.rejects(publishMarketOrder(async()=>({data}),async()=>{}),/有效订单 ID/);
 }
 let refreshed=false;
 await assert.rejects(publishMarketOrder(async()=>{throw Error('network');},async()=>{refreshed=true;}),/network/);
 assert.equal(refreshed,false);
});

test('riven receipt is recorded before refreshing and survives refresh failure',async()=>{
 const events:string[]=[];
 const message=await publishRivenAuction(async()=>{events.push('send');return {data:{id:'auction-id'}};},
  id=>events.push('receipt:'+id),async()=>{events.push('refresh');throw Error('offline');});
 assert.deepEqual(events,['send','receipt:auction-id','refresh']);
 assert.match(message,/成功回执：auction-id/);assert.match(message,/刷新失败/);
});

test('riven publication rejects invalid receipts and never records or retries them',async()=>{
 for(const data of [null,{}, {id:123},{id:''},{id:' '}]){
  let sends=0,recorded=false,refreshed=false;
  await assert.rejects(publishRivenAuction(async()=>{sends++;return {data};},()=>{recorded=true;},async()=>{refreshed=true;}),/有效挂售 ID/);
  assert.equal(sends,1);assert.equal(recorded,false);assert.equal(refreshed,false);
 }
 assert.equal(await publishRivenAuction(async()=>({data:{id:'ok'}}),()=>{},async()=>{}),'市场已返回成功回执：ok');
});

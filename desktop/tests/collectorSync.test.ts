import test from 'node:test';
import assert from 'node:assert/strict';
import {requestGameSync} from '../src/collectorSync.ts';
test('retry starts disabled or stopped collector before requesting a real refresh',async()=>{
 for(const status of [{enabled:false,running:false},{enabled:true,running:false},{enabled:true,running:true}]){
  const calls:string[]=[];
  await requestGameSync(async<T>(command:string)=>{calls.push(command);return (command==='collector_status'?status:true) as T;});
  assert.deepEqual(calls,status.enabled&&status.running?['collector_status','collector_request_refresh']:['collector_status','collector_set_enabled','collector_request_refresh']);
 }
});
test('retry reports refusal and startup failure rather than pretending success',async()=>{
 await assert.rejects(requestGameSync(async<T>(command:string)=>(command==='collector_status'?{enabled:true,running:true}:false) as T),/Game sync/);
 await assert.rejects(requestGameSync(async<T>(command:string)=>{if(command==='collector_set_enabled')throw Error('worker-missing');return {enabled:false,running:false} as T;}),/worker-missing/);
});

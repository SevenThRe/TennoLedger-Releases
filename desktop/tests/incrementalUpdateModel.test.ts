import test from 'node:test';import assert from 'node:assert/strict';
import {incrementalPackage} from '../src/incrementalUpdateModel.ts';import {runUpdate,type UpdateState} from '../src/updateFlow.ts';
test('incremental download uses only incremental commands, monotonic byte progress and one listener cleanup',async()=>{
 const calls:string[]=[],states:UpdateState[]=[];let receive:(n:number)=>void=()=>{};
 const update=incrementalPackage({version:'0.1.7',bytes:40,files:1},async command=>{calls.push(command);if(command==='incremental_download'){receive(20);receive(10);receive(40);}},async cb=>{receive=cb;return()=>calls.push('unlisten');});
 await runUpdate({check:async()=>update,prepare:async()=>{calls.push('backup');},resume:async()=>{calls.push('resume');}},s=>states.push(s));
 assert.deepEqual(calls,['incremental_download','unlisten','backup','incremental_install']);assert.equal(states.filter(s=>s.phase==='downloading').at(-1)?.downloaded,40);
});
test('a failed incremental download removes the listener and never stops collectors or installs',async()=>{
 const calls:string[]=[],states:UpdateState[]=[];const update=incrementalPackage({version:'0.1.7',bytes:40,files:1},async()=>{throw Error('hash mismatch');},async()=>()=>calls.push('unlisten'));
 await runUpdate({check:async()=>update,prepare:async()=>{calls.push('backup');},resume:async()=>{calls.push('resume');}},s=>states.push(s));assert.deepEqual(calls,['unlisten']);assert.equal(states.at(-1)?.phase,'error');
});

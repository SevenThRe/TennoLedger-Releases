import test from 'node:test';
import assert from 'node:assert/strict';
import {runUpdate,type PackageUpdate,type UpdateState} from '../src/updateFlow.ts';

function fixture(fail?:string){
 const calls:string[]=[],states:UpdateState[]=[];
 const update:PackageUpdate={version:'0.2.0',download:async cb=>{calls.push('download');cb({event:'Started',data:{contentLength:20}});cb({event:'Progress',data:{chunkLength:20}});if(fail==='download')throw Error('invalid signature');},install:async()=>{calls.push('install');if(fail==='install')throw Error('installer failed');},close:async()=>{calls.push('close');}};
 const deps={check:async()=>{calls.push('check');if(fail==='check')throw Error('offline');return update;},prepare:async()=>{calls.push('backup');if(fail==='backup')throw Error('disk full');},resume:async()=>{calls.push('resume');}};
 return {calls,states,deps};
}
test('startup downloads before backup and install, reports progress',async()=>{
 const f=fixture();await runUpdate(f.deps,s=>f.states.push(s));
 assert.deepEqual(f.calls,['check','download','backup','install','close']);
 assert.ok(f.states.some(s=>s.downloaded===20&&s.total===20));
 assert.equal(f.states.at(-1)?.phase,'installing');
});
test('no update starts no backup or installer',async()=>{
 const f=fixture();await runUpdate({...f.deps,check:async()=>null},s=>f.states.push(s));
 assert.deepEqual(f.calls,[]);assert.equal(f.states.at(-1)?.phase,'ready');
});
for(const fail of ['check','download','backup','install'])test(`${fail} failure keeps current app available`,async()=>{
 const f=fixture(fail);await runUpdate(f.deps,s=>f.states.push(s));
 assert.equal(f.states.at(-1)?.phase,'error');
 if(fail!=='install')assert.ok(!f.calls.includes('install'));
 assert.equal(f.calls.includes('resume'),fail==='backup'||fail==='install');
 if(fail!=='check')assert.equal(f.calls.at(-1),'close');
});

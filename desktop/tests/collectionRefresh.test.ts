import test from 'node:test';
import assert from 'node:assert/strict';
import {refreshCollectionState} from '../src/collectionRefresh.ts';
test('crafting failure preserves a successfully read account',async()=>{
 let account:unknown,ready:unknown;
 const errors=await refreshCollectionState(async()=>({rank:35}),async()=>{throw Error('crafting unavailable');},()=>true,v=>account=v,v=>ready=v);
 assert.deepEqual(account,{rank:35});assert.equal(ready,undefined);assert.match(errors![0],/crafting unavailable/);
});
test('account failure does not discard valid readiness and reports both failures',async()=>{
 let ready:unknown;
 const errors=await refreshCollectionState(async()=>{throw Error('account unavailable');},async()=>({frame:true}),()=>true,()=>assert.fail('no account result'),v=>ready=v);
 assert.deepEqual(ready,{frame:true});assert.equal(errors!.length,1);
 const both=await refreshCollectionState(async()=>{throw Error('account');},async()=>{throw Error('crafting');},()=>true,()=>{},()=>{});
 assert.equal(both!.length,2);
});
test('old refresh cannot overwrite a newer event or update an unmounted view',async()=>{
 let generation=1,resolve!:(value:string)=>void;const applied:string[]=[];
 const old=refreshCollectionState(()=>new Promise<string>(r=>resolve=r),async()=>({}),()=>generation===1,v=>applied.push(v),()=>applied.push('old readiness'));
 generation=2;
 await refreshCollectionState(async()=>'new',async()=>({}),()=>generation===2,v=>applied.push(v),()=>{});
 resolve('old');assert.equal(await old,null);assert.deepEqual(applied,['new']);
});
test('successful null account is authoritative, not treated as a request failure',async()=>{
 let account:unknown='old';
 assert.deepEqual(await refreshCollectionState(async()=>null,async()=>({}),()=>true,v=>account=v,()=>{}),[]);
 assert.equal(account,null);
});

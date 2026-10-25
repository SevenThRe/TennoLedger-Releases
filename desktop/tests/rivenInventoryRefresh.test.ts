import test from 'node:test';
import assert from 'node:assert/strict';
import {rivenInventoryRefresh} from '../src/rivenInventoryRefresh.ts';
test('a timed-out analytics read preserves prior results and a retry rejects late stale data',async()=>{
 let finish!:(value:string)=>void;let calls=0;const values:string[]=[],errors:string[]=[],busy:boolean[]=[];
 const reader=rivenInventoryRefresh(()=>++calls===1?Promise.resolve('previous'):calls===2?new Promise<string>(resolve=>{finish=resolve;}):Promise.resolve('fresh'),value=>values.push(value),value=>busy.push(value),error=>errors.push(error),15);
 await reader.refresh();await reader.refresh();assert.match(errors.at(-1)!,/timed out/);assert.deepEqual(values,['previous']);assert.equal(busy.at(-1),false);
 await reader.refresh();finish('late');await Promise.resolve();assert.deepEqual(values,['previous','fresh']);reader.dispose();
});
function deferred<T>(){let resolve!:(v:T)=>void,reject!:(e:Error)=>void;const promise=new Promise<T>((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
test('newest inventory wins and an obsolete read cannot clear loading or report errors',async()=>{
 const old=deferred<string>(),latest=deferred<string>(),published:string[]=[],busy:boolean[]=[],errors:string[]=[];
 let calls=0;
 const reader=rivenInventoryRefresh(()=>++calls===1?old.promise:latest.promise,v=>published.push(v),v=>busy.push(v),v=>errors.push(v));
 const a=reader.refresh(),b=reader.refresh();
 old.reject(Error('old error'));await a;
 assert.deepEqual(busy,[true,true]);assert.deepEqual(errors,['','']);
 latest.resolve('new inventory');await b;
 assert.deepEqual(published,['new inventory']);assert.deepEqual(busy,[true,true,false]);
});
test('late success cannot overwrite a newer snapshot, including an authoritative null',async()=>{
 const old=deferred<string|null>(),latest=deferred<string|null>(),published:(string|null)[]=[];let calls=0;
 const reader=rivenInventoryRefresh(()=>++calls===1?old.promise:latest.promise,v=>published.push(v),()=>{},()=>{});
 const a=reader.refresh(),b=reader.refresh();latest.resolve(null);await b;old.resolve('stale');await a;
 assert.deepEqual(published,[null]);
});
test('failure preserves published inventory and disposed readers never publish or reload',async()=>{
 const pending=deferred<string>(),published:string[]=[],errors:string[]=[];let calls=0;
 const reader=rivenInventoryRefresh(async()=>{calls++;if(calls===1)return 'owned';if(calls===2)throw Error('offline');return pending.promise;},v=>published.push(v),()=>{},v=>errors.push(v));
 await reader.refresh();await reader.refresh();assert.deepEqual(published,['owned']);assert.match(errors.at(-1)!,/offline/);
 const work=reader.refresh();reader.dispose();pending.resolve('discarded');await work;await reader.refresh();
 assert.equal(calls,3);assert.deepEqual(published,['owned']);
});

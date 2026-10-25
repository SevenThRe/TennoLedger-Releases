import {test} from 'node:test';
import assert from 'node:assert/strict';
import {VeiledSubmissions,veiledSubmissionKey} from '../src/veiledSubmission.ts';
test('duplicate submits and reopening a card share the same pending request and receipt',async()=>{
 const store=new VeiledSubmissions(),key=veiledSubmissionKey('player','pc','rifle');
 let resolve!:(value:{data:{id:string}})=>void,calls=0;
 const create=()=>{calls++;return new Promise<{data:{id:string}}>(done=>{resolve=done;});};
 const first=store.submit(key,create);
 await store.submit(key,create);
 assert.equal(calls,1);assert.equal(store.get(key).pending,true);
 let updates=0;const off=store.subscribe(()=>updates++);off();
 const reopen=store.subscribe(()=>updates++);
 resolve({data:{id:'order-1'}});await first;reopen();
 assert.equal(updates,1);assert.equal(store.get(key).receipt,'order-1');
 await store.submit(key,create);assert.equal(calls,1);
});
test('late receipts remain isolated by account platform and item',async()=>{
 const store=new VeiledSubmissions(),old=veiledSubmissionKey('a','pc','rifle');
 let resolve!:(value:{data:{id:string}})=>void;
 const first=store.submit(old,()=>new Promise(done=>{resolve=done;}));
 const keys=[veiledSubmissionKey('b','pc','rifle'),veiledSubmissionKey('a','ps4','rifle'),veiledSubmissionKey('a','pc','pistol')];
 resolve({data:{id:'old'}});await first;
 for(const key of keys){assert.equal(store.get(key).receipt,'');assert.equal(store.get(key).pending,false);}
});
test('invalid receipt is reported and rejected requests release the pending state',async()=>{
 const store=new VeiledSubmissions();
 await store.submit('missing',async()=>({data:{}}));
 assert.match(store.get('missing').error,/订单 ID/);assert.equal(store.get('missing').pending,false);
 await store.submit('rejected',async()=>{throw Error('账户未验证');});
 assert.match(store.get('rejected').error,/账户未验证/);assert.equal(store.get('rejected').pending,false);
});

test('malformed ordinary order receipts never enter successful state or automatically retry',async()=>{
 for(const data of [null,{},'order-id',{id:''},{id:' '},{id:123},{id:true},{id:{value:'order-id'}},{id:['order-id']}]){
  const store=new VeiledSubmissions();let calls=0;
  const events:string[]=[];store.subscribe(()=>events.push(store.get('test').receipt));
  await store.submit('test',async()=>{calls++;return {data};});
  assert.equal(calls,1);assert.equal(store.get('test').pending,false);
  assert.equal(store.get('test').receipt,'');assert.match(store.get('test').error,/有效订单 ID/);
  assert.deepEqual(events,['','']);
 }
});

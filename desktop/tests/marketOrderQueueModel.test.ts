import test from 'node:test';
import assert from 'node:assert/strict';
import {
 GROUP_ALL_ORDER_ID,
 MarketOrderQueue,
 applyConfirmedOrderMutation,
 projectOrderState,
 reconcileSelection,
 type OrderQueueContext,
 type OrderQueueState,
 type OrderRowBase,
} from '../src/marketOrderQueueModel.ts';

const ctx=(overrides:Partial<OrderQueueContext>={}):OrderQueueContext=>({
 accountId:'acct-1',
 platform:'pc',
 sessionGeneration:1,
 ...overrides,
});

const deferred=<T=unknown>()=>{
 let resolve!:(v:T)=>void,reject!:(e:unknown)=>void;
 const promise=new Promise<T>((res,rej)=>{resolve=res;reject=rej;});
 return {promise,resolve,reject};
};

test('serial FIFO queue executes batch deletes strictly one-by-one and triggers trailing refresh once',async()=>{
 let active=0,maxActive=0,drains=0;
 const started:string[]=[],confirmed:string[]=[],states:OrderQueueState[]=[];
 const gates=new Map<string,ReturnType<typeof deferred<unknown>>>();
 const currentCtx=ctx();
 const queue=new MarketOrderQueue({
  context:()=>currentCtx,
  execute:async task=>{
   active++;maxActive=Math.max(maxActive,active);
   started.push(task.orderId);
   const gate=deferred();gates.set(task.orderId,gate);
   try{return await gate.promise;}finally{active--;}
  },
  onConfirmed:task=>{confirmed.push(task.orderId);},
  onDrain:()=>{drains++;},
  onChange:s=>{states.push(s);},
 });

 const count=queue.enqueueBatchDelete([
  {orderId:'o1',label:'Order 1'},
  {orderId:'o2',label:'Order 2'},
  {orderId:'o3',label:'Order 3'},
 ],currentCtx);
 assert.equal(count,3);
 assert.deepEqual(started,['o1']);
 assert.equal(queue.state().queuedCount,2);
 assert.equal(queue.state().runningTask?.orderId,'o1');

 gates.get('o1')!.resolve(null);
 await new Promise(r=>setTimeout(r,0));
 assert.deepEqual(confirmed,['o1']);
 assert.deepEqual(started,['o1','o2']);

 gates.get('o2')!.resolve(null);
 await new Promise(r=>setTimeout(r,0));
 assert.deepEqual(confirmed,['o1','o2']);
 assert.deepEqual(started,['o1','o2','o3']);

 gates.get('o3')!.resolve(null);
 await new Promise(r=>setTimeout(r,0));
 assert.equal(maxActive,1);
 assert.deepEqual(confirmed,['o1','o2','o3']);
 assert.equal(drains,1);
 assert.equal(queue.state().active,false);
 assert.equal(queue.state().completed,3);
});

test('coalesces rapid updates and supersedes queued updates with delete without cancelling in-flight request',async()=>{
 const currentCtx=ctx();
 const executed:{orderId:string;kind:string;body:Record<string,unknown>}[]=[];
 const gate=deferred();
 let firstRun=true;
 const queue=new MarketOrderQueue({
  context:()=>currentCtx,
  execute:async task=>{
   executed.push({orderId:task.orderId,kind:task.kind,body:task.body});
   if(firstRun){firstRun=false;return await gate.promise;}
   return null;
  },
  onConfirmed:()=>{},
  onDrain:()=>{},
  onChange:()=>{},
 });

 // Task 1 starts running immediately
 queue.enqueue({orderId:'a',label:'Item A',kind:'update',body:{quantity:2},context:currentCtx});
 // Rapid updates on 'b' coalesce into single update {platinum:25, quantity:5}
 queue.enqueue({orderId:'b',label:'Item B',kind:'update',body:{quantity:4,platinum:30},context:currentCtx});
 queue.enqueue({orderId:'b',label:'Item B',kind:'update',body:{quantity:5,platinum:25},context:currentCtx});
 assert.equal(queue.state().tasks.filter(t=>t.orderId==='b').length,1);
 assert.deepEqual(queue.state().tasks.find(t=>t.orderId==='b')?.body,{quantity:5,platinum:25});

 // Queue update on 'c' then delete 'c' -> queued update dropped, replaced by delete
 queue.enqueue({orderId:'c',label:'Item C',kind:'update',body:{quantity:3},context:currentCtx});
 queue.enqueue({orderId:'c',label:'Item C',kind:'update',body:{visible:false},context:currentCtx});
 assert.ok(queue.enqueue({orderId:'c',label:'Item C',kind:'delete',context:currentCtx}));
 // Duplicate delete and follow-up update after queued delete are rejected
 assert.equal(queue.enqueue({orderId:'c',label:'Item C',kind:'delete',context:currentCtx}),null);
 assert.equal(queue.enqueue({orderId:'c',label:'Item C',kind:'update',body:{platinum:10},context:currentCtx}),null);

 gate.resolve({});
 await new Promise(r=>setTimeout(r,0));
 assert.deepEqual(executed,[
  {orderId:'a',kind:'update',body:{quantity:2}},
  {orderId:'b',kind:'update',body:{quantity:5,platinum:25}},
  {orderId:'c',kind:'delete',body:{}},
 ]);
});

test('isolates per-order errors without retry while session abort and context switch cancel remaining queue',async()=>{
 let activeCtx=ctx();
 const executed:string[]=[];
 let drains=0;
 const queue=new MarketOrderQueue({
  context:()=>activeCtx,
  execute:async task=>{
   executed.push(`${task.orderId}:${task.kind}`);
   if(task.orderId==='bad')throw Error('市场 HTTP 500');
   if(task.orderId==='shift')activeCtx=ctx({accountId:'acct-2'});
   if(task.orderId==='unauth')throw Error('401 请先登录');
   return null;
  },
  onConfirmed:()=>{},
  onDrain:()=>{drains++;},
  onChange:()=>{},
 });

 // Per-order failure on 'bad' drops its subsequent queued action while continuing 'ok'
 queue.enqueue({orderId:'bad',label:'Bad',kind:'delete',context:activeCtx});
 queue.enqueue({orderId:'bad',label:'Bad',kind:'close',body:{quantity:1},context:activeCtx});
 queue.enqueue({orderId:'ok',label:'OK',kind:'delete',context:activeCtx});
 await new Promise(r=>setTimeout(r,0));
 assert.deepEqual(executed,['bad:delete','ok:delete']);
 assert.equal(queue.state().failed.length,1);
 assert.equal(queue.state().failed[0].orderId,'bad');
 assert.equal(drains,1);

 // Auth failure (401) cancels all remaining tasks and skips onDrain when 0 confirmed
 executed.length=0;drains=0;
 queue.enqueue({orderId:'unauth',label:'Unauth',kind:'delete',context:activeCtx});
 queue.enqueue({orderId:'after',label:'After',kind:'delete',context:activeCtx});
 await new Promise(r=>setTimeout(r,0));
 assert.deepEqual(executed,['unauth:delete']);
 assert.equal(queue.state().tasks.length,0);
 assert.equal(drains,0);

 // Mid-flight context shift cancels remaining tasks
 executed.length=0;drains=0;
 queue.enqueue({orderId:'shift',label:'Shift',kind:'delete',context:activeCtx});
 queue.enqueue({orderId:'never',label:'Never',kind:'delete',context:activeCtx});
 await new Promise(r=>setTimeout(r,0));
 assert.deepEqual(executed,['shift:delete']);
 assert.equal(queue.state().tasks.length,0);
 assert.equal(drains,0);
});

test('cancelOrder undoes queued delete without interrupting running write and cancelAllQueued clears pending',async()=>{
 const currentCtx=ctx();
 const gate=deferred();
 const ran:string[]=[];
 const queue=new MarketOrderQueue({
  context:()=>currentCtx,
  execute:async task=>{ran.push(task.orderId);if(task.orderId==='o1')return await gate.promise;return null;},
  onConfirmed:()=>{},
  onDrain:()=>{},
  onChange:()=>{},
 });

 queue.enqueueBatchDelete([
  {orderId:'o1',label:'One'},
  {orderId:'o2',label:'Two'},
  {orderId:'o3',label:'Three'},
  {orderId:'o4',label:'Four'},
 ],currentCtx);
 queue.cancelOrder('o1'); // already running, cannot cancel
 queue.cancelOrder('o2'); // queued, cancelled!
 assert.deepEqual(queue.state().tasks.map(t=>t.orderId),['o1','o3','o4']);

 queue.cancelAllQueued();
 assert.deepEqual(queue.state().tasks.map(t=>t.orderId),['o1']);

 gate.resolve(null);
 await new Promise(r=>setTimeout(r,0));
 assert.deepEqual(ran,['o1']);
 assert.equal(queue.state().active,false);
});

test('pure projection, confirmed state mutation and selection reconciliation behave consistently',()=>{
 const base:OrderRowBase[]=[
  {id:'1',platinum:10,quantity:3,visible:true},
  {id:'2',platinum:20,quantity:1,visible:false},
  {id:'3',platinum:15,quantity:2,visible:true},
 ];
 const c=ctx();
 const tasks=[
  {id:'t1',orderId:'1',label:'A',kind:'update' as const,body:{platinum:12,visible:false},status:'running' as const,context:c},
  {id:'t2',orderId:'1',label:'A',kind:'close' as const,body:{quantity:1},status:'queued' as const,context:c},
  {id:'t3',orderId:'2',label:'B',kind:'close' as const,body:{quantity:1},status:'queued' as const,context:c},
  {id:'t4',orderId:'3',label:'C',kind:'delete' as const,body:{},status:'queued' as const,context:c},
 ];

 const p1=projectOrderState(base[0],tasks);
 assert.equal(p1.row.platinum,12);
 assert.equal(p1.row.quantity,2);
 assert.equal(p1.row.visible,false);
 assert.equal(p1.deleting,false);
 assert.equal(p1.pendingCount,2);
 assert.equal(p1.runningKind,'update');
 assert.equal(p1.queuedKind,'close');

 const p2=projectOrderState(base[1],tasks);
 assert.equal(p2.row.quantity,0);
 assert.equal(p2.deleting,true);

 const p3=projectOrderState(base[2],tasks);
 assert.equal(p3.deleting,true);
 assert.equal(p3.canUndoQueued,true);

 const afterUpdate=applyConfirmedOrderMutation(base,tasks[0],{platinum:12,quantity:3,visible:false});
 assert.equal(afterUpdate[0].platinum,12);
 assert.equal(afterUpdate[0].visible,false);

 const afterClose=applyConfirmedOrderMutation(afterUpdate,tasks[2],null);
 assert.deepEqual(afterClose.map(r=>r.id),['1','3']);

 const afterDelete=applyConfirmedOrderMutation(afterClose,tasks[3],null);
 assert.deepEqual(afterDelete.map(r=>r.id),['1']);

 const sel=reconcileSelection(new Set(['1','2','3','missing']),new Set(['1','2','3']),new Set(['3']));
 assert.deepEqual([...sel],['1','2']);
});

test('group visibility projection, coalescing barriers, and global confirmation work across rows',async()=>{
 const base:OrderRowBase[]=[
  {id:'1',platinum:10,quantity:2,visible:true},
  {id:'2',platinum:20,quantity:1,visible:true},
 ];
 const c=ctx();
 const gate=deferred();
 const executed:{orderId:string;kind:string;body:Record<string,unknown>}[]=[];
 let holdFirst=true;
 const queue=new MarketOrderQueue({
  context:()=>c,
  execute:async task=>{
   executed.push({orderId:task.orderId,kind:task.kind,body:task.body});
   if(holdFirst){holdFirst=false;return await gate.promise;}
   return null;
  },
  onConfirmed:()=>{},
  onDrain:()=>{},
  onChange:()=>{},
 });

 // Busy head request holds subsequent tasks in queued state
 queue.enqueue({orderId:'head',label:'Head',kind:'update',body:{platinum:11},context:c});
 // Two back-to-back group visibility toggles coalesce to {visible: false}
 queue.enqueue({orderId:GROUP_ALL_ORDER_ID,label:'All orders',kind:'update_group',body:{visible:true},context:c});
 queue.enqueue({orderId:GROUP_ALL_ORDER_ID,label:'All orders',kind:'update_group',body:{visible:false},context:c});
 // Per-order update after group toggle must NOT reorder before update_group
 queue.enqueue({orderId:'2',label:'Order 2',kind:'update',body:{visible:true},context:c});
 // Subsequent group visibility toggle must NOT coalesce backwards across per-order update('2')
 queue.enqueue({orderId:GROUP_ALL_ORDER_ID,label:'All orders',kind:'update_group',body:{visible:true},context:c});

 const tasks=queue.state().tasks;
 assert.equal(tasks.length,4);
 assert.equal(projectOrderState(base[0],tasks.slice(0,3)).row.visible,false);
 assert.equal(projectOrderState(base[1],tasks.slice(0,3)).row.visible,true);
 assert.equal(projectOrderState(base[0],tasks).row.visible,true);
 assert.equal(projectOrderState(base[0],tasks).canUndoQueued,false);

 gate.resolve(null);
 await new Promise(r=>setTimeout(r,0));
 assert.deepEqual(executed,[
  {orderId:'head',kind:'update',body:{platinum:11}},
  {orderId:GROUP_ALL_ORDER_ID,kind:'update_group',body:{visible:false}},
  {orderId:'2',kind:'update',body:{visible:true}},
  {orderId:GROUP_ALL_ORDER_ID,kind:'update_group',body:{visible:true}},
 ]);

 const mutated=applyConfirmedOrderMutation(base,{id:'g',orderId:GROUP_ALL_ORDER_ID,label:'All',kind:'update_group',body:{visible:false},status:'running',context:c},null);
 assert.deepEqual(mutated.map(r=>r.visible),[false,false]);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {buildBulkPlan,MarketBulkRunner,matchingBulkPrice,bulkOrderFingerprint,type BulkOrder,type BulkQuote,type BulkContext} from '../src/marketBulkModel.ts';
const ctx:BulkContext={accountId:'me',platform:'pc'};
const order=(id='1',quantity=3):BulkOrder=>({id,itemId:'item',type:'sell',platinum:30,quantity,visible:true,rank:0});
const plan=(action:'prices'|'show'|'hide'|'fix'|'delete',rows:BulkOrder[],options:any={})=>buildBulkPlan(action,rows,rows,ctx,{id:'task',createdAt:'2026-10-25T00:00:00Z',label:o=>o.id,...options});
test('bulk prices follow reference side, rank, locale, status and special variant; own quotes excluded',()=>{
 const own=order(),quote=(id:string,p:number,extra:any={}):BulkQuote=>({...own,id,platinum:p,user:{id,status:'ingame',locale:'en'},...extra});
 const rows=[quote('a',20),quote('b',10,{rank:5}),quote('c',5,{perTrade:2}),quote('own',1),quote('z',2,{user:{id:'me',status:'ingame',locale:'en'}}),quote('offline',1,{user:{id:'x',status:'offline',locale:'en'}}),quote('chinese',3,{user:{id:'x',status:'ingame',locale:'zh-hans'}})];
 assert.equal(matchingBulkPrice(own,rows,new Set(['own']),'me'),20);
 assert.equal(matchingBulkPrice({...own,type:'buy'},rows.map(q=>({...q,type:'buy'})),new Set(['own']),'me'),20);
 assert.equal(matchingBulkPrice({...own,rank:null},rows,new Set(['own']),'me'),null);
});
test('price preview skips collisions and duplicate targets; visibility no-op remains read-only',()=>{
 const rows=[order('1'),{...order('2'),platinum:40}];
 const p=plan('prices',rows,{prices:new Map([['1',20],['2',20]])});
 assert.equal(p.items[0].body.platinum,20);assert.equal(p.items[1].action,null);
 assert.equal(plan('show',rows).items[0].action,null);assert.equal(plan('hide',rows).items[0].body.visible,false);
 const same=plan('prices',rows,{prices:new Map([['1',40]])});assert.equal(same.items[0].action,null);
});
test('inventory fix only reduces sells and shares stock among identical variants',()=>{
 const rows=[order('1',4),order('2',4),{...order('3',4),type:'buy' as const}];
 const p=plan('fix',rows,{owned:new Map([['1',5],['2',5],['3',0]])});
 assert.equal(p.items[0].action,null);assert.deepEqual(p.items[1].body,{quantity:1});assert.equal(p.items[2].action,null);
 assert.equal(plan('fix',[order()],{owned:new Map([['1',0]])}).items[0].action,'delete');
 assert.equal(plan('fix',[order()],{owned:new Map([['1',null]])}).items[0].action,null);
});
test('runner serializes writes, keeps completed receipts on cancel and rejects replay',async()=>{
 const rows=[order('1'),order('2')],p=plan('hide',rows),runner=new MarketBulkRunner(),writes:string[]=[];
 const io={context:()=>ctx,wait:async()=>{},read:async()=>rows,write:async(item:any)=>{writes.push(item.order.id);runner.cancel();},publish:()=>{}};
 const result=await runner.run(p,io);assert.deepEqual(writes,['1']);assert.deepEqual(result.map(r=>r.status),['succeeded','cancelled']);await assert.rejects(runner.run(p,io));
});
test('unknown write outcome is not retried; later rows remain unexecuted',async()=>{
 const rows=[order('1'),order('2')];let writes=0;
 const r=await new MarketBulkRunner().run(plan('delete',rows),{context:()=>ctx,wait:async()=>{},read:async()=>rows,write:async()=>{writes++;throw Error('timeout');},publish:()=>{}});
 assert.equal(writes,1);assert.deepEqual(r.map(i=>i.status),['uncertain','cancelled']);
});
test('changed order and changed account are never mutated; read retries are bounded',async()=>{
 const rows=[order()];let writes=0,reads=0;
 const io={context:()=>ctx,wait:async()=>{},read:async()=>{reads++;if(reads===1)throw Error('read');return [{...rows[0],quantity:2}];},write:async()=>{writes++;},publish:()=>{}};
 const r=await new MarketBulkRunner().run(plan('hide',rows),io);assert.equal(reads,2);assert.equal(writes,0);assert.equal(r[0].status,'skipped');
 const other=await new MarketBulkRunner().run(plan('delete',rows),{...io,context:()=>({...ctx,accountId:'other'})});assert.equal(other[0].status,'cancelled');assert.equal(writes,0);
});
test('inventory revalidation failures skip writes and price fingerprint includes every variant',async()=>{
 const o=order();assert.notEqual(bulkOrderFingerprint(o),bulkOrderFingerprint({...o,charges:1}));let writes=0;
 const r=await new MarketBulkRunner().run(plan('delete',[o]),{context:()=>ctx,wait:async()=>{},read:async()=>[o],validate:async()=> '库存已变化',write:async()=>{writes++;},publish:()=>{}});
 assert.equal(writes,0);assert.equal(r[0].status,'skipped');
});
test('receipt reservations block cross-window replays and cancellation while reserving sends no write',async()=>{
 const o=order();let writes=0;
 const io={context:()=>ctx,wait:async()=>{},read:async()=>[o],write:async()=>{writes++;},publish:()=>{}};
 const duplicate=await new MarketBulkRunner().run(plan('delete',[o]),{...io,reserve:async()=> '该成交已登记完成，不重复提交'});assert.equal(duplicate[0].status,'skipped');assert.equal(writes,0);
 const runner=new MarketBulkRunner(),cancelled=await runner.run(plan('delete',[o]),{...io,reserve:async()=>{runner.cancel();return null;}});assert.equal(cancelled[0].status,'cancelled');assert.equal(writes,0);
});
test('quote failures are distinguished from a valid market with no matching offers',()=>{
 const p=plan('prices',[order()],{priceErrors:new Set(['1'])});assert.match(p.items[0].reason,/读取失败/);assert.equal(p.items[0].action,null);
});

import test from 'node:test';import assert from 'node:assert/strict';
import {RivenMonitorEngine,rivenMonitorScope,parseMonitorData,type MonitorConfig} from '../src/rivenMonitorModel.ts';
import {defaultWanted,type Auction} from '../src/rivenModel.ts';
const scope=rivenMonitorScope('Player','pc')!;
const config=(id='one'):MonitorConfig=>({id,name:'目标',wanted:{...defaultWanted,maxPrice:100,required:['critical_chance']},enabled:true,intervalSeconds:60,createdAt:'2026-10-25T00:00:00Z'});
const auction=(id:string,price=50):Auction=>({id,visible:true,closed:false,starting_price:price,buyout_price:price,item:{type:'riven',weapon_url_name:'torid',name:'Visi',mod_rank:8,mastery_level:8,re_rolls:0,polarity:'madurai',attributes:[{url_name:'critical_chance',value:100,positive:true}]}});
function storage(){const data=new Map<string,string>();return {data,getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v);}};}
test('monitor establishes baseline, records only new matching listings, and deduplicates replay/price changes',async()=>{
 let now=Date.UTC(2026,9,25),rows=[auction('old')],calls=0;const store=storage();const engine=new RivenMonitorEngine(store,async()=>{calls++;return rows;},()=>{},()=>now);
 engine.setScope(scope);engine.save(config());await engine.tick();assert.equal(engine.getSnapshot().data.receipts.length,0);
 now+=60001;rows=[auction('old'),auction('new',80),auction('over',101),{...auction('wrong'),item:{...auction('wrong').item,weapon_url_name:'rubico'}}];await engine.tick();
 assert.deepEqual(engine.getSnapshot().data.receipts.map(r=>r.listingId),['new']);
 now+=60001;await engine.tick();assert.equal(engine.getSnapshot().data.receipts.length,1);
 now+=60001;rows=[auction('new',70)];await engine.tick();assert.equal(engine.getSnapshot().data.receipts.length,2);
 engine.markRead(engine.getSnapshot().data.receipts[0].id);assert.equal(engine.getSnapshot().data.receipts[0].read,true);
 const reloaded=new RivenMonitorEngine(store,async()=>rows,()=>{},()=>now+60001);reloaded.setScope(scope);await reloaded.tick();assert.equal(reloaded.getSnapshot().data.receipts.length,2);assert.equal(calls,4);
});
test('pause/delete and platform/account isolation survive restart; equal-weapon checks share a read',async()=>{
 let now=Date.UTC(2026,9,25),calls=0;const store=storage(),engine=new RivenMonitorEngine(store,async()=>{calls++;return [auction('one')];},()=>{},()=>now);
 engine.setScope(scope);engine.save(config('a'));engine.save(config('b'));await engine.tick();assert.equal(calls,1);
 engine.toggle('a');engine.remove('b');now+=60001;await engine.tick();assert.equal(calls,1);
 engine.setScope(rivenMonitorScope('Player','ps4'));assert.equal(engine.getSnapshot().data.configs.length,0);
 engine.setScope(rivenMonitorScope('Other','pc'));assert.equal(engine.getSnapshot().data.configs.length,0);
 engine.setScope(scope);assert.equal(engine.getSnapshot().data.configs.length,1);assert.equal(engine.getSnapshot().data.configs[0].enabled,false);
 assert.equal(rivenMonitorScope(null,'pc'),null);assert.equal(rivenMonitorScope('Player','bad'),null);
});
test('account switch discards an in-flight response and malformed storage stays intact',async()=>{
 let resolve!:(rows:Auction[])=>void;const store=storage(),engine=new RivenMonitorEngine(store,()=>new Promise(r=>{resolve=r;}),()=>{});
 engine.setScope(scope);engine.save(config());const tick=engine.tick();engine.setScope(rivenMonitorScope('Other','pc'));resolve([auction('late')]);await tick;
 assert.equal(engine.getSnapshot().data.receipts.length,0);assert.equal(engine.getSnapshot().data.configs.length,0);
 store.setItem('myframe.riven.monitor.v1:'+scope,'broken');engine.setScope(scope);assert.match(engine.getSnapshot().error,/SyntaxError/);assert.throws(()=>engine.save(config()));assert.equal(store.getItem('myframe.riven.monitor.v1:'+scope),'broken');
 assert.throws(()=>parseMonitorData(JSON.stringify({configs:[{...config(),intervalSeconds:1}],receipts:[],states:{}})));
});
test('errors delay retries and unknown/invalid prices never generate a hit',async()=>{
 let now=Date.UTC(2026,9,25),fail=true,calls=0;const engine=new RivenMonitorEngine(storage(),async()=>{calls++;if(fail)throw Error('429');return [auction('x'),{...auction('bad'),buyout_price:NaN}];},()=>{},()=>now);
 engine.setScope(scope);engine.save(config());await engine.tick();assert.match(engine.getSnapshot().data.states.one.error,/429/);await engine.tick();assert.equal(calls,1);
 now+=60001;fail=false;await engine.tick();assert.equal(engine.getSnapshot().data.states.one.initialised,true);assert.equal(engine.getSnapshot().data.receipts.length,0);
});
test('a failed receipt write rolls back the hit and can be retried without losing it',async()=>{
 let now=Date.UTC(2026,9,25),fail=false,rows=[auction('old')];const base=storage();
 const store={getItem:base.getItem,setItem:(key:string,value:string)=>{if(fail)throw Error('quota');base.setItem(key,value);}};
 const engine=new RivenMonitorEngine(store,async()=>rows,()=>{},()=>now);engine.setScope(scope);engine.save(config());await engine.tick();
 now+=60001;rows=[auction('new')];fail=true;await engine.tick();assert.equal(engine.getSnapshot().data.receipts.length,0);
 now+=60001;fail=false;await engine.tick();assert.equal(engine.getSnapshot().data.receipts.length,1);
});
test('external delivery is explicit, baseline is silent, failures are receipts and never automatically retried',async()=>{
 let now=Date.UTC(2026,9,25),rows=[auction('old')],delivered=0;const engine=new RivenMonitorEngine(storage(),async()=>rows,()=>{},()=>now);
 engine.setScope(scope);engine.setDelivery(async()=>{delivered++;return {deliveryError:'channel failed'};});engine.save({...config(),notifySystem:true});await engine.tick();assert.equal(delivered,0);
 now+=60001;rows=[auction('new')];await engine.tick();assert.equal(delivered,1);assert.equal(engine.getSnapshot().data.receipts[0].deliveryStatus,'failed');
 now+=60001;await engine.tick();assert.equal(delivered,1);
 engine.save({...config(),notifySystem:false});now+=60001;rows=[auction('other')];await engine.tick();assert.equal(delivered,1);assert.equal(engine.getSnapshot().data.receipts[0].deliveryStatus,'disabled');
});
test('a game-profile delivery-scope change discards an old in-flight channel request',async()=>{
 let now=Date.UTC(2026,9,25),delivered=0,rows=[auction('old')];let deferred:((rows:Auction[])=>void)|null=null;
 const engine=new RivenMonitorEngine(storage(),()=>deferred?new Promise(resolve=>{deferred=resolve;}):Promise.resolve(rows),()=>{},()=>now);
 engine.setScope(scope);engine.save({...config(),notifySystem:true});engine.setDelivery(async()=>{delivered++;return {};});await engine.tick();
 now+=60001;deferred=()=>{};const pending=engine.tick();engine.setDelivery(async()=>{delivered++;return {};});(deferred as (rows:Auction[])=>void)([auction('new')]);await pending;
 assert.equal(delivered,0);assert.equal(engine.getSnapshot().data.receipts[0].deliveryStatus,'failed');
});
test('an invalid-only source response never becomes a successful baseline',async()=>{
 let now=Date.UTC(2026,9,25),rows=[{...auction('bad'),buyout_price:NaN}];const engine=new RivenMonitorEngine(storage(),async()=>rows,()=>{},()=>now);
 engine.setScope(scope);engine.save(config());await engine.tick();assert.equal(engine.getSnapshot().data.states.one.initialised,false);
 now+=60001;rows=[auction('valid')];await engine.tick();assert.equal(engine.getSnapshot().data.states.one.initialised,true);assert.equal(engine.getSnapshot().data.receipts.length,0);
});

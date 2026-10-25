import test from 'node:test';
import assert from 'node:assert/strict';
import {active,notificationStateHint,canAutoDismissNotice,enqueueNotice,countdown,highValue,matchesFissure,upcoming,noticeForScope,worldPreviewEnabled,previewWorldStatus,emptyWorld,type WorldEvent} from '../src/worldModel.ts';
const event:WorldEvent={id:'a',kind:'fissure',nodeId:'SolNode25',node:'Callisto',planet:'Jupiter',missionType:'Interception',faction:'Corpus',tier:'Meso',steelPath:true,activation:'2026-10-23T10:00:00Z',expiry:'2026-10-23T11:00:00Z',rewards:[],rating:null,predicted:false};
test('event boundaries exclude expired and future missions from live lists',()=>{const now=Date.parse('2026-10-23T10:00:00Z');assert(active(event,now));assert(!active(event,Date.parse(event.expiry)));assert(!active(event,now-1));assert(upcoming(event,now-1));assert(!upcoming(event,Date.parse(event.expiry)));});
test('fissure rules compare all four fields and retain steel path distinction',()=>{const rule={id:'r',type:'meso',mode:'Interception',location:'Jupiter',steelPath:'steelPath'};assert(matchesFissure(event,rule));for(const patch of [{type:'axi'},{mode:'Capture'},{location:'Earth'},{steelPath:'normal'}])assert(!matchesFissure(event,{...rule,...patch}));assert(matchesFissure(event,{...rule,type:'all',mode:'all',location:'all',steelPath:'all'}));});
test('unknown ratings do not become high value and countdown never becomes negative',()=>{assert(!highValue(event));assert(!highValue({...event,rating:'B'}));assert(highValue({...event,rating:'S'}));assert(highValue({...event,rating:'A'}));assert.equal(countdown(event.expiry,Date.parse(event.expiry)+1000),'0m 00s');assert.equal(countdown('invalid'),'—');});

test('burst notifications stay ordered and duplicate delivery does not replace the current toast',()=>{
 const a={id:'a',title:'A',body:'first',createdAt:'2026-10-23T10:00:00Z',kind:'alert'};
 const b={...a,id:'b',title:'B'};
 const queue=enqueueNotice(enqueueNotice([],a),b);
 assert.deepEqual(queue.map(n=>n.id),['a','b']);
 assert.strictEqual(enqueueNotice(queue,{...a,body:'duplicate'}),queue);
 assert.equal(queue[0].body,'first');
 assert.equal(queue.slice(1)[0].id,'b');
});

test('notifications expire even behind another window; test notices need explicit dismissal',()=>{
 const n={id:'n',title:'notice',body:'body',createdAt:'2026-10-23T10:00:00Z',kind:'alert'};
 assert.equal(canAutoDismissNotice(n,true,false),true);
 assert.equal(canAutoDismissNotice(n,false,true),true);
 assert.equal(canAutoDismissNotice(n,true,true),true);
 assert.equal(canAutoDismissNotice({...n,kind:'test'},true,true),false);
});

test('suppressed system state is explained without claiming that a banner appeared',()=>{
 assert.equal(notificationStateHint('accepts-notifications'),'');
 assert.equal(notificationStateHint('unknown'),'');
 assert.match(notificationStateHint('busy'),/Windows/);
 assert.match(notificationStateHint('quiet-time',true),/suppressing/);
});

test('long world rotations use days while short missions retain seconds',()=>{
 const at=(hours:number)=>new Date(hours*3600000).toISOString();
 assert.equal(countdown(at(24),0,false),'1天 0小时');
 assert.equal(countdown(at(31),0,false),'1天 7小时');
 assert.equal(countdown(at(42),0,false),'1天 18小时');
 assert.equal(countdown(at(14*24+3),0),'14d 3h');
 assert.equal(countdown(new Date(24*3600000-1).toISOString(),0),'23h 59m');
 assert.equal(countdown(new Date(61000).toISOString(),0),'1m 01s');
});

test('world fixture is explicit and development-only on otherwise unrelated pages',()=>{assert.equal(worldPreviewEnabled(true,'?qa=shards'),false);assert.equal(worldPreviewEnabled(true,'?qa=shards&worldFixture=1'),true);assert.equal(worldPreviewEnabled(false,'?qa=world&worldFixture=1'),false);assert.equal(worldPreviewEnabled(true,'?qa=world'),true);});
test('fixture clocks rebase without modifying retained public source or making unknown fields',()=>{const source={...emptyWorld(),updatedAt:'2026-10-24T10:00:00Z',cycles:[{id:'earth',name:'Earth',state:'day',nextState:'night',expiry:'2026-10-24T10:30:00Z'}],fissures:[event]};const now=Date.parse('2026-10-25T10:00:00Z'),copy=previewWorldStatus(source,now);assert.equal(copy.cycles[0].expiry,'2026-10-25T10:30:00.000Z');assert.equal(source.cycles[0].expiry,'2026-10-24T10:30:00Z');assert.equal(copy.rewardMissions,undefined);assert.equal(copy.updatedAt,'2026-10-25T10:00:00.000Z');assert.equal(Date.parse(copy.fissures[0].expiry)-Date.parse(copy.fissures[0].activation),3600000);});

test('private conversation and riven notices are visible only in their captured account',()=>{const notice={id:'conversation:A:receipt',title:'Title',body:'Private player',kind:'conversation',createdAt:'2026-10-25T00:00:00Z'};assert.equal(noticeForScope(notice,'A'),true);assert.equal(noticeForScope(notice,'B'),false);assert.equal(noticeForScope({...notice,id:'riven-monitor:A:receipt'},'B'),false);assert.equal(noticeForScope({...notice,id:'cycle:earth:next'},'B'),true);});

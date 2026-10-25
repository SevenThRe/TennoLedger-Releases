import test from 'node:test';
import assert from 'node:assert/strict';
import {arbitrationDayGroups,arbitrationPreferences,arbitrationSummary,blankArbitrationPreferences,hasArbitrationPreferences,matchesArbitration,duviriCycle} from '../src/arbitrationModel.ts';
import {defaultSubscriptions,type WorldEvent} from '../src/worldModel.ts';
const now=Date.parse('2026-10-24T09:15:00Z');
const event=(offset:number,node='SolNode25'):WorldEvent=>({id:`arbitration:${(now+offset)/1000}:${node}`,kind:'arbitration',nodeId:node,node:'Umbriel',planet:'Uranus',missionType:'Interception',faction:'Grineer',rating:'S',tier:null,steelPath:false,activation:new Date(now+offset).toISOString(),expiry:new Date(now+offset+3600000).toISOString(),rewards:[],predicted:true});
test('current and next ignore browse filters, expired entries and input ordering',()=>{
 const p=blankArbitrationPreferences(),e=event(-900000),next=event(2700000),far=event(6*86400000);
 const s=arbitrationSummary([far,event(-7200000),next,e,event(8*86400000)],p,now);
 assert.equal(s.current?.id,e.id);assert.equal(s.next?.id,next.id);assert.equal(s.nextMatch,undefined);assert.deepEqual(s.schedule.map(x=>x.id),[e.id,next.id,far.id]);
 p.matchPreferencesConfigured=true;p.alertFilter.tiers=['S'];assert.equal(arbitrationSummary(s.schedule,p,now).nextMatch?.id,next.id);
});
test('favorites are independent from reminders and combine with AND filter groups',()=>{
 const p=blankArbitrationPreferences(),e=event(1000);p.favoriteNodeIds=[e.nodeId];
 assert.equal(hasArbitrationPreferences(p),false);assert.equal(p.reminderIds.length,0);
 p.alertFilter.favoritesOnly=true;assert.equal(matchesArbitration(e,p),true);
 p.alertFilter.missionTypes=['Survival'];assert.equal(matchesArbitration(e,p),false);
 p.alertFilter.missionTypes=['Interception'];p.alertFilter.factions=['Corpus'];assert.equal(matchesArbitration(e,p),false);
 p.alertFilter.factions=[];assert.equal(matchesArbitration({...e,rating:null},p),true);
 p.alertFilter.tiers=['Unrated'];assert.equal(matchesArbitration({...e,rating:null},p),true);assert.equal(matchesArbitration(e,p),false);
});
test('date groups use local calendar days and old subscriptions migrate without dropping node favorites',()=>{
 const midnight=new Date(2026,9,24,23,30).getTime(),base=event(0);
 const groups=arbitrationDayGroups([{...base,activation:new Date(midnight).toISOString()},{...base,id:'next',activation:new Date(midnight+3600000).toISOString()}]);
 assert.equal(groups.length,2);assert.equal(groups[1].key,'2026-10-25');
 const old=defaultSubscriptions();old.arbitrationNodes=['SolNode25'];const p=arbitrationPreferences(old);assert.deepEqual(p.favoriteNodeIds,['SolNode25']);assert.equal(hasArbitrationPreferences(p),false);
 old.arbitrationEnabled=true;old.arbitrationNodes=[];assert.deepEqual(arbitrationPreferences(old).alertFilter.tiers,['S','A']);
});
test('legacy enabled tier-or-node matching is preserved until filters are edited',()=>{
 const old=defaultSubscriptions();old.arbitrationEnabled=true;old.arbitrationNodes=['SolNodeOther'];
 const p=arbitrationPreferences(old);assert.equal(matchesArbitration(event(1000),p),true);
 assert.equal(matchesArbitration({...event(1000,'SolNodeOther'),rating:null},p),true);
 assert.equal(matchesArbitration({...event(1000),rating:null},p),false);
});
test('Duviri cycle follows the recovered UTC anchor, including pre-anchor times',()=>{
 const anchor=1735819200000;
 assert.deepEqual(duviriCycle(anchor),{state:'fear',nextState:'joy',expiry:new Date(anchor+7200000).toISOString()});
 assert.equal(duviriCycle(anchor+3*7200000).state,'envy');
 assert.equal(duviriCycle(anchor-1).state,'sorrow');assert.equal(duviriCycle(anchor-1).expiry,new Date(anchor).toISOString());
});

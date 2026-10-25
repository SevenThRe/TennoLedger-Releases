import test from 'node:test';
import assert from 'node:assert/strict';
import {assetCount,dailyRemaining,nextDailyReset,rankProgress,type SyndicateMeta} from '../src/standingModel.ts';
import {affordable,steelWeek,vendorExpired,type VendorOffer} from '../src/vendorModel.ts';
test('daily limits expire at UTC midnight and zero remains exhausted',()=>{
 const s={capturedAt:'2026-10-24T23:59:00Z',affiliations:[],dailyRemaining:{DailyAffiliation:0}};
 assert.equal(dailyRemaining(s,'DailyAffiliation',Date.parse('2026-10-24T23:59:59Z')),0);
 assert.equal(dailyRemaining(s,'DailyAffiliation',Date.parse('2026-10-25T00:00:00Z')),null);
 assert.equal(dailyRemaining(s,'DailyAffiliationHex',Date.parse(s.capturedAt)),null);
 assert.equal(nextDailyReset(Date.parse(s.capturedAt)),'2026-10-25T00:00:00.000Z');
});
test('standing subtracts rank threshold and preserves debt',()=>{
 const m={titles:[{level:5,minStanding:240000,maxStanding:372000},{level:-1,minStanding:-27000,maxStanding:-5000}]} as SyndicateMeta;
 assert.deepEqual(rankProgress(m,{tag:'a',rank:5,standing:306000}),{value:66000,max:132000,ratio:.5});
 assert.deepEqual(rankProgress(m,{tag:'a',rank:-1,standing:-16000}),{value:-11000,max:22000,ratio:.5});
 assert.equal(rankProgress(m),null);
});
test('unknown inventory never becomes zero or affordable',()=>{
 assert.equal(assetCount(null,'aya'),null);assert.equal(assetCount({counts:{},complete:false},'aya'),null);assert.equal(assetCount({counts:{},complete:true},'aya'),0);
 const o={prices:[{itemId:'key',quantity:40}]} as VendorOffer;
 assert.equal(affordable(o,null),null);assert.equal(affordable(o,{complete:false,counts:{}}),null);assert.equal(affordable(o,{complete:true,counts:{}}),false);assert.equal(affordable(o,{complete:true,counts:{key:40}}),true);
});
test('steel schedule rolls exactly on Monday and repeats after eight weeks',()=>{
 const epoch=Date.parse('2020-11-16T00:00:00Z');assert.equal(steelWeek(epoch).index,0);assert.equal(steelWeek(epoch+604800000-1).index,0);assert.equal(steelWeek(epoch+604800000).index,1);assert.equal(steelWeek(epoch+8*604800000).index,0);assert.equal(steelWeek(epoch-1).index,7);
 assert.equal(steelWeek(epoch).expiry,'2020-11-23T00:00:00.000Z');
});
test('missing and expired vendor cycles never count as current',()=>{
 const now=Date.parse('2026-10-24T00:00:00Z');assert.equal(vendorExpired(undefined,now),true);assert.equal(vendorExpired({expiry:'2026-10-24T00:00:00Z'} as any,now),true);assert.equal(vendorExpired({expiry:'2026-10-25T00:00:00Z'} as any,now),false);
});

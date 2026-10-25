import test from 'node:test';
import assert from 'node:assert/strict';
import {presenceStorageKey,readRememberedPresence,parseMarketPresence} from '../src/marketPresenceModel.ts';
test('presence preference is account/platform specific and stores only allowed status values',()=>{
 assert.notEqual(presenceStorageKey('a','pc'),presenceStorageKey('b','pc'));assert.notEqual(presenceStorageKey('a','pc'),presenceStorageKey('a','xbox'));
 assert.equal(readRememberedPresence('{"version":1,"status":"ingame"}'),'ingame');for(const raw of ['{','{"status":"online"}','{"version":1,"status":"offline"}','{"version":1,"token":"secret"}'])assert.equal(readRememberedPresence(raw),null);
});
test('presence views preserve server authority and reject another actor context',()=>{
 const v={accountId:'a',platform:'pc',connected:true,authenticated:true,ready:false,status:null,pending:false,error:null,revision:null};
 assert.equal(parseMarketPresence(v,'a','pc').ready,false);assert.throws(()=>parseMarketPresence(v,'b','pc'));assert.throws(()=>parseMarketPresence(v,'a','xbox'));assert.throws(()=>parseMarketPresence({...v,status:'guessed'},'a','pc'));
});

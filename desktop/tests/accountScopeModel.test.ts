import test from 'node:test';
import assert from 'node:assert/strict';
import {accountStorageKey,legacyScope,parseAccountProfiles,snapshotScope} from '../src/accountScopeModel.ts';
const a='acct-v1-'+'a'.repeat(64),b='acct-v1-'+'b'.repeat(64);
test('private per-account drafts never inherit legacy or another account keys',()=>{
 assert.equal(accountStorageKey('draft',legacyScope),'draft');assert.notEqual(accountStorageKey('draft',a),accountStorageKey('draft',b));assert.notEqual(accountStorageKey('draft',a),'draft');assert.throws(()=>accountStorageKey('draft','raw-account-id'));
});
test('profile selection requires one active scope and rejects duplicate or raw identities',()=>{
 const profile={accountScope:a,name:'Alpha',capturedAt:null,active:true,unassigned:false};assert.equal(parseAccountProfiles([profile])[0].accountScope,a);
 assert.throws(()=>parseAccountProfiles([profile,profile]));assert.throws(()=>parseAccountProfiles([{...profile,active:false}]));assert.throws(()=>parseAccountProfiles([{...profile,accountScope:'secret'}]));
 assert.equal(snapshotScope({accountScope:b}),b);assert.equal(snapshotScope({}),legacyScope);
});

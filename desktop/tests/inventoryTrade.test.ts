import test from 'node:test';
import assert from 'node:assert/strict';
import {inventoryTradeTarget} from '../src/inventoryTrade.ts';
test('inventory trade selection preserves both names and canonical identity',()=>{
 const target={id:'/Lotus/Part',slug:'ash_prime_neuroptics',name:'Ash Prime 头部神经光元',englishName:'Ash Prime Neuroptics Blueprint'};
 assert.deepEqual(inventoryTradeTarget({...target,ignored:'field'}),target);
});
test('missing identities and non-item slugs never dispatch a trade target',()=>{
 for(const v of [null,{}, {id:'a',slug:'https://example.com',name:'a',englishName:'a'}, {id:'a',slug:'../orders',name:'a',englishName:'a'}, {id:'a',slug:'item',name:'a'}])assert.equal(inventoryTradeTarget(v),null);
});
test('shared trade selection retains supported variants and rejects invalid bundle or star counts',()=>{
 const base={id:'a',slug:'a',name:'a',englishName:'A'},variants={charges:2,amberStars:1,cyanStars:3,perTrade:6};
 assert.deepEqual(inventoryTradeTarget({...base,...variants}),{...base,...variants});
 for(const patch of [{perTrade:0},{perTrade:7},{charges:-1},{amberStars:1.2},{cyanStars:NaN}])assert.equal(inventoryTradeTarget({...base,...patch}),null);
});

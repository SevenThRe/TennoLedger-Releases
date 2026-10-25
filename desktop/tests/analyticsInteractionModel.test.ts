import test from 'node:test';
import assert from 'node:assert/strict';
import {analyticsTradeTarget} from '../src/analyticsInteractionModel.ts';
const item={id:'/Game/Part',name:'Ash Prime Chassis',zh:'Ash Prime 机体',category:'prime'};
const row={slug:'ash_prime_chassis',gameRef:item.id,i18n:{en:{name:item.name}},unitPrice:10,volume:20,totalValue:200};
test('analytics actions use verified market identity and translated display names',()=>{
 assert.deepEqual(analyticsTradeTarget(item,[row],true),{id:item.id,slug:row.slug,name:item.zh,englishName:item.name});
 assert.equal(analyticsTradeTarget(item,[row],false)?.name,item.name);
 assert.equal(analyticsTradeTarget({...item,id:'market:ash_prime_set',marketSlug:'ash_prime_set'},null,true)?.slug,'ash_prime_set');
 assert.equal(analyticsTradeTarget({...item,id:'other'},[row],true)?.slug,row.slug);
});
test('unknown, ambiguous or malformed market identities never produce guessed quote URLs',()=>{
 assert.equal(analyticsTradeTarget(item,null,true),null);
 assert.equal(analyticsTradeTarget(item,[row,{...row,slug:'other',i18n:{en:{name:'Other'}}}],true),null);
 assert.equal(analyticsTradeTarget({...item,marketSlug:'../account'},[row],true),null);
 assert.equal(analyticsTradeTarget({...item,id:'market:'},null,true),null);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {matchingConfirmedTrades} from '../src/tradeCandidateDedup.ts';
import type {GameTradeFinished} from '../src/tradeFinishModel.ts';
const row={id:'quote',name:'Item',partner:'Tenno',quantity:2,platinum:30,capturedAt:'2026-10-25T00:00:00Z'};
const event:GameTradeFinished={id:'real',accountScope:'a',capturedAt:'2026-10-25T00:01:00Z',partner:'TENNO',kind:'sale',complete:true,platinum:30,sent:[{itemId:'item',quantity:2}],received:[{itemId:'/AF_Special/Platinum',quantity:30}]};
test('only a definite completed game receipt blocks duplicate manual booking',()=>{
 assert.deepEqual(matchingConfirmedTrades(row,'sale','item',[event]),['real']);
 assert.deepEqual(matchingConfirmedTrades(row,'sale','item',[]),[]);assert.deepEqual(matchingConfirmedTrades(row,'sale','item',[{...event,complete:false}]),[]);
});
test('direction, partner, item identity, amount and actual total must all match',()=>{
 for(const changed of [{...event,kind:'purchase' as const},{...event,partner:'Other'},{...event,sent:[{itemId:'different',quantity:2}]},{...event,sent:[{itemId:'item',quantity:1}]},{...event,received:[{itemId:'/AF_Special/Platinum',quantity:20}]}])assert.deepEqual(matchingConfirmedTrades(row,'sale','item',[changed]),[]);
 assert.deepEqual(matchingConfirmedTrades({...row,partner:''},'sale','item',[event]),[]);assert.deepEqual(matchingConfirmedTrades(row,'sale',null,[event]),[]);
});
test('quotes after the trade and trades beyond the reference fifteen-minute window do not match',()=>{
 assert.deepEqual(matchingConfirmedTrades(row,'sale','item',[{...event,capturedAt:'2026-10-24T23:59:59Z'}]),[]);
 assert.deepEqual(matchingConfirmedTrades(row,'sale','item',[{...event,capturedAt:'2026-10-25T00:15:01Z'}]),[]);
});
test('multiple exact receipts are returned for review without guessing one or marking the quote done',()=>{
 assert.deepEqual(matchingConfirmedTrades(row,'sale','item',[event,{...event,id:'second'}]),['real','second']);assert.equal(row.id,'quote');
});

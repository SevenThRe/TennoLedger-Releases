import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCompletionStatus,completionReceiptState} from '../src/tradeCompletionReceipt.ts';
test('receipt queries distinguish absent, inflight, acknowledged and uncertain outcomes',()=>{
 for(const status of [null,'inflight','accepted','uncertain'])assert.equal(parseCompletionStatus(status),status);assert.throws(()=>parseCompletionStatus('guessed-success'));
 assert.equal(completionReceiptState([null]),'none');assert.equal(completionReceiptState(['accepted']),'partial');assert.equal(completionReceiptState(['accepted','inflight']),'review');assert.equal(completionReceiptState(['uncertain']),'review');
});
test('accepted order receipts alone do not claim the entire multi-item game transaction completed',()=>{assert.notEqual(completionReceiptState(['accepted','accepted']),'done');assert.equal(completionReceiptState(['accepted',null]),'partial');});

import test from 'node:test';
import assert from 'node:assert/strict';
import {tradeCandidateRecord} from '../src/tradeCandidateRecord.ts';
import {tradePartners} from '../src/tradePartnerModel.ts';
const row={id:'a',name:'安培克斯',platinum:20,quantity:3,capturedAt:'2026-10-24T00:00:00Z'};
test('confirmed partner survives record serialization and reaches partner analytics',()=>{
 const record=tradeCandidateRecord({...row,partner:' Player-One '},'sale','amprex');
 assert.equal(record.partner,'Player-One');assert.equal(record.id,'ocr:a');assert.equal(record.itemId,'amprex');
 const [partner]=tradePartners([record],'saleValue');assert.equal(partner.name,'Player-One');assert.equal(partner.saleCount,1);assert.equal(partner.saleValue,20);
});
test('older candidates without a partner stay valid without inventing an identity',()=>{
 const record=tradeCandidateRecord(row,'purchase',null);assert.equal(record.partner,'');assert.equal(record.itemId,'unresolved:安培克斯');assert.equal(record.side,'purchase');
 assert.deepEqual(tradePartners([record],'totalCount'),[]);
});

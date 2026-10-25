import test from 'node:test';
import assert from 'node:assert/strict';
import {saleValuation} from '../src/saleValuation.ts';
test('valuation multiplies selected quantities rather than original stock',()=>{
 assert.equal(saleValuation([{quantity:5,price:9},{quantity:3,price:2}]).total,51);
 assert.equal(saleValuation([{quantity:2,price:9},{quantity:0,price:null}]).total,18);
});
test('missing quotes, invalid quantities and overflow never become zero value',()=>{
 assert.deepEqual(saleValuation([{quantity:1,price:null}]),{total:null,unknown:1});
 assert.equal(saleValuation([{quantity:null,price:5}]).total,null);
 assert.equal(saleValuation([{quantity:1,price:0}]).total,null);
 assert.equal(saleValuation([{quantity:Number.MAX_SAFE_INTEGER,price:2}]).total,null);
 assert.equal(saleValuation([]).total,0);
});

test('explicit zero ducat values remain known without accepting missing metadata',()=>{
 assert.equal(saleValuation([{quantity:3,price:0},{quantity:2,price:45}],true).total,90);
 assert.equal(saleValuation([{quantity:1,price:undefined}],true).total,null);
});

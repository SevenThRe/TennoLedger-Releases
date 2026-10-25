import test from 'node:test';
import assert from 'node:assert/strict';
import {saleAccountResponse} from '../src/saleAccountResponse.ts';
test('account arrays and grouped sell/buy responses preserve hidden orders',()=>{
 const order={id:'one',type:'sell',quantity:2,visible:false};
 assert.deepEqual(saleAccountResponse([{id:'part'}],{sell:[order],buy:[]}).orders,[order]);
 assert.deepEqual(saleAccountResponse([],[]).orders,[]);
});
test('missing order type or sections cannot become an empty known account',()=>{
 for(const value of [null,{}, {sell:[]},[{id:'x',quantity:1}],[{id:'x',type:'sell',quantity:-1}]])assert.throws(()=>saleAccountResponse([],value));
 assert.throws(()=>saleAccountResponse([{}],[]));
});

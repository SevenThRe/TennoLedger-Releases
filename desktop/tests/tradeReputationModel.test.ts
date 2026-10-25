import test from 'node:test';
import assert from 'node:assert/strict';
import {reputationRequest} from '../src/tradeReputationModel.ts';
test('reputation partner normalization is bounded and cannot escape the profile path',()=>{
 assert.deepEqual(reputationRequest(' Tenno.Name ','Thanks'),{key:'tenno.name',body:{review_type:1,text:'Thanks'},receiptOrderId:'review:tenno.name'});
 for(const partner of ['','..','../me','user/name','x?admin=true','a\nb','a'.repeat(65)])assert.throws(()=>reputationRequest(partner,''));
});
test('feedback text is literal, optional and bounded; only positive reviews are constructed',()=>{
 assert.equal(reputationRequest('tenno','').body.review_type,1);assert.equal(reputationRequest('tenno','谢谢！').body.text,'谢谢！');
 assert.throws(()=>reputationRequest('tenno','x'.repeat(501)));assert.throws(()=>reputationRequest('tenno','x\0y'));
});

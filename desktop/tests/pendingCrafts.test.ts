import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pendingCrafts} from '../src/pendingCrafts.ts';
const recipe={output:3,parts:[{itemId:'bp',quantity:1,reusable:false}]};
test('queue resolves batch outputs and reserves consumed blueprints',()=>{
 const result=pendingCrafts({item:recipe},new Set(['bp']),{bp:2},{bp:3});
 assert.deepEqual(result.outputs,{item:6});assert.equal(result.stock.bp,1);assert.equal(result.known,true);
});
test('reusable blueprint remains available',()=>{
 const result=pendingCrafts({item:{...recipe,parts:[{itemId:'bp',quantity:1,reusable:true}]}},new Set(['bp']),{bp:1},{bp:1});
 assert.equal(result.stock.bp,1);
});
test('unknown queues and ambiguous blueprint mappings cannot become empty known queues',()=>{
 assert.equal(pendingCrafts({},new Set(),null,{}).known,false);
 assert.equal(pendingCrafts({},new Set(),{},{}).known,true);
 assert.equal(pendingCrafts({a:recipe,b:recipe},new Set(['bp']),{bp:1},{}).known,false);
 assert.equal(pendingCrafts({},new Set(),{missing:1},{}).known,false);
});

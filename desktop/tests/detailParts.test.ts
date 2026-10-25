import test from 'node:test';
import assert from 'node:assert/strict';
import {detailPartRows} from '../src/detailParts.ts';

test('detail duplicate slots have distinct keys and consume each available item once',()=>{
 const parts=[{itemId:'weapon',quantity:1},{itemId:'weapon',quantity:1},{itemId:'link',quantity:1}];
 const counts={weapon:1,link:1},rows=detailPartRows(parts,counts,true);
 assert.deepEqual(rows.map(row=>row.available),[1,0,1]);
 assert.deepEqual(rows.map(row=>row.sufficient),[true,false,true]);
 assert.equal(new Set(rows.map(row=>row.key)).size,3);
 assert.equal(counts.weapon,1);assert.equal(parts.length,3);
 assert.deepEqual(detailPartRows(parts,{weapon:2,link:1},true).map(row=>row.sufficient),[true,true,true]);
});

test('unknown inventory and unknown requirements do not become satisfied',()=>{
 const parts=[{itemId:'a',quantity:2},{itemId:'a',quantity:1},{itemId:'b',quantity:0}];
 assert.deepEqual(detailPartRows(parts,{},false).map(row=>row.available),[null,null,null]);
 assert.deepEqual(detailPartRows(parts,{a:1,b:5},true).map(row=>row.sufficient),[false,false,false]);
});

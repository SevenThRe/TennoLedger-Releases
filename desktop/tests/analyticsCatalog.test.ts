import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAnalyticsCatalog} from '../src/analyticsCatalog.ts';
test('classification requires a nonempty complete catalog instead of silently treating missing mods as other',()=>{
 for(const value of [null,{},[],{items:[]},{items:[null]},{items:[{id:'a',name:'Serration'}]},{items:[{id:'a',name:'',category:'mod'}]},{items:[{id:'a',name:'Serration',category:'mod',image:{}}]}])assert.throws(()=>parseAnalyticsCatalog(value));
});
test('catalog keeps canonical classification and optional localized artwork fields',()=>{
 const items=[{id:'a',name:'Serration',category:'mod',zh:'膛线',image:'/mod.png'},{id:'b',name:'Unknown category',category:'future'}];
 assert.deepEqual(parseAnalyticsCatalog({items}),items);
});

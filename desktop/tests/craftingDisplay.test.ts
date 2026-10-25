import {test} from 'node:test';
import assert from 'node:assert/strict';
import {craftingDisplayTree,type TreeNode} from '../src/craftingDisplay.ts';
const owned:TreeNode={itemId:'assembly',needed:5,owned:5,allocated:5,missing:0,status:'owned',children:[]};
test('owned recipe expansion respects batch output, reusable blueprints and repeated parts',()=>{
 const items=new Map([['assembly',{recipe:{output:2,parts:[{itemId:'blueprint',quantity:1,reusable:true},{itemId:'blueprint',quantity:1,reusable:true},{itemId:'ore',quantity:3},{itemId:'ore',quantity:2}]}}]]);
 const before=JSON.stringify(owned),display=craftingDisplayTree(owned,items,false);
 assert.deepEqual(display.children.map(c=>[c.itemId,c.needed]),[['blueprint',1],['ore',15]]);
 assert.ok(display.children.every(c=>c.status==='covered'&&c.owned===null&&c.allocated===null&&c.missing===null));
 assert.equal(JSON.stringify(owned),before);
 assert.equal(craftingDisplayTree(owned,items,true),owned);
});
test('covered nested assemblies expand without replacing actual stock allocations',()=>{
 const items=new Map([['assembly',{recipe:{output:1,parts:[{itemId:'part',quantity:2}]}}],['part',{recipe:{output:5,parts:[{itemId:'ore',quantity:3}]}}]]);
 const root={...owned,itemId:'root',status:'craft',children:[{...owned,needed:2,owned:2,allocated:2}]};
 const display=craftingDisplayTree(root,items,false);
 assert.equal(display.children[0].allocated,2);
 assert.equal(display.children[0].children[0].needed,4);
 assert.equal(display.children[0].children[0].children[0].needed,3);
});
test('cyclic and invalid display recipes terminate without fabricated quantities',()=>{
 const items=new Map([['assembly',{recipe:{output:1,parts:[{itemId:'assembly',quantity:1}]}}]]);
 assert.equal(craftingDisplayTree(owned,items,false).children[0].children.length,0);
 for(const quantity of [Infinity,Number.MAX_SAFE_INTEGER,-1]){
  assert.equal(craftingDisplayTree(owned,new Map([['assembly',{recipe:{output:1,parts:[{itemId:'ore',quantity}]}}]]),false),owned);
 }
});

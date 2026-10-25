import {test} from 'node:test';
import assert from 'node:assert/strict';
import {itemName,craftingNames} from '../src/itemNames.ts';

test('blueprint owners already carrying the suffix do not duplicate it',()=>{
 const items=new Map([
  ['forma',{id:'forma',name:'Forma Blueprint',zh:'Forma 蓝图',recipe:{parts:[{itemId:'bp'}]}}],
  ['bp',{id:'bp',name:'Blueprint',zh:''}],
 ]);
 assert.equal(craftingNames(items,true)('bp'),'Forma Blueprint');
 assert.equal(craftingNames(items)('bp'),'Forma 蓝图');
});
test('component labels share Chinese fallback without overriding full catalog translations',()=>{
 assert.equal(itemName({name:'Blueprint',zh:''}),'蓝图');
 assert.equal(itemName({name:'Systems',zh:'�'}),'系统');
 assert.equal(itemName({name:'Blade',zh:'战刃 Prime 刀刃'}),'战刃 Prime 刀刃');
 assert.equal(itemName({name:'Blueprint',zh:'蓝图'},true),'Blueprint');
});
test('nested recipes qualify generic parts by their own weapon instead of the tree root',()=>{
 const items=new Map([
  ['root',{id:'root',name:'Combined',zh:'组合武器',recipe:{parts:[{itemId:'child'},{itemId:'root-bp'}]}}],
  ['child',{id:'child',name:'Child',zh:'子武器',recipe:{parts:[{itemId:'child-bp'}]}}],
  ['root-bp',{id:'root-bp',name:'Blueprint',zh:''}],
  ['child-bp',{id:'child-bp',name:'Blueprint',zh:''}],
 ]);
 const name=craftingNames(items);
 assert.equal(name('root-bp'),'组合武器 蓝图');
 assert.equal(name('child-bp'),'子武器 蓝图');
 assert.equal(craftingNames(items,true)('child-bp'),'Child Blueprint');
});
test('shared parts never acquire a guessed owner name',()=>{
 const items=new Map([
  ['a',{id:'a',name:'A',recipe:{parts:[{itemId:'part'}]}}],
  ['b',{id:'b',name:'B',recipe:{parts:[{itemId:'part'}]}}],
  ['part',{id:'part',name:'Link'}],
 ]);
 assert.equal(craftingNames(items)('part'),'连接器');
});

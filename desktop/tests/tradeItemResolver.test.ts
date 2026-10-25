import test from 'node:test';
import assert from 'node:assert/strict';
import {tradeItemResolver} from '../src/tradeItemResolver.ts';
const catalog=[{id:'normal',name:'Amprex',zh:'安培克斯'}, {id:'prime',name:'Soma Prime',zh:'月神 Prime'},
 {id:'base',name:'Soma',zh:'月神'}];

test('confirmed Chinese and English trade names resolve to the same catalog ID',()=>{
 const resolve=tradeItemResolver(catalog);
 for(const name of ['安培克斯','Amprex',' amprex ','[安培克斯]','Ａｍｐｒｅｘ'])assert.equal(resolve(name),'normal');
 assert.equal(resolve('月神 Prime'),'prime');assert.equal(resolve('Soma  Prime'),'prime');assert.equal(resolve('Soma'),'base');
});

test('unknown, partial, set and riven names are not guessed as base equipment',()=>{
 const resolve=tradeItemResolver(catalog);
 for(const name of ['Amp','Amprex Acriada','Soma Prime Set','Unknown','', '[Amprex] text'])assert.equal(resolve(name),null);
});

test('ambiguous translations remain unresolved while duplicate same-ID aliases are safe',()=>{
 const resolve=tradeItemResolver([...catalog,catalog[0],{id:'other',name:'Other',zh:'安培克斯'}]);
 assert.equal(resolve('安培克斯'),null);assert.equal(resolve('Amprex'),'normal');assert.equal(resolve('Other'),'other');
});

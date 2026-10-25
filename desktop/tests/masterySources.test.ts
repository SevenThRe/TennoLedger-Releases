import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseMasterySources} from '../src/masterySources.ts';
test('bundled mastery source data satisfies runtime loading contract',()=>{
 const data=parseMasterySources(JSON.parse(readFileSync(new URL('../public/mastery-sources.json',import.meta.url),'utf8')));
 assert.ok(Object.keys(data.items).length>100);
});
test('malformed sources fail before recommendation rendering',()=>{
 const part={itemId:'part',quantity:1,drops:[{relicId:'relic',chance:.1}]};
 for(const value of [null,[],{items:{},marketSlugs:[]},{items:{a:{}},marketSlugs:{}},
  ...[{quantity:0},{drops:null},{drops:[{relicId:'r',chance:10}]}].map(change=>({items:{a:{parts:[{...part,...change}]}},marketSlugs:{}}))])assert.throws(()=>parseMasterySources(value));
 const valid={items:{a:{parts:[part]}},marketSlugs:{part:'part'}};
 assert.equal(parseMasterySources(valid),valid);
});

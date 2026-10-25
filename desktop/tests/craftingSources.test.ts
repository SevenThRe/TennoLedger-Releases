import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadCraftingSources} from '../src/craftingSources.ts';
const data:Record<string,unknown>={
 '/item-details.json':{items:{ore:{drops:[{location:'Earth',chance:10}]}}},
 '/relic-catalog.json':{items:[]},
 '/mastery-sources.json':{items:{},marketSlugs:{}},
};
test('a failed relic source does not discard valid direct material drops',async()=>{
 const result=await loadCraftingSources(async url=>{if(url==='/relic-catalog.json')throw Error('offline');return data[url];});
 assert.deepEqual(result.failed,['relics']);
 assert.deepEqual(result.details?.ore.drops,[{location:'Earth',chance:10}]);
 assert.equal(result.relics,null);
 assert.deepEqual(result.sources,{items:{},marketSlugs:{}});
});
test('source failures remain distinct and a later retry recovers',async()=>{
 const failed=await loadCraftingSources(async()=>{throw Error('offline');});
 assert.deepEqual(failed.failed,['details','relics','sources']);
 assert.equal(failed.details,null);assert.equal(failed.relics,null);assert.equal(failed.sources,null);
 const recovered=await loadCraftingSources(async url=>data[url]);
 assert.deepEqual(recovered.failed,[]);
 assert.deepEqual(recovered.relics,[]);
});
test('invalid dataset containers are errors instead of successful empty results',async()=>{
 const result=await loadCraftingSources(async url=>url==='/relic-catalog.json'?{items:{}}:{items:null});
 assert.deepEqual(result.failed,['details','relics','sources']);
});

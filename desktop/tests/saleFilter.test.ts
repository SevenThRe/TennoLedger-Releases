import test from 'node:test';
import assert from 'node:assert/strict';
import {matchesSaleFilter} from '../src/saleFilter.ts';
test('safe-list filtering excludes unknown, exhausted, invalid and missing rows',()=>{
 const rows=new Map([['spare',{safeToList:2}],['used',{safeToList:0}],['unknown',{safeToList:null}],['bad',{safeToList:NaN}]]);
 assert.equal(matchesSaleFilter('spare',true,rows),true);
 for(const id of ['used','unknown','bad','missing'])assert.equal(matchesSaleFilter(id,true,rows),false);
 assert.equal(matchesSaleFilter('unknown',false,rows),true);
});

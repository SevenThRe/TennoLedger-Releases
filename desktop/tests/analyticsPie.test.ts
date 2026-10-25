import test from 'node:test';
import assert from 'node:assert/strict';
import {analyticsPieData} from '../src/analyticsPie.ts';

test('partial market quotes and translated labels retain category color identity',()=>{
 const rows=['set','arcane','riven','mod','prime','other','relic'].map(type=>({type,name:type,value:10}));
 const full=analyticsPieData(rows);
 assert.deepEqual(full.map(row=>row.name),['arcane','mod','other','prime','relic','riven','set']);
 const partial=analyticsPieData([{type:'set',name:'套装',value:30},{type:'mod',name:'模组',value:20}]);
 assert.equal(partial[0].itemStyle.color,full.find(row=>row.name==='mod')!.itemStyle.color);
 assert.equal(partial[1].itemStyle.color,full.find(row=>row.name==='set')!.itemStyle.color);
 assert.equal(rows[0].type,'set');
});

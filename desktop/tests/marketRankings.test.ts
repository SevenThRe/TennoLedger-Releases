import test from 'node:test';
import assert from 'node:assert/strict';
import {marketRankings,marketCategories,type MarketRankingRow} from '../src/marketRankingModel.ts';
const row=(slug:string,unitPrice:number|null,volume:number|null,totalValue:number|null):MarketRankingRow=>({slug,i18n:{},unitPrice,volume,totalValue});
test('market rankings exclude unknown values only for the selected measure',()=>{
 const rows=[row('unknown',null,null,null),row('a',10,null,null),row('b',2,100,200),row('zero',0,0,0)];
 assert.deepEqual(marketRankings(rows,'unitPrice').map(r=>r.slug),['a','b','zero']);
 assert.deepEqual(marketRankings(rows,'totalValue').map(r=>r.slug),['b','zero']);
 assert.equal(rows[0].slug,'unknown');
});
test('market rankings sort before taking fifty and reject invalid numeric fields',()=>{
 const rows=Array.from({length:60},(_,i)=>row(String(i),i,i,i));rows.push(row('invalid',NaN,-1,Infinity));
 for(const key of ['unitPrice','volume','totalValue'] as const){const sorted=marketRankings(rows,key);assert.equal(sorted.length,50);assert.equal(sorted[0].slug,'59');assert.equal(sorted.at(-1)!.slug,'10');}
});
test('market category pie sums the full market including items outside the top fifty',()=>{
 const rows=Array.from({length:60},(_,i)=>({...row(String(i),1,2,2),i18n:{en:{name:'Serration'}}}));
 rows.push({...row('prime',100,2,200),i18n:{en:{name:'Ash Prime Set'}}});
 assert.deepEqual(marketCategories(rows,'totalValue',new Set(['Serration'])),[{type:'mod',value:120},{type:'set',value:200}]);
 assert.deepEqual(marketCategories(rows,'volume',new Set(['Serration'])),[{type:'mod',value:120},{type:'set',value:2}]);
});

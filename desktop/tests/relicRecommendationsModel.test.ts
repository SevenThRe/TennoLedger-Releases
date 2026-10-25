import test from 'node:test';
import assert from 'node:assert/strict';
import {recommendationRows,mergeRecommendationQuotes,voidTraceId} from '../src/relicRecommendationsModel.ts';
import type {RecommendationRow} from '../src/relicRecommendationsModel.ts';
const row=(n:number):RecommendationRow=>({relic:{id:String(n),name:'Lith '+n,base:'Lith '+n,era:'Lith',refinement:'Intact',vaulted:false,rewards:[]},amount:n,platinum:n,ducats:n*15,favorite:n%2===0});
const filters={era:'Lith',refinement:'',vault:'all',favorites:false,sort:'platinum',descending:true};
test('owned filtering and all controls are applied before reference 32-entry cap',()=>{
 const rows=Array.from({length:40},(_,i)=>row(i));rows.push({...row(100),amount:null});
 const result=recommendationRows(rows,filters);assert.equal(result.length,32);assert.equal(result[0].relic.id,'39');assert.equal(result.at(-1)?.relic.id,'8');
 assert.equal(recommendationRows(rows,{...filters,favorites:true}).every(r=>r.favorite),true);
 assert.equal(recommendationRows(rows,{...filters,vault:'yes'}).length,0);
 assert.equal(recommendationRows(rows,{...filters,refinement:'Radiant'}).length,0);
 assert.equal(recommendationRows(rows,{...filters,era:'Neo'}).length,0);
});
test('unknown yield always stays last in either direction and actual zero remains known',()=>{
 const unknown={...row(2),platinum:null},zero={...row(3),platinum:0};
 assert.deepEqual(recommendationRows([unknown,row(1),zero],filters).map(r=>r.platinum),[1,0,null]);
 assert.deepEqual(recommendationRows([unknown,row(1),zero],{...filters,descending:false}).map(r=>r.platinum),[0,1,null]);
});
test('quote failures preserve cache, missing data stays null and known zero is not discarded',()=>{
 assert.deepEqual(mergeRecommendationQuotes({a:12,b:null},{a:null,b:0,c:null}),{a:12,b:0,c:null});
 assert.equal(voidTraceId,'/Lotus/Types/Items/MiscItems/VoidTearDrop');
});

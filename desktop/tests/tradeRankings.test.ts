import test from 'node:test';
import assert from 'node:assert/strict';
import {tradeRankings} from '../src/tradeRankingModel.ts';
const trade=(itemId:string,quantity:number,platinum:number,side:'sale'|'purchase'='sale')=>({id:itemId,ts:'2026-10-24T00:00:00Z',itemId,name:itemId,quantity,platinum,side,partner:'',category:''});
test('rankings separate sides, sum quantity and total platinum without multiplying the total',()=>{
 const trades=[trade('a',2,10),trade('a',3,15),trade('b',9,20),trade('a',8,100,'purchase')];
 assert.deepEqual(tradeRankings(trades,'sale','value'),[{id:'a',name:'a',volume:5,totalValue:25,unitPrice:5},{id:'b',name:'b',volume:9,totalValue:20,unitPrice:2}]);
 assert.equal(tradeRankings(trades,'sale','volume')[0].id,'b');
 assert.deepEqual(tradeRankings(trades,'purchase','value'),[{id:'a',name:'a',volume:8,totalValue:100,unitPrice:12}]);
});
test('rankings sort before taking 35 and retain first-seen order on ties',()=>{
 const trades=Array.from({length:40},(_,i)=>trade(String(i),1,i));
 const rows=tradeRankings(trades,'sale','value');assert.equal(rows.length,35);assert.equal(rows[0].id,'39');assert.equal(rows.at(-1)!.id,'5');
 assert.deepEqual(tradeRankings([trade('z',1,0),trade('a',1,0)],'sale','value').map(r=>r.id),['z','a']);
});

test('reference average gives each transaction equal weight and truncates only after averaging',()=>{
 const rows=tradeRankings([trade('a',1,10),trade('a',10,20),trade('b',2,15),trade('b',2,13)],'sale','unitPrice');
 assert.deepEqual(rows.map(r=>[r.id,r.unitPrice]),[['b',7],['a',6]]);
 assert.equal(tradeRankings([trade('c',2,3),trade('c',2,5)],'sale','unitPrice')[0].unitPrice,2);
 assert.equal(tradeRankings([trade('free',3,0)],'sale','unitPrice')[0].unitPrice,0);
});

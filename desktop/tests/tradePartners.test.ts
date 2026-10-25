import test from 'node:test';
import assert from 'node:assert/strict';
import {tradePartners,type PartnerOrder} from '../src/tradePartnerModel.ts';
const trade=(partner:string,side:'sale'|'purchase',platinum:number,quantity=1)=>({id:'test',ts:'2026-10-24T00:00:00Z',itemId:'item',name:'item',side,platinum,quantity,partner,category:''});
test('partner totals count transactions rather than stack quantities and sum both sides',()=>{
 assert.deepEqual(tradePartners([trade('Alice','sale',20,9),trade('Alice','purchase',7,3),trade('Alice','sale',0)],'saleValue'),[{name:'Alice',saleCount:2,saleValue:20,purchaseCount:1,purchaseValue:7,totalCount:3,totalValue:27}]);
});
test('missing partners are omitted without truncating actual names or merging different names',()=>{
 const rows=tradePartners([trade('','sale',1000),trade('  ','sale',1000),trade(' A ','sale',10),trade('AB','sale',20)],'saleValue');
 assert.deepEqual(rows.map(r=>r.name),['AB','A']);
});
test('all six sorting choices descend before taking the first fifty with stable ties',()=>{
 const trades=Array.from({length:55},(_,i)=>trade(String(i),'sale',i));
 const rows=tradePartners(trades,'saleValue');assert.equal(rows.length,50);assert.equal(rows[0].name,'54');assert.equal(rows.at(-1)!.name,'5');
 const mixed=[trade('a','sale',1),trade('b','purchase',20),trade('b','purchase',10)];
 for(const order of ['saleCount','saleValue','purchaseCount','purchaseValue','totalCount','totalValue'] as PartnerOrder[]){const result=tradePartners(mixed,order);assert.ok(result[0][order]>=result[1][order]);}
 assert.deepEqual(tradePartners([trade('z','sale',1),trade('a','sale',1)],'saleValue').map(r=>r.name),['z','a']);
});

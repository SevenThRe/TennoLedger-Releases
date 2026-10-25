import test from 'node:test';
import assert from 'node:assert/strict';
import {applyListingReservations,type SaleOrder} from '../src/saleListings.ts';
const stock=[{id:'A',owned:5,safeToSell:3}];
const order=(id:string,quantity=1,type='sell',visible=true)=>({id,quantity,type,visible});
test('craft reserve plus existing listing leaves only genuinely unlisted stock',()=>{
 assert.deepEqual(applyListingReservations(stock,[order('one')],()=>new Map([['A',1]])),[{id:'A',owned:5,safeToSell:3,listedForSale:1,safeToList:2,ordersPlaced:true}]);
 assert.equal(stock[0].safeToSell,3);
});
test('sets multiply parts; IDs deduplicate; hidden sell orders still consume stock',()=>{
 const orders=[order('set',2,'sell',false),order('set',100),order('single'),order('buy',100,'buy')];
 const rows=applyListingReservations([{id:'A',owned:10,safeToSell:8},{id:'B',owned:5,safeToSell:4}],orders,o=>new Map(o.id==='set'?[['A',2],['B',1]]:[['A',1]]));
 assert.deepEqual(rows.map(r=>[r.listedForSale,r.safeToList]),[[5,3],[2,2]]);
});
test('unavailable orders and any unresolved sell order invalidate the complete reservation result',()=>{
 const missing=applyListingReservations(stock,null,()=>new Map());assert.equal(missing[0].listedForSale,null);
 const unresolved=applyListingReservations(stock,[order('ok'),order('bad')],o=>o.id==='bad'?null:new Map([['A',1]]));assert.equal(unresolved[0].safeToList,null);
 assert.equal(applyListingReservations(stock,[order('')],()=>new Map())[0].listedForSale,null);
 assert.equal(applyListingReservations(stock,[order('x')],()=>{throw Error('offline');})[0].listedForSale,null);
 assert.equal(applyListingReservations(stock,[],()=>null)[0].safeToList,3);
});
test('same-ID rows allocate in safe-stock order and retain excess orders on the last row',()=>{
 const rows=applyListingReservations([{id:'A',owned:2,safeToSell:1},{id:'A',owned:5,safeToSell:4},{id:'A',owned:1,safeToSell:null}],[order('one',8)],()=>new Map([['A',1]]));
 assert.deepEqual(rows.map(r=>[r.listedForSale,r.safeToList]),[[1,0],[4,0],[3,null]]);
});
test('invalid quantities never become optimistic availability; products saturate without precision loss',()=>{
 for(const quantity of [NaN,Infinity,1.5,2147483648])assert.equal(applyListingReservations(stock,[order('x',quantity)],()=>new Map([['A',1]]))[0].listedForSale,null);
 assert.equal(applyListingReservations(stock,[order('x')],()=>new Map([['A',0]]))[0].listedForSale,null);
 const huge=applyListingReservations(stock,[order('x',2147483647)],()=>new Map([['A',2147483647]]));assert.equal(huge[0].listedForSale,2147483647);assert.equal(huge[0].safeToList,0);
 assert.equal(applyListingReservations([{id:'A',owned:2,safeToSell:4}],[] as SaleOrder[],()=>new Map())[0].safeToList,null);
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resurgenceOffers,type ResurgenceTrader} from '../src/resurgenceModel.ts';
test('Prime inventory keeps all rotation and evergreen goods beyond six equipment entries',()=>{
 const equipment=Array.from({length:6},(_,i)=>({ItemType:`/StoreItems/frame${i}`}));
 const trader={Manifest:[...equipment,{ItemType:'/StoreItems/relic',RegularPrice:1},{ItemType:'/StoreItems/cosmetic',PrimePrice:2},{ItemType:'/StoreItems/unknown',PrimePrice:3}],EvergreenManifest:[{ItemType:'/StoreItems/permanent',PrimePrice:4},{ItemType:'/StoreItems/frame0',RegularPrice:5}]} as ResurgenceTrader;
 const rows=resurgenceOffers(trader);
 assert.equal(rows.length,11);
 assert.deepEqual(rows.slice(6).map(row=>row.id),['/relic','/cosmetic','/unknown','/permanent','/frame0']);
 assert.deepEqual(rows.slice(6).map(row=>row.PrimePrice??row.RegularPrice),[1,2,3,4,5]);
 assert.equal(new Set(rows.map(row=>row.key)).size,11);
 assert.equal(trader.Manifest?.length,9);
});

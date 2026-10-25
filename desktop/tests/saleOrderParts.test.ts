import test from 'node:test';
import assert from 'node:assert/strict';
import {saleOrderParts,type SaleMarketItem} from '../src/saleOrderParts.ts';
import {applyListingReservations} from '../src/saleListings.ts';
const market:SaleMarketItem[]=[{id:'part',gameRef:'grip',slug:'weapon_prime_grip'},{id:'set',slug:'weapon_prime_set',tags:['set']},{id:'mod',gameRef:'mod',slug:'mod'}];
const parts=[{id:'grip',slug:'weapon_prime_grip'},{id:'BladeBlueprint',slug:'weapon_prime_blade_blueprint'}];
const sets=[{id:'weapon',slug:'weapon_prime_set',parts:[{itemId:'grip',quantity:2},{itemId:'BladeComponent',quantity:1}]}];
test('mixed set and loose orders consume their actual component quantities',()=>{
 const resolve=saleOrderParts(parts,market,sets);
 const rows=applyListingReservations([{id:'grip',owned:10,safeToSell:8},{id:'BladeBlueprint',owned:4,safeToSell:4}],[{id:'s',itemId:'set',type:'sell',quantity:2,visible:false},{id:'p',itemId:'part',type:'sell',quantity:1}],resolve);
 assert.equal(rows[0].listedForSale,5);assert.equal(rows[0].safeToList,3);assert.equal(rows[1].listedForSale,2);
});
test('ID wins over slug, blueprint suffix fallback is exact and ambiguous identities stay unknown',()=>{
 const order={id:'o',type:'sell',quantity:1,itemId:'p'};
 const m=[{id:'p',gameRef:'grip',slug:'weapon_prime_blade'}];
 assert.deepEqual([...saleOrderParts(parts,m,sets)(order)!],[['grip',1]]);
 assert.deepEqual([...saleOrderParts(parts,[{id:'p',slug:'weapon_prime_blade'}],sets)(order)!],[['BladeBlueprint',1]]);
 assert.equal(saleOrderParts([...parts,{id:'other',slug:'weapon_prime_blade'}],[{id:'p',slug:'weapon_prime_blade'}],sets)(order),null);
 assert.equal(saleOrderParts(parts,[...m,...m],sets)(order),null);
});
test('resolved unrelated orders are empty; missing or malformed sets invalidate reservations',()=>{
 const order={id:'o',type:'sell',quantity:1,itemId:'set'};
 assert.equal(saleOrderParts(parts,market,null)(order),null);
 assert.equal(saleOrderParts(parts,market,[{...sets[0],parts:[]}])(order),null);
 assert.equal(saleOrderParts(parts,market,[{...sets[0],parts:[{itemId:'grip',quantity:0}]}])(order),null);
 assert.equal(saleOrderParts(parts,market,sets)({...order,itemId:'missing'}),null);
 assert.equal(saleOrderParts(parts,market,sets)({...order,itemId:'mod'})!.size,0);
 assert.equal(saleOrderParts(parts,null,sets)({...order,item:{id:'wrong',slug:'weapon_prime_set'}}),null);
});

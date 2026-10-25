import {test} from 'node:test';
import assert from 'node:assert/strict';
import {activeResurgence,resurgenceOffers,rotationCountdown,type ResurgenceTrader} from '../src/resurgenceModel.ts';
const rotation=(start:number,end:number,completed=false):ResurgenceTrader=>({Activation:{$date:{$numberLong:String(start)}},Expiry:{$date:{$numberLong:String(end)}},Node:'TradeHUB1',Completed:completed});
test('resurgence selects active incomplete rotation, excludes future and expired rotations',()=>{
 const live=rotation(100,200);
 assert.equal(activeResurgence([rotation(0,100),rotation(100,200,true),rotation(201,300),live],100),live);
 assert.equal(activeResurgence([live],200),undefined);
 assert.equal(activeResurgence([{...live,Expiry:{$date:{$numberLong:'invalid'}}}],150),undefined);
});
test('resurgence keeps every current and evergreen offer including unknown metadata',()=>{
 const rows=[{ItemType:'/Lotus/StoreItems/Weapon',PrimePrice:2},{ItemType:'/Lotus/StoreItems/Skin',RegularPrice:10},{ItemType:'/Lotus/Types/StoreItems/Packages/Bundle',PrimePrice:6}];
 const offers=resurgenceOffers({...rotation(0,200),Manifest:rows,EvergreenManifest:[rows[0]]});
 assert.equal(offers.length,4);
 assert.deepEqual(offers.map(r=>r.id),['/Lotus/Weapon','/Lotus/Skin','/Lotus/Types/Packages/Bundle','/Lotus/Weapon']);
 assert.equal(offers[1].RegularPrice,10);assert.equal(offers[0].PrimePrice,2);
 assert.equal(offers[3].section,'EvergreenManifest');assert.equal(new Set(offers.map(r=>r.key)).size,4);
 assert.deepEqual(resurgenceOffers(undefined),[]);
});
test('rotation time folds every 24 hours into days without rounding up',()=>{
 assert.equal(rotationCountdown(24*3600000,0),'1天 0小时');
 assert.equal(rotationCountdown(49*3600000,0),'2天 1小时');
 assert.equal(rotationCountdown(24*3600000-1,0),'23小时 59分钟');
 assert.equal(rotationCountdown(49*3600000,0,true),'2d 1h');
 assert.equal(rotationCountdown(0,1),'0小时 0分钟');
 assert.equal(rotationCountdown(NaN,0),'—');
});

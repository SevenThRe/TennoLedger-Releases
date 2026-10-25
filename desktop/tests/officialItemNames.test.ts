import test from 'node:test';
import assert from 'node:assert/strict';
import {officialNameResolver,officialItemName} from '../src/officialItemNames.ts';
import {marketDisplayName} from '../src/marketModel.ts';
test('official resources fill missing market translations by game identity or unique English name',()=>{
 assert.equal(officialItemName('/Lotus/Types/Items/MiscItems/ArgonCrystal','',''),'氩结晶');
 assert.equal(officialItemName('/Lotus/StoreItems/Types/Items/MiscItems/ArgonCrystal','',''),'氩结晶');
 assert.equal(marketDisplayName({slug:'ayatan_amber_star',i18n:{en:{name:'Ayatan Amber Star'}}},undefined),'阿耶檀识琥珀星');
 assert.equal(marketDisplayName({slug:'argon_crystal',i18n:{en:{name:'Argon Crystal'}}},{zh:'Argon Crystal'}),'氩结晶');
 assert.equal(marketDisplayName({slug:'argon_crystal',i18n:{en:{name:'Argon Crystal'}}},undefined,'en'),'Argon Crystal');
});
test('ambiguous English labels do not guess; exact game IDs still resolve',()=>{
 const resolve=officialNameResolver([['/Lotus/One','Shared Name','甲'],['/Lotus/Two','Shared Name','乙'],['/Lotus/Three','Unique','丙']]);
 assert.equal(resolve(undefined,'Shared Name','shared_name'),undefined);
 assert.equal(resolve('/Lotus/Two','Shared Name','shared_name'),'乙');
 assert.equal(resolve(undefined,undefined,'unique'),'丙');
 assert.equal(resolve(undefined,'Unknown','unknown'),undefined);
});

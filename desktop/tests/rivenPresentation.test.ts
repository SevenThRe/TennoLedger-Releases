import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rivenTitles,rivenWeaponResolver} from '../src/rivenPresentation.ts';

const weapon={id:'/weapon/amprex',name:'Amprex',zh:'安培克斯',category:'primary',image:'/reference/amprex.png'};
const card={name:'Acriada',weaponName:'Amprex',weaponSlug:'amprex',veiled:false};
test('Amprex keeps its suffix and renders Chinese above English with the same weapon artwork',()=>{
 const resolve=rivenWeaponResolver([weapon],{weapons:[{id:weapon.id,slug:'amprex',name:'Alternate market name'}],attributes:[]});
 assert.equal(resolve(card),weapon);
 assert.deepEqual(rivenTitles(card,resolve(card)),{primary:'安培克斯 Acriada',secondary:'Amprex Acriada'});
});
test('a stale dictionary name falls through to inventory name and market slug',()=>{
 const resolve=rivenWeaponResolver([weapon],{weapons:[{slug:'amprex',name:'Outdated name'}],attributes:[]});
 assert.equal(resolve(card),weapon);
 assert.equal(resolve({...card,weaponName:undefined}),weapon);
});
test('missing translations and veiled cards do not repeat an identical title',()=>{
 assert.deepEqual(rivenTitles(card,{...weapon,zh:'�'}),{primary:'Amprex Acriada',secondary:''});
 assert.deepEqual(rivenTitles({...card,name:'Rifle Riven Mod',veiled:true}),{primary:'Rifle Riven Mod',secondary:''});
 assert.equal(rivenWeaponResolver([weapon],{weapons:[],attributes:[]})({...card,veiled:true}),undefined);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeZoom,parseLanguagePack,readLanguagePacks,readAppearance,parseTimerLeadMinutes} from '../src/settingsModel.ts';

test('stored language packs survive serialization while invalid records are isolated',()=>{
 const p=parseLanguagePack({schemaVersion:1,id:'fr',name:' Français ',messages:{settings:'Paramètres',language:'Langue'}});
 assert.deepEqual(readLanguagePacks(JSON.stringify([null,p,{...p,id:'FR'},p,{...p,id:'en'}, {...p,id:'de',messages:[]}])),[p]);
 assert.equal(p.name,'Français');
 assert.deepEqual(readLanguagePacks('{broken'),[]);
 assert.deepEqual(readLanguagePacks('{}'),[]);
});

test('packs cannot override builtins or introduce prototype and non-string messages',()=>{
 const p={schemaVersion:1,id:'fr',name:'French',messages:{settings:'Paramètres'}};
 for(const id of ['en','zh-CN','zh-cn','../../en','x','en_US'])assert.throws(()=>parseLanguagePack({...p,id}));
 for(const messages of [[],{}, {settings:123},JSON.parse('{"__proto__":"bad"}'),{constructor:'bad'},{settings:'x'.repeat(16001)}])assert.throws(()=>parseLanguagePack({...p,messages}));
 assert.throws(()=>parseLanguagePack({...p,name:'  '}));
});

test('stale or malformed display preferences restore safe usable defaults',()=>{
 for(const v of [null,undefined,'broken',0,69,151,Infinity])assert.equal(normalizeZoom(v),100);
 assert.equal(normalizeZoom('70'),70);assert.equal(normalizeZoom('150'),150);assert.equal(normalizeZoom(111),110);
 assert.deepEqual(readAppearance('null'),{accent:'violet',reducedMotion:false});
 assert.deepEqual(readAppearance('{broken'),{accent:'violet',reducedMotion:false});
 assert.deepEqual(readAppearance('{"accent":"unsupported","reducedMotion":"true"}'),{accent:'violet',reducedMotion:false});
 assert.deepEqual(readAppearance('{"accent":"mint","reducedMotion":true}'),{accent:'mint',reducedMotion:true});
});


test('world cycle lead restores old defaults and rejects non-integer or out-of-range settings',()=>{
 assert.equal(parseTimerLeadMinutes(undefined),3);
 for(const value of [0,1,3,17,60])assert.equal(parseTimerLeadMinutes(value),value);
 for(const value of [null,'3','',-1,61,1.5,NaN,Infinity,{},[]])assert.throws(()=>parseTimerLeadMinutes(value));
});

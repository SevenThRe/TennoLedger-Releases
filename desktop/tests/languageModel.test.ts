import test from 'node:test';
import assert from 'node:assert/strict';
import {languagePreference,launcherUiLanguage} from '../src/languageModel.ts';
test('launcher text language chooses Chinese only for Chinese languages',()=>{
 for(const value of ['zh','zh-CN','zh-TW','zh-Hans','zh-Hant','tc','sc'])assert.equal(launcherUiLanguage(value),'zh-CN');
 for(const value of [null,undefined,'','en','de','ja','en-GB',42])assert.equal(launcherUiLanguage(value),'en');
});
test('default and invalid preferences follow Warframe; explicit choices survive',()=>{
 const packs=[{id:'zh-CN'},{id:'en'},{id:'fr'}];
 for(const saved of [null,'auto','invalid'])assert.equal(languagePreference(saved,packs),'auto');
 for(const saved of ['zh-CN','en','fr'])assert.equal(languagePreference(saved,packs),saved);
});

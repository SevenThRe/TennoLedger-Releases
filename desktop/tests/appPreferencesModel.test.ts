import {test} from 'node:test';import assert from 'node:assert/strict';import {readAppPreferences,parseAppPreferences,appPreferenceDefaults,resolveWindowCloseDecision} from '../src/appPreferencesModel.ts';
test('old preferences gain compatible defaults, recording remains explicit',()=>{assert.deepEqual(readAppPreferences(null),appPreferenceDefaults);assert.equal(parseAppPreferences({recordStats:false}).recordStats,false);assert.equal(parseAppPreferences({}).warnOnClose,true);assert.equal(parseAppPreferences({}).closeAction,'ask');assert.throws(()=>parseAppPreferences({recordStats:'false'}));assert.throws(()=>parseAppPreferences({closeAction:'invalid'}));assert.deepEqual(readAppPreferences('bad'),appPreferenceDefaults);});

test('Stats visibility and recording are independent preferences',()=>{const p=parseAppPreferences({statsTabEnabled:false,recordStats:true});assert.equal(p.statsTabEnabled,false);assert.equal(p.recordStats,true);assert.equal(parseAppPreferences({}).statsTabEnabled,true);});

test("reference inventory and rank settings migrate with defaults and persist false",()=>{const old=parseAppPreferences({});assert.equal(old.fullInventoryExperienceEnabled,false);assert.equal(old.takeRankIntoAccount,true);const disabled=parseAppPreferences({fullInventoryExperienceEnabled:false,takeRankIntoAccount:false});assert.equal(disabled.fullInventoryExperienceEnabled,false);assert.equal(disabled.takeRankIntoAccount,false);assert.throws(()=>parseAppPreferences({takeRankIntoAccount:"false"}));});

test('closeAction migrates legacy warnOnClose and avoids trapping already-minimized window',()=>{
 const legacyDisabled=parseAppPreferences({warnOnClose:false});
 assert.equal(legacyDisabled.closeAction,'close');
 assert.equal(legacyDisabled.warnOnClose,false);
 const explicitMin=parseAppPreferences({closeAction:'minimize',warnOnClose:true});
 assert.equal(explicitMin.closeAction,'minimize');
 assert.equal(explicitMin.warnOnClose,false);
 assert.equal(resolveWindowCloseDecision('ask',false),'ask');
 assert.equal(resolveWindowCloseDecision('ask',true),'ask');
 assert.equal(resolveWindowCloseDecision('minimize',false),'minimize');
 assert.equal(resolveWindowCloseDecision('minimize',true),'close');
 assert.equal(resolveWindowCloseDecision('close',false),'close');
 assert.equal(resolveWindowCloseDecision('close',true),'close');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {collectorScanStatus,KNOWN_SCAN_CODES} from '../src/collectorStatusModel.ts';

const REQUIRED_CODES=[
 'helper-fetching',
 'game-not-running',
 'helper-session-unavailable',
 'helper-network-failed',
 'helper-auth-failed',
 'helper-missing',
 'helper-invalid-inventory:core-structure',
 'helper-invalid-inventory:login-changed-during-read',
 'helper-current',
 'access-denied',
 'helper-timeout',
 'helper-start-failed',
 'helper-integrity-error',
 'helper-account-mismatch',
 'helper-failed',
 'helper-cancelled',
 'history-save-failed',
 'stopped',
 'waiting-data',
];

test('maps every Rust scanCode to concise bilingual status and actionable hint',()=>{
 for(const code of REQUIRED_CODES){
  const zh=collectorScanStatus(code,false);
  const en=collectorScanStatus(code,true);
  assert.ok(zh.status.length>0,`missing zh status for ${code}`);
  assert.ok(zh.hint.length>0,`missing zh hint for ${code}`);
  assert.ok(en.status.length>0,`missing en status for ${code}`);
  assert.ok(en.hint.length>0,`missing en hint for ${code}`);
  assert.notEqual(zh.status,en.status,`status must be localized for ${code}`);
  assert.notEqual(zh.hint,en.hint,`hint must be localized for ${code}`);
 }
 assert.equal(KNOWN_SCAN_CODES.length,18);
});

test('waiting-data reflects fresh live state when already synced and falls back safely on unknown codes',()=>{
 assert.equal(collectorScanStatus('waiting-data',false,false).status,'等待游戏数据');
 assert.equal(collectorScanStatus('waiting-data',false,true).status,'游戏数据已同步');
 assert.equal(collectorScanStatus('waiting-data',true,false).status,'Waiting for game data');
 assert.equal(collectorScanStatus('waiting-data',true,true).status,'Game data synced');
 assert.equal(collectorScanStatus('unknown-code',true,false).status,'Waiting for game data');
 assert.equal(collectorScanStatus('unknown-code',false,true).status,'游戏数据已同步');
});

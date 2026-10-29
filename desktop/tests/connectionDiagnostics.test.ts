import {test} from 'node:test';
import assert from 'node:assert/strict';
import {connectionChecks,inventoryFailureText} from '../src/connectionDiagnostics.ts';
test('tester report identifies running game and rejected inventory independently',()=>{
 const code='helper-invalid-inventory:account-not-accepted';
 assert.deepEqual(connectionChecks(code,{gameDetected:true,inventoryComplete:null}),{game:true,inventory:false});
 assert.match(inventoryFailureText(code,false)!,/未记录具体原因/);
});
test('missing diagnostics stays unknown; process exit overrides stale process check',()=>{
 assert.deepEqual(connectionChecks('waiting-data',null),{game:null,inventory:null});
 assert.deepEqual(connectionChecks('game-not-running',{gameDetected:true,inventoryComplete:true}),{game:false,inventory:true});
});
test('incomplete inventory remains a failure rather than login advice or success',()=>{
 assert.deepEqual(connectionChecks('helper-invalid-inventory:acquisition-incomplete',{gameDetected:true,inventoryComplete:true}),{game:true,inventory:false});
 assert.match(inventoryFailureText('helper-invalid-inventory:acquisition-incomplete',false)!,/未保存/);
 assert.equal(inventoryFailureText('helper-current',false),null);
});

test('optional inventory gaps do not report a successful saved sync as unavailable',()=>{
 assert.equal(connectionChecks('helper-current',{inventoryAvailable:true,inventoryComplete:false}).inventory,true);
 assert.equal(connectionChecks('helper-invalid-inventory:acquisition-incomplete',{inventoryAvailable:true}).inventory,false);
});

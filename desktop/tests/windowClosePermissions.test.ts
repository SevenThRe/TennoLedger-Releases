import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('main window can finish the installed Tauri close-request handler',()=>{
 const sdk=readFileSync(new URL('../node_modules/@tauri-apps/api/window.js',import.meta.url),'utf8');
 const start=sdk.indexOf('async onCloseRequested(handler)');
 const handler=sdk.slice(start,start+500);
 // close() emits a request; the SDK finishes an accepted request using
 // destroy(), which has a separate permission. Missing it strands the dialog.
 assert.match(handler,/await this\.destroy\(\)/);
 const capability=JSON.parse(readFileSync(new URL('../src-tauri/capabilities/default.json',import.meta.url),'utf8'));
 assert.ok(capability.windows.includes('main'));
 for(const permission of ['core:window:allow-close','core:window:allow-destroy']){
  assert.ok(capability.permissions.includes(permission),`Close confirmation requires ${permission}`);
 }
});

import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-ignore JavaScript CLI is also used by release packaging.
import {manifest} from '../../tools/update-manifest.mjs';
test('release manifest has Tauri platform, inline signature and versioned URL',()=>{
 const m=manifest('0.2.0','https://example.com/v0.2.0/setup.exe','YWJjZA==\n','fixes');
 assert.equal(m.version,'0.2.0');assert.equal(m.platforms['windows-x86_64'].signature,'YWJjZA==');
 assert.equal(m.platforms['windows-x86_64'].url,'https://example.com/v0.2.0/setup.exe');
});
test('reject malformed versions, insecure links and signature paths',()=>{
 for(const v of ['0.2','latest','../0.2.0'])assert.throws(()=>manifest(v,'https://example.com/a','YWJjZA=='));
 for(const u of ['http://example.com/a','https://user:secret@example.com/a'])assert.throws(()=>manifest('0.2.0',u,'YWJjZA=='));
 for(const s of ['','C:\\keys\\a.sig','https://example.com/a.sig'])assert.throws(()=>manifest('0.2.0','https://example.com/a',s));
});

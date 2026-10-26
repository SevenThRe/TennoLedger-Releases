import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseTheme,parseThemeText,serializeAlecaTheme,themeSlots,changeThemeSlot} from '../src/themeModel.ts';
const reference=JSON.parse(readFileSync(new URL('../src/communityThemes.json',import.meta.url),'utf8'));
test('all 17 reference community themes preserve authors, icons and every color through export/import',()=>{
 assert.equal(reference.length,17);
 for(const raw of reference){
  const theme=parseTheme(raw),roundtrip=parseThemeText(serializeAlecaTheme(theme));
  assert.equal(theme.name,raw.name);assert.equal(theme.author,raw.author);
  assert.equal(roundtrip.iconBase64,raw.iconBase64);
  assert.deepEqual(roundtrip.palette,theme.palette);
  assert.equal(Object.keys(theme.palette).length,themeSlots.length);
 }
});
test('reference alpha colors remain bounded hexadecimal values and survive editing',()=>{
 const legacy=parseTheme(reference.find((theme:{name:string})=>theme.name==='Legacy'));
 assert.equal(legacy.palette['color-card-hover'],'#efd948bd');
 assert.equal(changeThemeSlot(legacy,'color-bg-1','#112233').palette['color-card-hover'],'#efd948bd');
 for(const value of ['#12345','#1234567','#123456789','#ffffff;url(x)'])assert.throws(()=>parseThemeText('--color-bg-1: '+value+';'));
});

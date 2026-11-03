import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {tradeSearch} from '../src/tradeSearch.ts';
import {craftingNames} from '../src/itemNames.ts';
const catalog=JSON.parse(readFileSync(new URL('../public/catalog.json',import.meta.url),'utf8'));
const seed=JSON.parse(readFileSync(new URL('../public/wm-prices.json',import.meta.url),'utf8'));
test('WM Chinese search includes Ambassador set and four parts regardless of quote availability',()=>{
 const rows=seed.rows.map((r:any)=>({...r,unitPrice:null}));
 const found=tradeSearch('使节',rows);
 for(const suffix of ['set','blueprint','barrel','receiver','stock'])assert.ok(found.some(r=>r.slug==='ambassador_'+suffix),suffix);
 assert.ok(tradeSearch('Ambassador',rows).length>=5);
 assert.ok(tradeSearch('shijie',rows).length>=5);
 assert.ok(tradeSearch('paris_prime_string',rows).some(r=>r.englishName==='Paris Prime String'));
});
test('real generic bow strings retain their weapon identity',()=>{
 const names=craftingNames(new Map(catalog.items.map((i:any)=>[i.id,i])));
 for(const suffix of ['PrimeBallisticaString','PrimeBowString','PrimeCernosString','PrimeDaikyuString']){
  const id='/Lotus/Types/Recipes/Weapons/WeaponParts/'+suffix;
  assert.notEqual(names(id),'弓弦');assert.ok(names(id).includes('Prime'));
 }
});
test('inventory market identity uses exact WM translation over generic catalog label',()=>{
 const items=new Map<string,any>(catalog.items.map((i:any)=>[i.id,i]));
 const row=seed.rows.find((r:any)=>r.slug==='paris_prime_string');
 const names=craftingNames(items,false,{[row.gameRef]:row.i18n['zh-hans'].name});
 assert.equal(names(row.gameRef),row.i18n['zh-hans'].name);
 assert.notEqual(names(row.gameRef),'弓弦');
});

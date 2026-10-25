import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {rivenWeaponResolver,rivenTitles,type RivenWeapon} from '../src/rivenPresentation.ts';
import {rivenAttributeName} from '../src/rivenLocalization.ts';
import type {RivenCatalog} from '../src/rivenModel.ts';

const read=(name:string)=>JSON.parse(readFileSync(new URL('../public/'+name,import.meta.url),'utf8'));
const items:RivenWeapon[]=read('catalog.json').items,catalog:RivenCatalog=read('riven-catalog.json');

test('every market-supported riven weapon resolves its title and artwork in the shipped catalog',()=>{
 const resolve=rivenWeaponResolver(items,catalog),supported=catalog.weapons.filter(w=>w.slug);
 assert.ok(supported.length>300,'a truncated catalog must not pass coverage');
 assert.equal(new Set(supported.map(w=>w.slug)).size,supported.length,'ambiguous market slugs');
 for(const row of supported){
  const card={veiled:false,weaponSlug:row.slug!,weaponName:row.name,name:'QA suffix'},weapon=resolve(card);
  assert.ok(weapon,`unresolved ${row.slug}`);
  assert.ok(weapon.zh?.trim()&&!weapon.zh.includes('�'),`missing label ${row.slug}`);
  const art=weapon.image||weapon.imageUrl;
  assert.ok(art,`missing artwork ${row.slug}`);
  if(art.startsWith('/'))assert.ok(existsSync(new URL('../public'+art,import.meta.url)),`missing local image ${art}`);
  assert.ok(rivenTitles(card,weapon).primary.endsWith('QA suffix'),`suffix lost ${row.slug}`);
 }
});

test('all shipped riven traits have Chinese mappings and preserve English API-facing labels',()=>{
 assert.ok(catalog.attributes.length>40);
 for(const trait of catalog.attributes){
  assert.notEqual(rivenAttributeName(trait.slug,'__UNMAPPED__','zh-CN'),'__UNMAPPED__',trait.slug);
  assert.equal(rivenAttributeName(trait.slug,trait.name,'en'),trait.name);
 }
 assert.equal(rivenAttributeName('multishot','Multishot','zh-CN'),'多重射击');
});

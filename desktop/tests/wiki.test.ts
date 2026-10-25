import {test} from 'node:test';
import assert from 'node:assert/strict';
import {wikiUrl} from '../src/wiki.ts';
test('huiji searches Chinese name and falls back to English',()=>{
 assert.equal(new URL(wikiUrl('huiji','Volt','伏特')).searchParams.get('search'),'伏特');
 assert.equal(new URL(wikiUrl('huiji','Volt','')).searchParams.get('search'),'Volt');
});
test('wiki search preserves special characters without changing host',()=>{
 for(const provider of ['english','huiji'] as const){const u=new URL(wikiUrl(provider,'A & B/#?'));assert.equal(u.searchParams.get('search'),'A & B/#?');assert.equal(u.protocol,'https:');}
});

test('Akimbo Slip Shot uses canonical huiji title without game punctuation',()=>{
 assert.equal(decodeURIComponent(new URL(wikiUrl('huiji','Akimbo Slip Shot','双枪·滑射')).pathname),'/wiki/双枪滑射');
});

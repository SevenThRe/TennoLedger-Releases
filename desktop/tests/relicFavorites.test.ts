import test from 'node:test';
import assert from 'node:assert/strict';
import {isRelicFavorite,toggleRelicFavorite} from '../src/relicFavorites.ts';
const intact={id:'intact',base:'Lith G10'},radiant={id:'radiant',base:'Lith G10'},other={id:'other',base:'Axi A21'};
const variants=[intact,radiant,other];
test('legacy refinement favorites appear across the same relic family and clear together',()=>{
 assert.equal(isRelicFavorite(['radiant'],intact,variants),true);
 assert.equal(isRelicFavorite(['other'],intact,variants),false);
 assert.deepEqual(toggleRelicFavorite(['radiant','intact','Lith G10','other','unknown'],intact,variants),['other','unknown']);
});
test('favorite writes one canonical family key without changing other relics',()=>{
 const next=toggleRelicFavorite(['other'],radiant,variants);
 assert.deepEqual(next,['other','Lith G10']);
 assert.equal(isRelicFavorite(next,intact,variants),true);
 assert.deepEqual(toggleRelicFavorite(next,intact,variants),['other']);
});

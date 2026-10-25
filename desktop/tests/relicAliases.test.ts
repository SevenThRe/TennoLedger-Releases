import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeRelicAliases,relicOwned,marketRelicOwned} from '../src/relicAliases.ts';
import {isRelicFavorite,toggleRelicFavorite} from '../src/relicFavorites.ts';
import type {Relic} from '../src/relicModel.ts';
const base:Relic={id:'old',base:'Lith G12',name:'Lith G12 Intact',era:'Lith',refinement:'Intact',vaulted:true,rewards:[{id:'part',name:'Part',chance:100}],marketSlug:'lith_g12_relic'};
test('equivalent catalog aliases merge without mutating source or dropping raw IDs',()=>{
 const raw=[base,{...base,id:'new'}],merged=mergeRelicAliases(raw);
 assert.equal(merged.length,1);assert.deepEqual(merged[0].aliases,['old','new']);assert.equal(base.aliases,undefined);
 assert.deepEqual(mergeRelicAliases(merged),merged);
 assert.equal(relicOwned({counts:{old:2,new:3},complete:true},merged[0]),5);
 assert.equal(relicOwned({counts:{new:3},complete:true},merged[0]),3);
 assert.equal(relicOwned({counts:{new:3},complete:false},merged[0]),null);
 assert.equal(relicOwned(null,merged[0]),null);
});
test('different refinement or reward payloads cannot be silently merged',()=>{
 assert.equal(mergeRelicAliases([base,{...base,id:'new',refinement:'Radiant'}]).length,2);
 assert.equal(mergeRelicAliases([base,{...base,id:'new',rewards:[{id:'other',name:'Other',chance:100}]}]).length,2);
});
test('alias favorites remain recognized and toggle removes the whole equivalent family',()=>{
 const merged=mergeRelicAliases([base,{...base,id:'new'}]);
 assert.equal(isRelicFavorite(['new'],merged[0],merged),true);
 assert.deepEqual(toggleRelicFavorite(['new','unrelated'],merged[0],merged),['unrelated']);
 assert.deepEqual(toggleRelicFavorite([],merged[0],merged),['Lith G12']);
});
test('duplicate IDs are counted once and acquisition locations survive merging',()=>{
 const merged=mergeRelicAliases([{...base,drops:[{location:'A',chance:1}]},{...base,id:'new',drops:[{location:'B',chance:2}]},base]);
 assert.equal(relicOwned({counts:{old:2,new:3},complete:true},merged[0]),5);
 assert.deepEqual(merged[0].drops,[{location:'A',chance:1},{location:'B',chance:2}]);
});

test('market inventory resolves the exact refinement and deduplicates alias IDs',()=>{
 const rows=[base,{...base,id:'new',aliases:['old']},{...base,id:'rad',refinement:'Radiant'}];
 const snapshot={complete:true,counts:{old:2,new:3,rad:7}};
 assert.equal(marketRelicOwned(snapshot,rows,'lith_g12_relic','intact'),5);
 assert.equal(marketRelicOwned(snapshot,rows,'lith_g12_relic','radiant'),7);
 assert.equal(marketRelicOwned(snapshot,rows,'lith_g12_relic'),null);
 assert.equal(marketRelicOwned(snapshot,rows,'other','intact'),null);
 assert.equal(marketRelicOwned({...snapshot,counts:{old:2},complete:false},rows,'lith_g12_relic','intact'),null);
});

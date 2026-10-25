import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ownedRelicRewards} from '../src/ownedRelicRewards.ts';
import {mergeRelicAliases} from '../src/relicAliases.ts';
const relics=[{id:'intact',name:'Lith A11',base:'a11',era:'Lith',refinement:'Intact',vaulted:true,rewards:[{id:'barrel',name:'Barrel',chance:10}]},{id:'radiant',name:'Lith A11',base:'a11',era:'Lith',refinement:'Radiant',vaulted:true,rewards:[{id:'barrel',name:'Barrel',chance:20}]}];
test('only exact owned refinement IDs contribute, including vaulted relics',()=>{const rows=ownedRelicRewards(relics,{complete:false,counts:{intact:2,barrel:0}}).get('barrel');assert.equal(rows?.length,1);assert.equal(rows?.[0].count,2);assert.equal(rows?.[0].chance,10);});
test('missing, zero, negative and invalid inventory never creates availability',()=>{assert.equal(ownedRelicRewards(relics,null).size,0);for(const value of [0,-1,NaN,Infinity,0.5])assert.equal(ownedRelicRewards(relics,{complete:true,counts:{intact:value}}).size,0);});
test('multiple refinements retain separate counts and odds; consumed relic disappears',()=>{const rows=ownedRelicRewards(relics,{complete:true,counts:{intact:2,radiant:1,barrel:5}}).get('barrel')!;assert.deepEqual(rows.map(r=>[r.id,r.count,r.chance]),[['radiant',1,20],['intact',2,10]]);assert.equal(ownedRelicRewards(relics,{complete:true,counts:{intact:0,radiant:0}}).size,0);});

test('built component badges inherit blueprint sources without duplicate mapping rows',()=>{
 const part={itemId:'barrel',ownedItemId:'built',quantity:1,drops:[]};
 const sources={items:{frame:{parts:[part]},another:{parts:[part]}},marketSlugs:{}};
 const index=ownedRelicRewards(relics,{complete:false,counts:{intact:2}},sources);
 assert.deepEqual(index.get('built'),index.get('barrel'));
 assert.equal(index.get('built')?.length,1);
 assert.equal(index.has('frame'),false);assert.equal(index.has('other'),false);
 assert.equal(ownedRelicRewards(relics,{complete:true,counts:{intact:0}},sources).has('built'),false);
});

test('catalog alias rows merge and their inventory counts appear once in the badge',()=>{
 const rows=mergeRelicAliases([relics[0],{...relics[0],id:'alias',aliases:['intact','alias']},relics[1]]);
 const found=ownedRelicRewards(rows,{complete:true,counts:{intact:2,alias:3,radiant:7}}).get('barrel')!;
 assert.deepEqual(found.map(r=>[r.refinement,r.count]),[['Radiant',7],['Intact',5]]);
 assert.equal(ownedRelicRewards(rows,{complete:true,counts:{alias:3}}).get('barrel')?.[0].count,3);
});

test('partial alias totals are not presented as exact quantities',()=>{
 const rows=[{...relics[0],aliases:['intact','alias']}];
 const partial=ownedRelicRewards(rows,{complete:false,counts:{intact:2}}).get('barrel')![0];
 assert.equal(partial.count,2);assert.equal(partial.countComplete,false);
 assert.equal(ownedRelicRewards(rows,{complete:false,counts:{}}).size,0);
 assert.equal(ownedRelicRewards(rows,{complete:false,counts:{intact:0}}).size,0);
 assert.equal(ownedRelicRewards(rows,{complete:true,counts:{intact:2}}).get('barrel')![0].countComplete,true);
 assert.equal(ownedRelicRewards(rows,{complete:false,counts:{intact:2,alias:0}}).get('barrel')![0].countComplete,true);
 assert.equal(ownedRelicRewards(rows,{complete:false,counts:{intact:2,alias:0}}).get('barrel')?.[0].count,2);
 for(const alias of [-1,0.5,Infinity,Number.MAX_SAFE_INTEGER]){
  assert.equal(ownedRelicRewards(rows,{complete:true,counts:{intact:2,alias}}).size,0);
 }
});

test('badge title uses base name without repeating the English refinement',()=>{
 const relic={...relics[0],base:'Lith G12',name:'Lith G12 Exceptional',refinement:'Exceptional'};
 const row=ownedRelicRewards([relic],{complete:true,counts:{intact:2}}).get('barrel')![0];
 assert.equal(row.name,'Lith G12');assert.equal(row.refinement,'Exceptional');
});

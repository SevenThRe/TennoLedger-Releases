import test from 'node:test';
import assert from 'node:assert/strict';
import {relicAcquisition} from '../src/relicAliases.ts';
import type {Relic} from '../src/relicModel.ts';
const relic:Relic={id:'old',base:'Lith G12',name:'Lith G12 Intact',era:'Lith',refinement:'Intact',vaulted:true,rewards:[{id:'part',name:'Part',chance:2}]};
test('built components resolve their blueprint acquisition without inventing unrelated mappings',()=>{
 const sources={items:{frame:{parts:[{itemId:'part',ownedItemId:'built',quantity:1,drops:[]}]}},marketSlugs:{}};
 const inventory={counts:{old:3},complete:true};
 assert.equal(relicAcquisition([relic],'built',inventory,sources)[0].count,3);
 assert.equal(relicAcquisition([relic],'built',inventory,sources)[0].chance,2);
 assert.deepEqual(relicAcquisition([relic],'other',inventory,sources),[]);
});
test('item and crafting acquisition rows merge equivalent aliases and retain combined inventory',()=>{
 const rows=relicAcquisition([relic,{...relic,id:'new'}],'part',{counts:{old:2,new:3},complete:true});
 assert.equal(rows.length,1);assert.equal(rows[0].count,5);assert.equal(rows[0].chance,2);
 assert.deepEqual(rows[0].aliases,['old','new']);
});
test('acquisition keeps refinement choices, excludes unrelated rewards and preserves unknown quantities',()=>{
 const rows=[relic,{...relic,id:'new'},{...relic,id:'rad',refinement:'Radiant',rewards:[{id:'part',name:'Part',chance:10}]}];
 const result=relicAcquisition(rows,'part',{counts:{old:1,rad:2},complete:false});
 assert.equal(result.length,2);assert.equal(result[0].refinement,'Radiant');assert.equal(result[1].count,null);
 assert.deepEqual(relicAcquisition(rows,'unrelated',{counts:{},complete:true}),[]);
});

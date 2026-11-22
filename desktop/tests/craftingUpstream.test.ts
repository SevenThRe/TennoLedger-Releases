import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildParentIndex,directUpstream,upstreamSummary,upstreamTree,type UpstreamItem} from '../src/craftingUpstreamModel.ts';

test('buildParentIndex aggregates duplicate parts and keeps max for reusable blueprints',()=>{
 const items:UpstreamItem[]=[
  {id:'bolto',name:'Bolto'},
  {id:'bp',name:'Blueprint'},
  {
   id:'akbolto',
   name:'Akbolto',
   recipe:{
    output:1,
    parts:[
     {itemId:'bp',quantity:1,reusable:true},
     {itemId:'bp',quantity:1,reusable:true},
     {itemId:'bolto',quantity:1},
     {itemId:'bolto',quantity:1},
     {itemId:'akbolto',quantity:1},
     {itemId:'bad',quantity:0},
    ],
   },
  },
 ];
 const index=buildParentIndex(items);
 assert.deepEqual(directUpstream('bolto',index),[{itemId:'akbolto',quantity:2}]);
 assert.deepEqual(directUpstream('bp',index),[{itemId:'akbolto',quantity:1}]);
 assert.deepEqual(directUpstream('akbolto',index),[]);
 assert.deepEqual(directUpstream('bad',index),[]);
});

test('upstreamTree resolves multi-level crafting chain without truncating siblings',()=>{
 const items:UpstreamItem[]=[
  {id:'lato',name:'Lato'},
  {id:'bolto',name:'Bolto',recipe:{output:1,parts:[{itemId:'lato',quantity:1}]}},
  {id:'akbolto',name:'Akbolto',recipe:{output:1,parts:[{itemId:'bolto',quantity:1},{itemId:'bolto',quantity:1}]}},
  {id:'hystrix',name:'Hystrix',recipe:{output:1,parts:[{itemId:'bolto',quantity:1}]}},
  {id:'akjagara',name:'Akjagara',recipe:{output:1,parts:[{itemId:'akbolto',quantity:1}]}},
 ];
 const index=buildParentIndex(items);
 const tree=upstreamTree('lato',index);
 assert.equal(tree.directCount,1);
 assert.equal(tree.hiddenParents,0);
 assert.deepEqual(tree.parents,[
  {
   itemId:'bolto',
   quantity:1,
   hiddenParents:0,
   parents:[
    {
     itemId:'akbolto',
     quantity:2,
     hiddenParents:0,
     parents:[{itemId:'akjagara',quantity:1,parents:[],hiddenParents:0}],
    },
    {itemId:'hystrix',quantity:1,parents:[],hiddenParents:0},
   ],
  },
 ]);

 const siblingLimited=upstreamTree('lato',index,{maxNodes:3});
 assert.equal(siblingLimited.parents[0].parents.length,2);
 assert.deepEqual(siblingLimited.parents[0].parents[0],{itemId:'akbolto',quantity:2,parents:[],hiddenParents:1});
});

test('upstreamTree handles cycles cleanly without infinite recursion',()=>{
 const items:UpstreamItem[]=[
  {id:'a',name:'Alpha',recipe:{output:1,parts:[{itemId:'b',quantity:1},{itemId:'a',quantity:1}]}},
  {id:'b',name:'Beta',recipe:{output:1,parts:[{itemId:'a',quantity:1}]}},
 ];
 const index=buildParentIndex(items);
 const tree=upstreamTree('a',index);
 assert.deepEqual(tree,{
  directCount:1,
  hiddenParents:0,
  parents:[{itemId:'b',quantity:1,parents:[],hiddenParents:0}],
 });
});

test('upstreamTree caps high fan-out direct parents and leaves grandchildren unexpanded',()=>{
 const parents:UpstreamItem[]=Array.from({length:20},(_,i)=>({
  id:`p${String(i).padStart(2,'0')}`,
  name:`Parent ${String(i).padStart(2,'0')}`,
  recipe:{output:1,parts:[{itemId:'cell',quantity:1}]},
 }));
 const top:UpstreamItem={id:'grand',name:'Grandparent',recipe:{output:1,parts:[{itemId:'p00',quantity:1}]}};
 const index=buildParentIndex([{id:'cell',name:'Orokin Cell'},...parents,top]);
 const tree=upstreamTree('cell',index,{maxBranch:4});
 assert.equal(tree.directCount,20);
 assert.equal(tree.parents.length,4);
 assert.equal(tree.hiddenParents,16);
 assert.ok(tree.parents.every(node=>node.parents.length===0&&node.hiddenParents===0));
});

test('upstreamSummary respects localized sortName and preview limit',()=>{
 const items:UpstreamItem[]=[
  {id:'x',name:'Base'},
  {id:'p1',name:'Zulu',zh:'C-Zulu',recipe:{output:1,parts:[{itemId:'x',quantity:1}]}},
  {id:'p2',name:'Alpha',zh:'A-Alpha',recipe:{output:1,parts:[{itemId:'x',quantity:1}]}},
  {id:'p3',name:'Mike',zh:'B-Mike',recipe:{output:1,parts:[{itemId:'x',quantity:2}]}},
 ];
 const index=buildParentIndex(items);
 const enSummary=upstreamSummary('x',index,undefined,2);
 assert.equal(enSummary.count,3);
 assert.equal(enSummary.remaining,1);
 assert.deepEqual(enSummary.preview,[{itemId:'p2',quantity:1},{itemId:'p3',quantity:2}]);
 const reverseMap=new Map([['p1','1-First'],['p2','3-Last'],['p3','2-Mid']]);
 const customSummary=upstreamSummary('x',index,id=>reverseMap.get(id)??id,2);
 assert.deepEqual(customSummary.preview.map(e=>e.itemId),['p1','p3']);
});

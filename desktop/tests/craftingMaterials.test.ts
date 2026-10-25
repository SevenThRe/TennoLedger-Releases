import {test} from 'node:test';
import assert from 'node:assert/strict';
import {filterMaterials,materialKind} from '../src/craftingMaterials.ts';
import type {ResourceRequirement} from '../src/resourcePlan.ts';
const row=(missing:number,usedBy=['goal']):ResourceRequirement=>({needed:10,owned:10-missing,allocated:10-missing,pending:0,fromBatches:0,missing,crafts:0,usedBy});
const opts={focus:'',missingOnly:false,kind:'' as const,search:'',order:'priority' as const};
test('priority sorts shortages ahead of covered materials then by goals helped',()=>{
 const rows={covered:row(0,['a','b','c']),short:row(2),shared:row(1,['a','b'])};
 assert.deepEqual(filterMaterials(rows,opts,id=>({name:id,kind:'resource'})).map(([id])=>id),['shared','short','covered']);
});
test('still needed excludes intermediate crafts whose raw ingredients are listed separately',()=>{
 const rows={component:{...row(0),crafts:2},ore:row(8)};
 assert.deepEqual(filterMaterials(rows,{...opts,missingOnly:true},id=>({name:id,kind:'resource'})).map(([id])=>id),['ore']);
});
test('blueprint classification wins and resource expansion changes the material type',()=>{
 const recipe={output:1,parts:[{itemId:'ore',quantity:1}]},recipes={alloy:recipe,part:recipe,bp:recipe};
 const resources=new Set(['alloy']),blueprints=new Set(['bp']);
 assert.equal(materialKind('bp',blueprints,recipes,resources,new Set()),'blueprint');
 assert.equal(materialKind('part',blueprints,recipes,resources,new Set()),'component');
 assert.equal(materialKind('alloy',blueprints,recipes,resources,new Set()),'resource');
 assert.equal(materialKind('alloy',blueprints,recipes,resources,new Set(['alloy'])),'component');
});
test('source locations and alternate names are searchable while type and goal filters compose',()=>{
 const rows={ore:row(2,['a']),bp:row(1,['b'])};
 const describe=(id:string)=>({name:id==='ore'?'合金板':'蓝图',alternateName:id==='ore'?'Alloy Plate':'Blueprint',kind:id==='ore'?'resource' as const:'blueprint' as const,sources:id==='ore'?'Venus 金星':''});
 assert.equal(filterMaterials(rows,{...opts,search:'jinxing',focus:'a',kind:'resource'},describe).length,1);
 assert.equal(filterMaterials(rows,{...opts,search:'Alloy'},describe).length,1);
 assert.equal(filterMaterials(rows,{...opts,search:'Venus',focus:'b'},describe).length,0);
});

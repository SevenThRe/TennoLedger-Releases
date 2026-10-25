import test from 'node:test';
import assert from 'node:assert/strict';
import {playerPopoverPosition} from '../src/playerPopover.ts';
test('popover sits to the right with a separate gap at each UI scale',()=>{
 for(const scale of [.7,1,1.5]){
  const anchor={left:8*scale,right:212*scale,top:44,width:204*scale};
  const p=playerPopoverPosition(anchor,204,{width:1280,height:720});
  assert.equal(p.scale,scale);assert.equal(p.left,anchor.right+10*scale);assert.equal(p.top,44);
  assert.equal(p.width,340);assert.ok(p.left+p.width*p.scale<=1272);
 }
});
test('popover flips or clamps inside small viewports and preserves a scrollable height',()=>{
 const p=playerPopoverPosition({left:700,right:900,top:600,width:200},200,{width:960,height:720});
 assert.equal(p.left,350);assert.equal(p.top,386);assert.equal(p.maxHeight,326);
 const small=playerPopoverPosition({left:8,right:212,top:44,width:204},204,{width:320,height:240});
 assert.equal(small.left,8);assert.equal(small.width,304);assert.equal(small.top,122);assert.equal(small.maxHeight,110);
 const narrow=playerPopoverPosition({left:8,right:212,top:44,width:204},204,{width:529,height:720});
 assert.equal(narrow.left,222);assert.equal(narrow.width,299);
});

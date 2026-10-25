import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialTreeCamera,zoomTree,treePointer,treeMovement,fitTreeCamera,focusTreeCamera} from '../src/treeViewport.ts';
test('tree zoom preserves the content point under the cursor after panning',()=>{
 const camera={zoom:.7,x:35,y:-80},anchor={x:210,y:120};
 const next=zoomTree(camera,1.2,anchor);
 assert.ok(Math.abs((anchor.x-camera.x)/camera.zoom-(anchor.x-next.x)/next.zoom)<1e-9);
 assert.ok(Math.abs((anchor.y-camera.y)/camera.zoom-(anchor.y-next.y)/next.zoom)<1e-9);
});
test('tree navigation uses original limits and reversible wheel steps',()=>{
 assert.equal(zoomTree(initialTreeCamera,.01).zoom,.01);
 assert.equal(zoomTree(initialTreeCamera,5).zoom,1.6);
 const anchor={x:40,y:90},up=zoomTree(initialTreeCamera,1.1,anchor),down=zoomTree(up,up.zoom/1.1,anchor);
 assert.ok(Math.abs(down.x)<1e-9&&Math.abs(down.y)<1e-9);assert.equal(down.zoom,1);
});

test('window UI scaling does not displace the zoom anchor or amplify dragging',()=>{
 for(const scale of [.8,1,1.25,1.5]){
  const rect={left:70,top:100,width:800*scale,height:500*scale};
  const client={x:rect.left+600*scale,y:rect.top+150*scale};
  const anchor=treePointer(client,rect,800,500);
  assert.deepEqual(anchor,{x:600,y:150});
  const camera={zoom:.7,x:30,y:-20},next=zoomTree(camera,1.1,anchor);
  const content={x:(anchor.x-camera.x)/camera.zoom,y:(anchor.y-camera.y)/camera.zoom};
  assert.ok(Math.abs((content.x*next.zoom+next.x-anchor.x)*scale)<1e-9);
  assert.ok(Math.abs((content.y*next.zoom+next.y-anchor.y)*scale)<1e-9);
  assert.deepEqual(treeMovement({x:40*scale,y:-10*scale},rect,800,500),{x:40,y:-10});
 }
});

test('initial layout preserves readable 85 percent while explicit Fit includes the whole oversized tree',()=>{
 const view={width:582,height:582},tree={width:1064,height:680};
 const initial=fitTreeCamera(view,tree),fit=fitTreeCamera(view,tree,true);
 assert.equal(initial.zoom,.85);assert.ok(initial.x<0);
 assert.ok(fit.zoom<.85);assert.ok(fit.x>=12);assert.ok(fit.y>=12);
 assert.ok(fit.x+tree.width*fit.zoom<=view.width-12+.001);
 assert.ok(fit.y+tree.height*fit.zoom<=view.height-28+.001);
 const focus=focusTreeCamera(fit,view,{x:800,y:500,width:184,height:60});
 assert.ok(focus.zoom>=.85);
 assert.ok(Math.abs((800+92)*focus.zoom+focus.x-view.width/2)<1e-8);
});

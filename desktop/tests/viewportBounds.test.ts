import {test} from 'node:test';
import assert from 'node:assert/strict';
import {visibleBounds} from '../src/viewportBounds.ts';
test('long page never centers a fixed settings dialog below the viewport',()=>{
 assert.deepEqual(visibleBounds({left:95,top:117,right:915,bottom:8000},{width:1280,height:720},{left:0,top:48,right:1280,bottom:720}),{left:95,top:117,width:820,height:603});
 assert.deepEqual(visibleBounds({left:-10,top:-500,right:950,bottom:900},{width:800,height:600}),{left:0,top:0,width:800,height:600});
});

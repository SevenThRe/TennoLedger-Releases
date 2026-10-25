import test from 'node:test';
import assert from 'node:assert/strict';
import {relicResultWindow,relicOwnershipMatches} from '../src/relicModel.ts';
test('ordinary planner results stop at 50, show-all and full inventory remove the cap',()=>{
 const rows=Array.from({length:123},(_,id)=>id);
 assert.deepEqual(relicResultWindow(rows,false,false),{items:rows.slice(0,50),limited:true});
 for(const [full,all] of [[true,false],[false,true],[true,true]])assert.deepEqual(relicResultWindow(rows,full,all),{items:rows,limited:false});
 assert.equal(relicResultWindow(rows.slice(0,50),false,false).limited,false);
});
test('missing checks all refinements and excludes unknown inventory',()=>{
 assert.equal(relicOwnershipMatches([0,0,0,0],'missing'),true);
 assert.equal(relicOwnershipMatches([0,0,1,0],'missing'),false);
 assert.equal(relicOwnershipMatches([0,null,0,0],'missing'),false);
 assert.equal(relicOwnershipMatches([null,1],'owned'),true);
 assert.equal(relicOwnershipMatches([9,1],'owned',10),false);
});

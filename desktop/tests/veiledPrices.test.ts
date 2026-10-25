import test from 'node:test';
import assert from 'node:assert/strict';
import {loadVeiledPrices} from '../src/veiledPrices.ts';
test('stacked cards share one quote and failed prices do not stop other categories',async()=>{
 const calls:string[]=[],values:Record<string,unknown>={};
 await loadVeiledPrices(['rifle','rifle','pistol','melee'],async slug=>{calls.push(slug);if(slug==='pistol')throw Error('offline');return {price:20,fetchedAt:'2026-10-24',stale:slug==='melee'};},()=>true,(slug,q)=>values[slug]=q);
 assert.deepEqual(calls,['rifle','pistol','melee']);assert.equal(values.pistol,null);
 assert.deepEqual(values.melee,{price:20,fetchedAt:'2026-10-24',stale:true});
});
test('changing platform or leaving the page discards pending quotes and remaining reads',async()=>{
 let live=true,calls=0,published=0;
 await loadVeiledPrices(['rifle','melee'],async()=>{calls++;live=false;return {price:20,fetchedAt:'2026-10-24',stale:false};},()=>live,()=>published++);
 assert.equal(calls,1);assert.equal(published,0);
});

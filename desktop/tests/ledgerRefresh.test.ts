import test from 'node:test';
import assert from 'node:assert/strict';
import {rivenInventoryRefresh} from '../src/rivenInventoryRefresh.ts';

test('a slow page read cannot replace the ledger received after a confirmed trade',async()=>{
 type Snapshot={data:{trades:string[]};stats:{count:number}};
 const pending:((snapshot:Snapshot)=>void)[]=[],shown:Snapshot[]=[];
 const reader=rivenInventoryRefresh(()=>new Promise<Snapshot>(resolve=>pending.push(resolve)),value=>shown.push(value),()=>{},()=>{});
 const page=reader.refresh(),confirmation=reader.refresh();
 pending[1]({data:{trades:['confirmed']},stats:{count:1}});await confirmation;
 pending[0]({data:{trades:[]},stats:{count:0}});await page;
 assert.deepEqual(shown,[{data:{trades:['confirmed']},stats:{count:1}}]);
});

test('failed refresh preserves the last ledger and a later retry replaces it as a whole',async()=>{
 let attempt=0;const shown:number[]=[],errors:string[]=[],loading:boolean[]=[];
 const reader=rivenInventoryRefresh(async()=>{if(++attempt===2)throw Error('database unavailable');return attempt;},value=>shown.push(value),value=>loading.push(value),value=>errors.push(value));
 await reader.refresh();await reader.refresh();
 assert.deepEqual(shown,[1]);assert.match(errors.at(-1)!,/database unavailable/);assert.equal(loading.at(-1),false);
 await reader.refresh();assert.deepEqual(shown,[1,3]);assert.equal(errors.at(-1),'');
 reader.dispose();await reader.refresh();assert.equal(attempt,3);
});

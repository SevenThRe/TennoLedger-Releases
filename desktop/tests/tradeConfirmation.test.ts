import test from 'node:test';
import assert from 'node:assert/strict';
import {TradeConfirmation} from '../src/tradeConfirmation.ts';

test('database success removes the candidate even if local confirmation storage fails',async()=>{
 const gate=new TradeConfirmation(),events:string[]=[];
 const warning=await gate.run('a',async()=>{events.push('save');},()=>events.push('receipt'),()=>{events.push('persist');throw Error('quota');});
 assert.deepEqual(events,['save','receipt','persist']);assert.match(warning!,/成交已保存/);assert.equal(gate.has('a'),true);
 assert.equal(await gate.run('a',async()=>{throw Error('duplicate');},()=>{},()=>{}),null);
});

test('confirmation suppresses concurrent opposite-side clicks without running callbacks',async()=>{
 const gate=new TradeConfirmation();let release!:()=>void,calls=0;
 const pending=gate.run('a',()=>new Promise<void>(r=>{calls++;release=r;}),()=>{},()=>{});
 assert.equal(await gate.run('a',async()=>{calls++;},()=>assert.fail(),()=>assert.fail()),null);
 assert.equal(await gate.run('b',async()=>{calls++;},()=>assert.fail(),()=>assert.fail()),null);
 release();assert.equal(await pending,'');assert.equal(calls,1);
 assert.equal(await gate.run('b',async()=>{calls++;},()=>{},()=>{}),'');assert.equal(calls,2);
});

test('database failure keeps the candidate unconfirmed and permits explicit retry',async()=>{
 const gate=new TradeConfirmation();
 await assert.rejects(gate.run('a',async()=>{throw Error('database locked');},()=>assert.fail(),()=>assert.fail()),/database locked/);
 assert.equal(gate.has('a'),false);
 assert.equal(await gate.run('a',async()=>{},()=>{},()=>{}),'');assert.equal(gate.has('a'),true);
});

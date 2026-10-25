import test from 'node:test';
import assert from 'node:assert/strict';
import {tradeStatement,tradeType} from '../src/tradeStatementModel.ts';
const trade=(name:string,side:'sale'|'purchase'='sale',platinum=10)=>({id:'test',ts:'2026-10-24T00:00:00Z',itemId:name,name,side,platinum,quantity:5,partner:'',category:'chat-confirmed'});
test('classification follows reference name precedence using canonical catalog names',()=>{
 const catalog=new Map([['中文赋能',{id:'中文赋能',name:'Arcane Energize',category:'arcane'}],['模组',{id:'模组',name:'Serration',category:'mod'}]]);
 for(const [name,type] of [['Ash Prime Set','set'],['Ash Prime','prime'],['Riven Mod','riven'],['Lith A1 Relic','relic'],['中文赋能','arcane'],['模组','mod'],['unknown','other']])assert.equal(tradeType(trade(name),catalog),type);
 assert.equal(tradeType({...trade('Ash Prime'),itemId:'/AF_Special/Riven/Ash'},catalog),'riven');
});
test('category statement sums actual totals and excludes negative net from the pie only',()=>{
 const rows=tradeStatement([trade('Ash Prime','sale',20),trade('Ash Prime','purchase',30),trade('Riven Mod','sale',40)],new Map(),'net');
 assert.equal(rows.length,7);assert.equal(rows[0].type,'riven');
 const prime=rows.find(r=>r.type==='prime')!;assert.deepEqual(prime,{type:'prime',revenue:20,expenses:30,net:-10,graphValue:0});
 const expenses=tradeStatement([trade('Ash Prime','purchase',30)],new Map(),'expenses');assert.equal(expenses[0].graphValue,30);
});

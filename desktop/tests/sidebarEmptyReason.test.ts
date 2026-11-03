import test from 'node:test';
import assert from 'node:assert/strict';
import {sidebarQuotes,sidebarEmptyReason} from '../src/sidebarQuotesModel.ts';
const order=(status:string,subtype='radiant')=>({type:'sell',subtype,visible:true,quantity:1,platinum:20,user:{status}});
test('Neo S19 radiant: four offline offers are not missing identity or intact prices',()=>{
 const rows=[...Array.from({length:4},()=>order('offline')),order('ingame','intact')];
 assert.equal(sidebarQuotes(rows,{subtype:'radiant'},true).length,0);
 assert.equal(sidebarEmptyReason(rows,{subtype:'radiant'}),'暂无在线卖家 · 4 个离线订单');
 assert.equal(sidebarQuotes(rows,{subtype:'radiant'},false).length,4);
 assert.equal(sidebarEmptyReason(rows,{subtype:'exceptional'}),'此规格暂无订单');
});
test('in-game-only filtering explains available online offers without changing filters',()=>{
 assert.equal(sidebarEmptyReason([order('online')],{subtype:'radiant'}),'暂无游戏中卖家 · 1 个在线');
});

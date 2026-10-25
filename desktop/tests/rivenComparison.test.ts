import {test} from 'node:test';
import assert from 'node:assert/strict';
import {comparableAuctions,matchingRivenTrait} from '../src/rivenComparisonModel.ts';
import {fromAuction,sampleStats,type Auction} from '../src/rivenModel.ts';
const auction:Auction={id:'a',visible:true,closed:false,starting_price:10,buyout_price:20,item:{type:'riven',weapon_url_name:'soma',name:'Test',mod_rank:8,mastery_level:12,re_rolls:0,polarity:'madurai',attributes:[{url_name:'zoom',value:10,positive:false}]}};
const target={...fromAuction(auction),id:'owned'};
test('comparison excludes other weapons, hidden, closed, duplicate and self entries before price statistics',()=>{
 const rows=[auction,auction,{...auction,id:'hidden',visible:false},{...auction,id:'closed',closed:true},{...auction,id:'owned'},{...auction,id:'other',item:{...auction.item,weapon_url_name:'torid'},buyout_price:1000}];
 const result=comparableAuctions(rows,target);
 assert.deepEqual(result.map(a=>a.id),['a']);
 assert.equal(sampleStats(result)?.median,20);
 assert.deepEqual(comparableAuctions(rows,{...target,weaponSlug:null}),[]);
});
test('trait matches require the same sign as well as attribute identifier',()=>{
 assert.equal(matchingRivenTrait(target,'zoom',false),true);
 assert.equal(matchingRivenTrait(target,'zoom',true),false);
 assert.equal(matchingRivenTrait(target,'multishot',true),false);
});

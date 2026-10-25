import test from 'node:test';
import assert from 'node:assert/strict';
import {matchesRivenStashFilters,stashListedState} from '../src/rivenStashFilterModel.ts';
import {fromAuction,type Auction} from '../src/rivenModel.ts';
const auction:Auction={id:'market-card',visible:true,closed:false,starting_price:10,buyout_price:10,item:{type:'riven',weapon_url_name:'torid',name:'Visi',mod_rank:8,mastery_level:12,re_rolls:2,polarity:'madurai',attributes:[{url_name:'damage',value:120,positive:true},{url_name:'critical_chance',value:100,positive:true}]}};
const card={...fromAuction(auction),id:'inventory-card'};
test('stash listed filters distinguish unavailable listings from confirmed absence',()=>{
 assert.equal(stashListedState(card,null,{}),null);assert.equal(stashListedState(card,[],{}),false);
 assert.equal(stashListedState(card,null,{[card.id]:'confirmed-created'}),true);
 assert.equal(matchesRivenStashFilters(card,{listed:'no'},undefined,null),false);
 assert.equal(matchesRivenStashFilters(card,{listed:'no'},undefined,false),true);
 assert.equal(stashListedState(card,[auction],{}),true);
 for(const changed of [{closed:true},{item:{...auction.item,weapon_url_name:'other'}},{item:{...auction.item,mod_rank:0}},{item:{...auction.item,re_rolls:3}}])assert.equal(stashListedState(card,[{...auction,...changed}],{}),false);
});
test('grade and reroll filters compose without mutating inventory or hiding unknown by default',()=>{
 const weapon={name:'Torid',slug:'torid',goodRolls:{goodAttrs:[{mandatory:['damage'],optional:['critical_chance']}],acceptedBadAttrs:[]}};
 const before=JSON.stringify(card);
 assert.equal(matchesRivenStashFilters(card,{grade:'Good',rolled:'yes'},weapon,false),true);
 assert.equal(matchesRivenStashFilters(card,{grade:'Perfect'},weapon,false),false);
 assert.equal(matchesRivenStashFilters(card,{rolled:'no'},weapon,false),false);
 assert.equal(matchesRivenStashFilters(card,{},undefined,null),true);
 assert.equal(matchesRivenStashFilters(card,{grade:'Good'},undefined,null),false);
 assert.equal(JSON.stringify(card),before);
});

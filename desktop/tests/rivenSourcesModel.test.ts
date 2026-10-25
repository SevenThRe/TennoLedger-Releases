import test from 'node:test';import assert from 'node:assert/strict';
import {parseRivenMarketListings,matchingRivenMarketListings,type RivenMarketListing} from '../src/rivenSourcesModel.ts';
import {defaultWanted} from '../src/rivenModel.ts';
const row:RivenMarketListing={id:'2353750',weapon:'Torid',name:'Acri',price:900,rank:8,masteryLevel:16,rerolls:438,attributes:[{code:'CritChance',value:200.5,positive:true},{code:'Corpus',value:0.6,positive:false}],source:'riven.market',link:'https://riven.market/list/PC/Torid#riven_2353750'};
test('real source fields preserve raw multiplier values; filter uses verified semantic codes',()=>{
 const parsed=parseRivenMarketListings([row]);assert.equal(parsed[0].attributes[1].value,0.6);
 const wanted={...defaultWanted,required:['critical_chance'],negative:'damage_vs_corpus',maxPrice:1000};
 assert.equal(matchingRivenMarketListings(parsed,wanted).length,1);
 assert.equal(matchingRivenMarketListings(parsed,{...wanted,maxPrice:500}).length,0);
 assert.equal(matchingRivenMarketListings(parsed,{...wanted,required:['unknown_attribute']}).length,0);
 assert.equal(parseRivenMarketListings([{...row,link:'javascript:alert(1)'},{...row,rank:9}]).length,0);
});

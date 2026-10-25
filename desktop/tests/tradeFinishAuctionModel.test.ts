import test from 'node:test';
import assert from 'node:assert/strict';
import {finishAuctionFingerprint,revalidateFinishAuction} from '../src/tradeFinishAuctionModel.ts';
const auction:any={id:'a',closed:false,visible:true,starting_price:100,buyout_price:100,item:{type:'riven',weapon_url_name:'torid',name:'Visi-crita',mod_rank:8,mastery_level:12,re_rolls:3,polarity:'madurai',attributes:[{url_name:'critical_chance',positive:true,value:100},{url_name:'multishot',positive:true,value:80}]}};
test('auction completion uses the exact reviewed instance and terms; order of attributes is irrelevant',()=>{
 assert.equal(revalidateFinishAuction(auction,[{...auction,item:{...auction.item,attributes:[...auction.item.attributes].reverse()}}]),null);
 for(const changed of [{...auction,closed:true},{...auction,buyout_price:99},{...auction,id:'b'},{...auction,item:{...auction.item,mod_rank:7}},{...auction,item:{...auction.item,attributes:[{...auction.item.attributes[0],value:101},auction.item.attributes[1]]}}])assert.ok(revalidateFinishAuction(auction,[changed]));
 assert.ok(revalidateFinishAuction(auction,[]));assert.ok(revalidateFinishAuction(auction,[auction,auction]));
});
test('an unknown or malformed instance cannot be treated as verified',()=>{assert.equal(finishAuctionFingerprint({...auction,item:{...auction.item,type:'mod'}}),null);assert.equal(finishAuctionFingerprint({...auction,item:{...auction.item,mod_rank:99}}),null);});

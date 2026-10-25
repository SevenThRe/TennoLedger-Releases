import {test} from 'node:test';import assert from 'node:assert/strict';
import {listingFromInventory,listing,listingTerms,canListMaxRank,evaluate,defaultWanted,fromAuction,sampleStats,auctionId,formatAttribute,type Riven,type Auction} from '../src/rivenModel.ts';
const r:Riven={id:'own-1',name:'Visican',weaponSlug:'torid',weaponName:'Torid',rank:8,maxRank:8,masteryLevel:12,rerolls:3,polarity:'madurai',attributes:[{slug:'multishot',name:'Multishot',value:100,positive:true},{slug:'critical_damage',name:'Critical Damage',value:120,positive:true},{slug:'zoom',name:'Zoom',value:-20,positive:false}],veiled:false,tradeable:true};
const form={direct:true,price:100,buyout:null,private:false,note:''};

test('auction create and edit share reputation, visibility and validation rules',()=>{
 const auctionForm={...form,direct:false,minReputation:50,private:true,buyout:0};
 const terms=listingTerms(auctionForm);
 assert.equal(terms.visible,false);assert.equal(terms.private,true);
 assert.equal(terms.minimal_reputation,50);assert.equal(terms.buyout_price,null);
 assert.equal(listing(r,auctionForm).minimal_reputation,50);
 assert.equal(listingTerms({...auctionForm,direct:true}).minimal_reputation,0);
 assert.equal(listingTerms({...auctionForm,private:false}).visible,true);
 for(const minReputation of [-1,1.5,NaN,10000000])assert.throws(()=>listingTerms({...auctionForm,minReputation}));
 assert.throws(()=>listingTerms({...auctionForm,buyout:99}));
 assert.throws(()=>listingTerms({...form,note:'长'.repeat(501)}));
});

test('explicit max rank listing uses decoded base weapon values and leaves the card unchanged',()=>{
 const card={...r,rank:0,attributes:r.attributes.map(a=>({...a,valuesByRank:Array.from({length:9},(_,i)=>a.value*(i+1))}))};
 assert.equal(canListMaxRank(card),true);
 const payload=listing(card,{...form,useMaxRank:true});
 assert.equal(payload.item.mod_rank,8);
 assert.equal(payload.item.attributes[0].value,900);
 assert.equal(payload.item.attributes[2].value,180);
 assert.equal(card.rank,0);assert.equal(card.attributes[0].value,100);
 assert.equal(listing(card,form).item.mod_rank,0);
 assert.equal(canListMaxRank({...r,rank:0}),false);
 assert.throws(()=>listing({...r,rank:0},{...form,useMaxRank:true}));
});
test('one click listing includes the exact owned card and explicit price',()=>{const p=listing(r,form);assert.equal(p.starting_price,100);assert.equal(p.buyout_price,100);assert.equal(p.item.re_rolls,3);assert.equal(p.item.mod_rank,8);assert.deepEqual(p.item.attributes[2],{url_name:'zoom',value:20,positive:false});assert.throws(()=>listing(r,{...form,price:0}));assert.throws(()=>listing({...r,blockedReason:'unknown attribute'},form));});
test('auctions cannot turn an unowned card into an owned listing',()=>{const a={id:'abc',visible:true,closed:false,starting_price:100,buyout_price:100,item:listing(r,form).item} as Auction;assert.throws(()=>listing(fromAuction(a),form));assert.equal(sampleStats([a,{...a,buyout_price:300},{...a,closed:true,buyout_price:9999}])?.median,200);});
test('wanted enforces required stats and budget while scoring optional ones',()=>{assert.equal(evaluate(r,{...defaultWanted,required:['critical_damage'],optional:['multishot']},100).score,110);assert.equal(evaluate(r,{...defaultWanted,required:['toxin_damage']},100).match,false);assert.equal(evaluate(r,{...defaultWanted,maxPrice:50},100).match,false);assert.equal(evaluate(r,{...defaultWanted,maxPrice:100},null).match,false);assert.equal(evaluate(r,{...defaultWanted,negative:'zoom',maxRerolls:3},100).match,true);});
test('auction links accept only the intended host and path',()=>{assert.equal(auctionId('https://warframe.market/auction/abc_123'),'abc_123');assert.throws(()=>auctionId('https://warframe.market.evil.test/auction/abc'));assert.throws(()=>auctionId('https://warframe.market/auth/signin'));});

test('faction multipliers and beneficial recoil keep their actual display meaning',()=>{assert.equal(formatAttribute({slug:'damage_vs_grineer',name:'Grineer',value:0.98,positive:false},'x'),'×0.98');assert.equal(formatAttribute({slug:'weapon_recoil',name:'Recoil',value:20,positive:true},'%'),'−20%');assert.equal(formatAttribute({slug:'zoom',name:'Zoom',value:20,positive:false},'%'),'−20%');});

test('publishing rechecks the latest owned card instead of the open detail copy',()=>{
 assert.deepEqual(listingFromInventory(r,[{...r}],form),listing(r,form));
 assert.throws(()=>listingFromInventory(r,[],form),/找不到/);
 assert.throws(()=>listingFromInventory(r,[{...r,quantity:0}],form),/找不到/);
 for(const change of [{rank:7},{rerolls:4},{name:'New roll'},{weaponSlug:'soma'},{masteryLevel:14},{polarity:'naramon'},{attributes:r.attributes.map((a,i)=>i===0?{...a,value:150}:a)}]){
  assert.throws(()=>listingFromInventory(r,[{...r,...change}],form),/重新打开/);
 }
 assert.throws(()=>listingFromInventory(r,[{...r,tradeable:false,blockedReason:'锁定'}],form),/锁定/);
 assert.throws(()=>listingFromInventory(r,[{...r,veiled:true}],form));
});
test('display label changes do not invalidate unchanged market attributes',()=>{
 const translated={...r,weaponName:'托里德',attributes:r.attributes.map(a=>({...a,name:'中文词条'}))};
 assert.deepEqual(listingFromInventory(r,[translated],form),listing(r,form));
});

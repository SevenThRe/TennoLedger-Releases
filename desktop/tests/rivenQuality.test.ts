import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compareRivens,rivenGrade,rivenPerfectness,availableRivenRanks,previewRivenAttributes,rivenLetterGrade,rivenWeaponPreview} from '../src/rivenQuality.ts';
import {listing} from '../src/rivenModel.ts';
import type {Riven} from '../src/rivenModel.ts';
const weapon={slug:'test',name:'Test',omegaAtt:1.2,goodRolls:{goodAttrs:[{mandatory:['crit'],optional:['damage','multi']}],acceptedBadAttrs:['zoom']}};
const card=(positive:string[],negative:string[]=[]):Riven=>({id:'test',name:'Test',weaponSlug:'test',rank:0,maxRank:8,masteryLevel:12,rerolls:0,polarity:'madurai',veiled:false,tradeable:true,attributes:[...positive.map(slug=>({slug,name:slug,value:1,positive:true})),...negative.map(slug=>({slug,name:slug,value:1,positive:false}))]});
test('rank preview uses exact decoded levels without changing the owned card or listing',()=>{
 const r=card(['crit','damage']);
 assert.deepEqual(availableRivenRanks(r),[0]);
 r.attributes.forEach(a=>a.valuesByRank=[1,2,3,4,5,6,7,8,9]);
 assert.equal(availableRivenRanks(r).length,9);
 assert.equal(previewRivenAttributes(r,8)[0].value,9);
 assert.equal(r.attributes[0].value,1);
 assert.equal(listing(r,{direct:true,price:10,buyout:null,private:false,note:''}).item.attributes[0].value,1);
 assert.equal(listing(r,{direct:true,price:10,buyout:null,private:false,note:''}).item.mod_rank,0);
 assert.equal(previewRivenAttributes(r,99)[0].value,1);
});
test('recommendation grades follow complete combinations and harmful negative branches',()=>{
 assert.equal(rivenGrade(card(['crit','damage'],['zoom']),weapon),'Perfect');
 assert.equal(rivenGrade(card(['crit','damage']),weapon),'Good');
 assert.equal(rivenGrade(card(['crit','damage'],['multi']),weapon),'HasPotential');
 assert.equal(rivenGrade(card(['crit','irrelevant'],['multi']),weapon),'Bad');
 assert.equal(rivenGrade(card(['crit','irrelevant'],['neutral']),weapon),'HasPotential');
 assert.equal(rivenGrade(card(['damage','multi'],['neutral']),weapon),'Good');
 assert.equal(rivenGrade(card(['irrelevant','other']),weapon),'Bad');
 assert.equal(rivenGrade(card(['crit','damage'])),'Unknown');
});
test('perfectness requires all original roll values and never guesses from displayed stats',()=>{
 const r=card(['crit','damage'],['zoom']);
 assert.equal(rivenPerfectness(r),null);
 r.attributes.forEach((a,i)=>a.rollQuality=[1,.5,0][i]);
 assert.equal(rivenPerfectness(r),.5);
 r.attributes[2].rollQuality=2;
 assert.equal(rivenPerfectness(r),null);
});
test('unknown quality stays last in both sort directions and grade rank is independent of magnitude',()=>{
 const known=card(['crit','damage'],['zoom']),unknown=card(['crit','damage']);
 known.attributes.forEach(a=>a.rollQuality=.8);
 const map=new Map([['test',weapon]]);
 for(const desc of [true,false])assert.ok(compareRivens(known,unknown,'perfectness',desc,map)<0);
 assert.ok(compareRivens(known,unknown,'grade',true,map)<0);
});

test('letter grade uses original strict thresholds and wider B band',()=>{
 assert.equal(rivenLetterGrade(0),'F');
 assert.equal(rivenLetterGrade(.025),'C-');
 assert.equal(rivenLetterGrade(.5),'B');
 assert.equal(rivenLetterGrade(.575),'B+');
 assert.equal(rivenLetterGrade(1),'S');
 assert.equal(rivenLetterGrade(null),'—');
 assert.equal(rivenLetterGrade(NaN),'—');
});

test('weapon preview leaves base weapon, rank and listing attributes untouched',()=>{
 const r=card(['crit','damage']);
 r.weaponPreviews=[{weaponId:'prime',weaponName:'Test Prime',disposition:.5,attributes:r.attributes.map(a=>({...a,value:2}))}];
 const preview=rivenWeaponPreview(r,'prime');
 assert.equal(preview.attributes[0].value,2);
 assert.equal(r.attributes[0].value,1);
 assert.equal(preview.weaponSlug,r.weaponSlug);
 assert.equal(listing(r,{direct:true,price:10,buyout:null,private:false,note:''}).item.attributes[0].value,1);
 assert.equal(rivenWeaponPreview(r,'missing'),r);
});

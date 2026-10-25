import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rivenMarketImport,rivenMarketExportUrl} from '../src/rivenMarketExport.ts';
import type {Riven} from '../src/rivenModel.ts';
const card:Riven={id:'qa',name:'Acriada',weaponName:'Amprex',weaponSlug:'amprex',rank:3,maxRank:8,masteryLevel:13,rerolls:2,polarity:'vazarin',veiled:false,tradeable:true,attributes:[{slug:'critical_damage',name:'Critical Damage',value:50.5,positive:true},{slug:'damage_vs_infested',name:'Damage to Infested',value:1.04,positive:true},{slug:'zoom',name:'Zoom',value:-12.5,positive:false}]};
test('Riven.market payload preserves actual rank and faction multipliers with original field names',()=>{
 const payload=rivenMarketImport(card,'Amprex');
 assert.deepEqual(payload,{weaponData:'Amprex',Rank:3,MR:13,Rolls:2,name:null,Positives:{CritDmg:'50.5',Infested:'1.04'},Negatives:{Zoom:'12.5'}});
 const url=new URL(rivenMarketExportUrl(card,'Arum Spinosa'));
 assert.equal(url.origin,'https://riven.market');assert.equal(url.pathname,'/sell');
 const decoded=JSON.parse(Buffer.from(url.searchParams.get('import')!,'base64').toString('utf8'));
 assert.equal(decoded.weaponData,'Arum_Spinosa');assert.equal(decoded.Rank,3);
 assert.equal(card.rank,3);
});
test('distinct new traits do not collide through old prefix/suffix placeholders',()=>{
 const attributes=['chance_to_gain_extra_combo_count','heavy_attack_wind_up_speed','slam_attack_damage'].map(slug=>({slug,name:slug,value:10,positive:true}));
 assert.deepEqual(rivenMarketImport({...card,attributes},'Soma').Positives,{ComboGainExtra:'10',HeavyAttackWindUpSpeed:'10',SlamAttackDamage:'10'});
 assert.throws(()=>rivenMarketImport({...card,veiled:true},'Soma'));
 assert.throws(()=>rivenMarketImport({...card,attributes:[{slug:'unknown',name:'Unknown',value:1,positive:true}]},'Soma'));
});

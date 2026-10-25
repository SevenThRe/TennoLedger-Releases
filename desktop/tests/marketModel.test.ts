import test from 'node:test';
import assert from 'node:assert/strict';
import {marketGoodPrices,marketSuggestedPrice,marketTradeQuotes,loadOrderQuotes,marketCatalogResolver,marketOrderQuotes,marketDisplayName,orderOwned,orderLowest,orderQuoteKey,marketWhisper,orderUnitPrice,ordersValue} from '../src/marketModel.ts';

test('market rankings resolve official catalog names by game identity and retain set semantics',()=>{
 const resolve=marketCatalogResolver([{id:'hammer',name:'Hammer Shot',zh:'重锤射击'},{id:'okina',name:'Okina Prime',zh:'翁 Prime'}]);
 const hammer={slug:'different_market_alias',gameRef:'hammer',i18n:{en:{name:'Hammer Shot'}}};
 assert.equal(marketDisplayName(hammer,resolve(hammer)),'重锤射击');
 const set={slug:'okina_prime_set',i18n:{en:{name:'Okina Prime Set'}}};
 assert.equal(marketDisplayName(set,resolve(set)),'翁 Prime 套装');
 assert.equal(marketDisplayName(set,resolve(set),'en'),'Okina Prime Set');
 assert.equal(marketDisplayName({slug:'unknown',i18n:{en:{name:'Unmapped'}}},undefined),'Unmapped');
 assert.equal(marketDisplayName({i18n:{en:{name:'Item'},'zh-hans':{name:' '},'zh-cn':{name:'中文'}}},undefined),'中文');
});
test('set count uses tradable blueprints and required duplicate parts, not crafted ownership',()=>{
 const local={id:'frame'},sources={items:{frame:{parts:[{itemId:'bp',quantity:1},{itemId:'blade',quantity:2}]}}};
 const snapshot={complete:true,counts:{frame:5,bp:3,blade:5}};
 assert.equal(orderOwned({slug:'frame_set'},local,snapshot,sources),2);
 assert.equal(orderOwned({slug:'frame_set'},local,{complete:true,counts:{frame:5}},sources),0);
 assert.equal(orderOwned({slug:'frame_set'},local,{complete:false,counts:{bp:3}},sources),null);
});
test('veiled companion rivens sum stacks and exclude revealed rivens',()=>{
 const snapshot={complete:true,counts:{},rivens:[{name:'Companion Weapon Riven Mod',veiled:true,quantity:3},{name:'Companion Weapon Riven Mod',veiled:true,quantity:1},{name:'Companion Weapon Riven Mod',veiled:false,quantity:2}]};
 assert.equal(orderOwned({slug:'companion_weapon_riven_mod_veiled'},undefined,snapshot,null),4);
 assert.equal(orderOwned({gameRef:'missing'},undefined,snapshot,null),0);
 assert.equal(orderOwned({slug:'unmapped'},undefined,snapshot,null),null);
});
test('non-Prime weapon sets use component recipes and exclude materials',()=>{
 const local={id:'furax',prime:false,recipe:{parts:[{itemId:'/Lotus/Types/Recipes/Weapons/FuraxBlueprint',quantity:1},{itemId:'/Lotus/Types/Recipes/Weapons/WeaponParts/FuraxHand',quantity:2},{itemId:'/Lotus/Types/Items/Cell',quantity:5}]}};
 assert.equal(orderOwned({slug:'furax_wraith_set'},local,{complete:true,counts:{'/Lotus/Types/Recipes/Weapons/FuraxBlueprint':3,'/Lotus/Types/Recipes/Weapons/WeaponParts/FuraxHand':5}},{}),2);
});
test('quotes match rank and exclude offline, hidden, empty and buy orders',()=>{
 const base={type:'sell',visible:true,quantity:1,user:{status:'ingame'},rank:10,platinum:100};
 assert.equal(orderLowest([base,{...base,rank:0,platinum:1},{...base,user:{status:'offline'},platinum:2},{...base,visible:false,platinum:3},{...base,quantity:0,platinum:4},{...base,type:'buy',platinum:5}],10),100);
 assert.equal(orderLowest([],0),null);
 assert.notEqual(orderQuoteKey({itemId:'x',rank:0}),orderQuoteKey({itemId:'x',rank:10}));
});

test('automatic comparison separates refinement, charges and socketed stars',()=>{
 const base={itemId:'same',type:'sell',visible:true,quantity:6,platinum:60,perTrade:6,user:{status:'ingame'}};
 for(const field of ['subtype','charges','amberStars','cyanStars']){
  const value=field==='subtype'?'radiant':3,other=field==='subtype'?'intact':0;
  const target={...base,[field]:value};
  assert.notEqual(orderQuoteKey(target),orderQuoteKey({...base,[field]:other}));
  assert.equal(orderLowest([target,{...base,[field]:other,platinum:1},{...base,platinum:2}],target),10);
  assert.equal(orderLowest([{...base,[field]:other}],target),null);
 }
});
test('order comparison excludes invalid bundles and uses the unit price',()=>{
 const base={type:'sell',visible:true,quantity:6,platinum:60,perTrade:6,user:{status:'online'}};
 assert.equal(orderLowest([base,{...base,perTrade:1,platinum:15}],{}),10);
 for(const perTrade of [0,-1,1.5,7])assert.equal(orderLowest([{...base,perTrade}],{}),null);
 assert.equal(orderQuoteKey({itemId:'x'}),orderQuoteKey({itemId:'x',rank:0}));
});

test('ordinary market whispers preserve bundle, direction and variant details',()=>{
 const q={type:'sell',quantity:12,perTrade:6,platinum:60,subtype:'radiant',user:{ingameName:'Trader'}};
 assert.equal(marketWhisper('Lith A1 Relic',q),'/w Trader Hi! I want to buy: x6 "Lith A1 Relic (radiant)" for 60 platinum. (warframe.market)');
 assert.match(marketWhisper('Mod',{...q,type:'buy',perTrade:1,subtype:undefined,rank:10}),/sell: "Mod \(rank 10\)"/);
 assert.match(marketWhisper('Sculpture',{...q,subtype:undefined,amberStars:2,cyanStars:3}),/2 amber stars, 3 cyan stars/);
 for(const change of [{perTrade:0},{perTrade:13},{type:'other'},{user:{ingameName:'bad name'}},{platinum:NaN}])assert.throws(()=>marketWhisper('Item',{...q,...change}));
});

test('order totals value remaining units without multiplying the bundle price again',()=>{
 const bulk={type:'sell',quantity:12,perTrade:6,platinum:60};
 assert.equal(orderUnitPrice(bulk),10);
 assert.equal(ordersValue([bulk,{type:'sell',quantity:2,platinum:15},{...bulk,type:'buy'}],'sell'),150);
 assert.equal(ordersValue([{...bulk,perTrade:0}],'sell'),null);
 assert.equal(ordersValue([],'sell'),0);
});

test('market display uses Chinese labels while preserving English protocol names',()=>{
 const item={slug:'constitution',i18n:{en:{name:'Constitution'}}};
 assert.equal(marketDisplayName(item,{zh:'百折不挠'}),'百折不挠');
 assert.equal(marketDisplayName(item,{zh:'百折不挠'},'en'),'Constitution');
 assert.equal(marketDisplayName({slug:'garuda_prime_set',i18n:{en:{name:'Garuda Prime Set'}}},{zh:'Garuda Prime'}),'Garuda Prime 套装');
 assert.equal(marketDisplayName({slug:'companion_weapon_riven_mod_veiled'},undefined),'同伴武器紫卡（未揭示）');
 assert.equal(marketDisplayName(item,{zh:'�'}),'百折不挠');
 assert.equal(marketDisplayName({...item,i18n:{...item.i18n,'zh-hans':{name:'市场中文'}}},{zh:'目录中文'}),'市场中文');
 assert.equal(item.i18n.en.name,'Constitution');
});

test('quote list follows selected variant and sorts both sides by unit price',()=>{
 const q={type:'sell',quantity:12,platinum:60,perTrade:6,subtype:'radiant',user:{status:'ingame'}};
 const rows=[{...q,id:'single',perTrade:1,platinum:15},{...q,id:'bulk'},{...q,id:'intact',subtype:'intact'},{...q,id:'buy-low',type:'buy',platinum:30},{...q,id:'buy-high',type:'buy',platinum:54},{...q,id:'offline',user:{status:'offline'}}];
 assert.deepEqual(marketOrderQuotes(rows,{subtype:'radiant'}).map(r=>r.id),['bulk','single','buy-high','buy-low']);
 assert.deepEqual(marketOrderQuotes(rows,{subtype:'intact'}).map(r=>r.id),['intact']);
 assert.equal(rows[0].id,'single');
});

test('indexed catalog resolution preserves ID, explicit mapping, name and set fallback priority',()=>{
 const a={id:'a',name:'Alpha'},b={id:'b',name:'Beta'},c={id:'c',name:'Alpha'};
 const resolve=marketCatalogResolver([a,b,c],{a:'beta'});
 assert.equal(resolve({gameRef:'b',slug:'beta'}),b);
 assert.equal(resolve({slug:'beta'}),a);
 assert.equal(resolve({slug:'alpha'}),c);
 assert.equal(resolve({i18n:{en:{name:'Alpha'}}}),c);
 assert.equal(resolve({slug:'alpha_set'}),c);
 assert.equal(resolve({slug:'unknown'}),undefined);
 assert.equal(marketCatalogResolver([a,{id:'a',name:'Other'}])({gameRef:'a'}),a);
});

test('order quote loader shares books across variants and isolates failed items',async()=>{
 const rows=[{itemId:'a',rank:0},{itemId:'a',rank:5},{itemId:'a',rank:0},{itemId:'bad'},{itemId:'b'},{itemId:'missing'}];
 const calls:string[]=[],result:Record<string,unknown>={};
 await loadOrderQuotes(rows,r=>r.itemId==='missing'?undefined:r.itemId,async slug=>{calls.push(slug);if(slug==='bad')throw Error('offline');return [0,5].map(rank=>({rank,type:'sell',quantity:1,platinum:10+rank,user:{status:'ingame'}}));},values=>Object.assign(result,values),()=>true);
 assert.deepEqual(calls,['a','bad','b']);
 assert.equal(result[orderQuoteKey(rows[0])],10);
 assert.equal(result[orderQuoteKey(rows[1])],15);
 assert.equal(result[orderQuoteKey(rows[3])],'error');
 assert.equal(result[orderQuoteKey(rows[4])],10);
 assert.equal(result[orderQuoteKey(rows[5])],'error');
});
test('obsolete order quote load neither publishes nor starts remaining books',async()=>{
 let live=true;const calls:string[]=[],published:unknown[]=[];
 await loadOrderQuotes([{itemId:'a'},{itemId:'b'}],r=>r.itemId,async slug=>{calls.push(slug);live=false;return [];},value=>published.push(value),()=>live);
 assert.deepEqual(calls,['a']);assert.deepEqual(published,[]);
});

test('trade panel matches reference ingame English-market pool without changing valuation policy',()=>{
 const q={type:'sell',quantity:12,platinum:60,perTrade:6,rank:0,user:{status:'ingame',locale:'en'}};
 const rows=[{...q,id:'bulk'},{...q,id:'single',perTrade:1,platinum:11},
  {...q,id:'online',platinum:6,user:{status:'online',locale:'en'}},
  {...q,id:'other-locale',platinum:12,user:{status:'ingame',locale:'zh-hans'}},
  {...q,id:'missing-locale',user:{status:'ingame'}},
  {...q,id:'ranked',rank:5},{...q,id:'hidden',visible:false},
  {...q,id:'buy-low',type:'buy',platinum:30},{...q,id:'buy-high',type:'buy',platinum:54}];
 assert.deepEqual(marketTradeQuotes(rows,{}).map(r=>r.id),['bulk','single','buy-high','buy-low']);
 assert.equal(orderLowest(rows,{}),1);
 assert.deepEqual(marketTradeQuotes([{...q,user:{status:'offline',locale:'en'}},null] as any,{}),[]);
});

test('new trade price follows reference first sell quote and stays blank when unavailable',()=>{
 const q={type:'sell',quantity:12,platinum:60,perTrade:6,user:{status:'ingame',locale:'en'}};
 assert.equal(marketSuggestedPrice([q,{...q,perTrade:1,platinum:15}],{}),60);
 assert.equal(marketSuggestedPrice([{...q,perTrade:1,platinum:15}],{}),15);
 for(const rows of [[],[{...q,type:'buy'}],[{...q,rank:5}],[{...q,user:{status:'online',locale:'en'}}]])assert.equal(marketSuggestedPrice(rows,{}),'');
});

test('reference good-price marker includes equal or higher buy display prices only',()=>{
 const sell={type:'sell',platinum:20},low={type:'buy',platinum:19},equal={type:'buy',platinum:20},high={type:'buy',platinum:21};
 assert.deepEqual([...marketGoodPrices([sell,high,equal,low])],[high,equal]);
 assert.equal(marketGoodPrices([high]).size,0);assert.equal(marketGoodPrices([]).size,0);
 // Preserve the reference display-price comparison, not an inferred arbitrage rule.
 assert.equal(marketGoodPrices([{...sell,perTrade:6},{...low,platinum:10,perTrade:1}]).size,0);
});

test('mod order ownership uses exact rank and never substitutes aggregate counts',()=>{
 const m={maxRank:10,gameRef:'/Lotus/Mod'},local={category:'mod'};
 const snapshot={counts:{'/Lotus/Mod':22},complete:true,upgradeCountsByRank:{'/Lotus/Mod':{0:20,5:1,10:1}}};
 assert.equal(orderOwned(m,local,snapshot,null,{rank:0}),20);
 assert.equal(orderOwned(m,local,snapshot,null,{rank:10}),1);
 assert.equal(orderOwned(m,local,snapshot,null,{rank:3}),0);
 assert.equal(orderOwned(m,local,{...snapshot,upgradeCountsByRank:null},null,{rank:10}),null);
 assert.equal(orderOwned(m,local,{...snapshot,upgradeCountsByRank:{'/Lotus/Mod':null}},null,{rank:0}),null);
 assert.equal(orderOwned(m,local,{...snapshot,upgradeCountsByRank:{}},null,{rank:0}),0);
});

test('arcane order counts match rank rather than aggregate copies or fusion cost',()=>{
 const id='/Lotus/Upgrades/CosmeticEnhancers/Utility/GolemArcaneRadialEnergyOnEnergyPickup';
 const market={maxRank:5,gameRef:id},local={category:'arcane'};
 const snapshot={counts:{[id]:23},complete:true,upgradeCountsByRank:{[id]:{0:21,3:1,5:1}}};
 assert.equal(orderOwned(market,local,snapshot,null,{rank:5}),1);
 assert.equal(orderOwned(market,local,snapshot,null,{rank:0}),21);
 assert.equal(orderOwned(market,local,snapshot,null,{rank:4}),0);
 assert.equal(orderOwned({...market,tags:['arcane']},undefined,snapshot,null,{rank:3}),1);
 assert.equal(orderOwned(market,local,{...snapshot,upgradeCountsByRank:undefined},null,{rank:5}),null);
 assert.equal(orderOwned(market,local,snapshot,null,{rank:6}),null);
});

export type InventoryFilters=Record<string,string>;
export type InventoryFacts={itemOwned:boolean|null;copies:number|null;vaulted:boolean|null;listed:number|null;prime:boolean|null;favorite:boolean|null;price:number|null;completeSet:boolean|null;equipped?:boolean|null;rank?:number|null};
export function matchesInventoryFilters(filters:InventoryFilters,f:InventoryFacts){
 for(const [key,value] of Object.entries(filters)){
  if(!value)continue;
  const actual=key==='itemOwned'?f.itemOwned:key==='moreThanOneCopies'?f.copies===null?null:f.copies>1:key==='vaulted'?f.vaulted:key==='orderPlaced'?f.listed===null?null:f.listed>0:key==='partType'?f.prime:key==='favorite'?f.favorite:key==='completeSet'?f.completeSet:key==='equipped'?f.equipped??null:key==='leveledUp'?f.rank==null?null:f.rank>0:null;
  if(key==='minPlat'){if(f.price===null||f.price<=Number(value))return false;continue;}
  if(actual===null||actual!==(value==='yes'||value==='prime'))return false;
 }
 return true;
}
export type InventoryFilterGroup={key:string;zh:string;en:string;types?:string[];options:[string,string,string][]};
export const inventoryFilterGroups:InventoryFilterGroup[]=[
 {key:'itemOwned',zh:'成品状态',en:'Resulting item',types:['component','sets'],options:[['yes','已拥有 / 已精通','Owned / mastered'],['no','未拥有或精通','Not owned or mastered']]},
 {key:'moreThanOneCopies',zh:'拥有数量',en:'Copies owned',options:[['yes','多于一份','More than one'],['no','最多一份','At most one']]},
 {key:'vaulted',zh:'入库状态',en:'Vault status',types:['component','relics','sets'],options:[['yes','已入库','Vaulted'],['no','未入库','Unvaulted']]},
 {key:'orderPlaced',zh:'市场订单',en:'Market order',options:[['yes','已挂单','Listed'],['no','未挂单','Not listed']]},
 {key:'partType',zh:'部件类型',en:'Part type',types:['component','sets'],options:[['normal','普通','Non-prime'],['prime','Prime','Prime']]},
 {key:'favorite',zh:'收藏',en:'Favorites',options:[['yes','仅收藏','Favorites only'],['no','排除收藏','Exclude favorites']]},
 {key:'minPlat',zh:'最低卖价',en:'Minimum sell price',options:[['5','>5','>5'],['10','>10','>10'],['15','>15','>15']]},
 {key:'completeSet',zh:'套装完整度',en:'Set completion',types:['component','sets'],options:[['yes','完整套装','Complete sets'],['no','不完整套装','Incomplete sets']]},
 {key:'equipped',zh:'装备状态',en:'Equipped',types:['mod'],options:[['yes','已装备','Equipped'],['no','未装备','Not equipped']]},
 {key:'leveledUp',zh:'等级',en:'Rank',types:['mod','arcane'],options:[['yes','已升级','Ranked up'],['no','未升级','Unranked']]},
];
export const availableInventoryGroups=(category:string,arcaneProgress=false)=>category==='resource'?[]:inventoryFilterGroups.filter(group=>(!arcaneProgress||group.key==='favorite')&&(!group.types||group.types.includes(category)));

/** Keep only filters that the newly selected category can actually apply. */
export function inventoryCategoryFilters(filters:InventoryFilters,category:string,arcaneProgress=false):InventoryFilters{
 const groups=availableInventoryGroups(category,arcaneProgress);
 return Object.fromEntries(Object.entries(filters).filter(([key,value])=>groups.some(group=>group.key===key&&group.options.some(option=>option[0]===value))));
}
export function inventoryCategoryOrder(order:string,category:string){
 return (['name','platPrice','amount',...(category==='component'?['ducats','ducanator']:[]),...(category==='sets'?['complete']:[])]).includes(order)?order:'amount';
}

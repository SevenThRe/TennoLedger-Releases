export type VendorItem={id:string;name:string;zh:string;image:string;imageUrl?:string;category:string};
export const vendorId=(id:string)=>id.replace('/StoreItems/','/');
export function vendorGroup(item:VendorItem|undefined,id:string){if(item?.category==='mod'||id.includes('/Mods/'))return 'mods';if(['primary','secondary','melee','archgun','archmelee'].includes(item?.category??''))return 'weapons';if(item?.category==='cosmetic'||id.includes('/Skins/'))return 'cosmetics';return 'other';}
export type VendorOffer={itemId:string;expiry:string;quantity:number;prices:{itemId:string;quantity:number}[];purchaseLimit:number|null;element:string|null;bonusPercent:number|null};
export type VendorSnapshot={id:string;capturedAt:string;expiry:string|null;offers:VendorOffer[];error:string|null};
export const currencyIds={steel:'/Lotus/Types/Items/MiscItems/SteelEssence',holokey:'/Lotus/Types/Items/MiscItems/GranumBucks',coda:'/Lotus/Types/Items/MiscItems/CodaWeaponBucks'};
// WFCD warframe-worldstate-data 3.18.1 / SteelPathOffering parser epoch 2020-11-16 UTC.
export const steelRotation=[
 {name:'Umbra Forma Blueprint',zh:'Umbra Forma 蓝图',cost:150,match:'Umbra Forma'},
 {name:'50,000 Kuva',zh:'50,000 赤毒',cost:55,match:'Kuva'},
 {name:'Kitgun Riven Mod',zh:'组合枪紫卡',cost:75,match:'Kitgun Riven'},
 {name:'3 × Forma',zh:'3 × Forma',cost:75,match:'Forma'},
 {name:'Zaw Riven Mod',zh:'Zaw 紫卡',cost:75,match:'Zaw Riven'},
 {name:'30,000 Endo',zh:'30,000 内融核心',cost:150,match:'Endo'},
 {name:'Rifle Riven Mod',zh:'步枪紫卡',cost:75,match:'Rifle Riven'},
 {name:'Shotgun Riven Mod',zh:'霰弹枪紫卡',cost:75,match:'Shotgun Riven'},
];
const steelEpoch=Date.parse('2020-11-16T00:00:00Z'),week=604800000;
export function steelWeek(now:number){const index=Math.floor((now-steelEpoch)/week);return {index:((index%8)+8)%8,activation:new Date(steelEpoch+index*week).toISOString(),expiry:new Date(steelEpoch+(index+1)*week).toISOString()};}
export function vendorExpired(v:VendorSnapshot|undefined,now:number){return !v?.expiry||!Number.isFinite(Date.parse(v.expiry))||Date.parse(v.expiry)<=now;}
export function affordable(offer:VendorOffer,snapshot:{complete:boolean;counts:Record<string,number>}|null):boolean|null{
 if(!snapshot)return null;let unknown=false;
 for(const p of offer.prices){const n=snapshot.counts[p.itemId]??(snapshot.complete?0:null);if(n==null)unknown=true;else if(n<p.quantity)return false;}
 return unknown?null:true;
}

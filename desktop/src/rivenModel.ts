export type RivenAttribute={slug:string;name:string;value:number;positive:boolean;rollQuality?:number|null;valuesByRank?:number[]|null;rangesByRank?:[number,number][]|null};
export type RivenWeaponPreview={weaponId:string;weaponName:string;disposition:number;attributes:RivenAttribute[]};
export type RivenChallenge={id:string;group:string;description:string;progress:number|null;required:number|null};
export type Riven={quantity?:number;challenge?:RivenChallenge|null;weaponPreviews?:RivenWeaponPreview[];id:string;name:string;weaponSlug?:string|null;weaponName?:string|null;category?:string|null;rank:number;maxRank:number;masteryLevel:number;rerolls:number;polarity:string;attributes:RivenAttribute[];veiled:boolean;tradeable:boolean;blockedReason?:string|null};
export type Wanted={weaponSlug:string;required:string[];optional:string[];negative:string;maxPrice:number|null;maxRerolls:number|null;maxMastery:number|null;minPrice?:number|null;minRerolls?:number|null;minSimilarity?:number|null;negativeRequired?:boolean;negativeOptional?:boolean};
export type Auction={id:string;visible:boolean;closed:boolean;starting_price:number;buyout_price:number|null;private?:boolean;minimal_reputation?:number;note?:string;item:{type:string;weapon_url_name:string;name:string;mod_rank:number;mastery_level:number;re_rolls:number;polarity:string;attributes:{url_name:string;value:number;positive:boolean}[]};owner?:{ingame_name:string;status:string;id?:string}};
export type RivenCatalog={weapons:{omegaAtt?:number;id?:string;slug:string|null;name:string;category?:string;goodRolls?:{goodAttrs:{mandatory:string[];optional:string[]}[];acceptedBadAttrs:string[]}}[];attributes:{slug:string;name:string;positiveOnly?:boolean;negativeOnly?:boolean;displayUnit?:string}[]};
export const defaultWanted:Wanted={weaponSlug:'torid',required:[],optional:[],negative:'',maxPrice:null,maxRerolls:null,maxMastery:null};
export function evaluate(r:Riven,w:Wanted,price:number|null=null){const pos=new Set(r.attributes.filter(a=>a.positive).map(a=>a.slug)),neg=new Set(r.attributes.filter(a=>!a.positive).map(a=>a.slug));const reasons:string[]=[];if(w.weaponSlug&&r.weaponSlug!==w.weaponSlug)reasons.push('武器不符');for(const a of w.required)if(!pos.has(a))reasons.push('缺少必选词条：'+a);if(w.negative&&!w.negativeOptional&&!neg.has(w.negative))reasons.push('负词条不符');if(w.negativeRequired&&!neg.size)reasons.push('需要负词条');if(w.minRerolls!=null&&r.rerolls<w.minRerolls)reasons.push('洗练次数低于下限');if(w.minPrice!=null&&(price==null||price<w.minPrice))reasons.push('价格低于下限或未知');if((w.minSimilarity??0)>0)reasons.push('此来源未提供原版匹配度');if(w.maxRerolls!=null&&r.rerolls>w.maxRerolls)reasons.push('洗练次数超限');if(w.maxMastery!=null&&r.masteryLevel>w.maxMastery)reasons.push('段位要求超限');if(w.maxPrice!=null&&(price==null||price>w.maxPrice))reasons.push(price==null?'没有一口价':'价格超预算');const matched=w.optional.filter(a=>pos.has(a)).length;return {match:!reasons.length,reasons,matched,score:reasons.length?0:100+matched*10};}
export function fromAuction(a:Auction,names:Record<string,string>={}):Riven{return {id:a.id,name:a.item.name,weaponSlug:a.item.weapon_url_name,weaponName:a.item.weapon_url_name,rank:a.item.mod_rank,maxRank:8,masteryLevel:a.item.mastery_level,rerolls:a.item.re_rolls,polarity:a.item.polarity,attributes:a.item.attributes.map(x=>({slug:x.url_name,name:names[x.url_name]??x.url_name,value:x.value,positive:x.positive})),veiled:false,tradeable:false,blockedReason:'市场中的紫卡不属于本地库存'};}
export type ListingForm={direct:boolean;price:number;buyout:number|null;private:boolean;note:string;minReputation?:number;useMaxRank?:boolean};
export function listingTerms(form:ListingForm){
 if(!Number.isInteger(form.price)||form.price<1||form.price>900000)throw Error('请输入有效白金价格');
 const buyout=form.direct?form.price:form.buyout===0?null:form.buyout;
 if(buyout!=null&&(!Number.isInteger(buyout)||buyout<form.price||buyout>900000))throw Error('一口价须为不低于起拍价的有效白金价格');
 const reputation=form.direct?0:form.minReputation??0;
 if(!Number.isInteger(reputation)||reputation<0||reputation>9999999)throw Error('最低声望须为有效的非负整数');
 if([...form.note].length>500)throw Error('描述不能超过 500 字');
 return {visible:!form.private,starting_price:form.price,buyout_price:buyout,minimal_reputation:reputation,private:form.private,note:form.note};
}
export function canListMaxRank(r:Riven){return r.rank===8||(r.attributes.length>0&&r.attributes.every(a=>a.valuesByRank?.length===9&&Number.isFinite(a.valuesByRank[8])));}
export function listing(r:Riven,form:ListingForm){
 if(r.veiled||!r.tradeable||r.blockedReason||!r.weaponSlug)throw Error(r.blockedReason||'紫卡数据不完整，无法挂售');
 if(!r.attributes.length||r.attributes.some(a=>!a.slug||!Number.isFinite(a.value)))throw Error('词条数据不完整');
 if(form.useMaxRank&&!canListMaxRank(r))throw Error('缺少完整的 8 级词条数据');
 const rank=form.useMaxRank?8:r.rank;
 return {...listingTerms(form),item:{type:'riven',weapon_url_name:r.weaponSlug,name:r.name,mastery_level:r.masteryLevel,mod_rank:rank,re_rolls:r.rerolls,polarity:r.polarity,attributes:r.attributes.map(a=>({url_name:a.slug,value:Math.abs(rank===r.rank?a.value:a.valuesByRank![rank]),positive:a.positive}))}};
}
export function listingFromInventory(selected:Riven,owned:Riven[],form:ListingForm){
 const current=owned.find(r=>r.id===selected.id);
 if(!current||(current.quantity??1)<1)throw Error('当前库存中已找不到这张紫卡，请刷新库存');
 const payload=listing(current,form);
 if(JSON.stringify(payload.item)!==JSON.stringify(listing(selected,form).item))throw Error('紫卡数据已更新，请重新打开详情核对后挂售');
 return payload;
}
export function sampleStats(auctions:Auction[]){const prices=auctions.filter(a=>!a.closed&&a.visible&&Number.isFinite(a.buyout_price)&&a.buyout_price!>0).map(a=>a.buyout_price!).sort((a,b)=>a-b);const n=prices.length;return n?{count:n,min:prices[0],median:n%2?prices[(n-1)/2]:(prices[n/2-1]+prices[n/2])/2}:null;}
export function auctionId(input:string){if(/^[a-zA-Z0-9_-]{1,100}$/.test(input))return input;try{const u=new URL(input);if(u.protocol!=='https:'||u.hostname!=='warframe.market')throw Error();const id=u.pathname.match(/^\/auction\/([a-zA-Z0-9_-]{1,100})\/?$/)?.[1];if(id)return id;}catch{}throw Error('请输入有效 Warframe Market 紫卡链接或 ID');}

export function formatAttribute(a:RivenAttribute,unit=''){if(unit==='x')return `×${a.value}`;const v=(['weapon_recoil','recoil'].includes(a.slug)?!a.positive:a.positive)?Math.abs(a.value):-Math.abs(a.value);return `${v>=0?'+':'−'}${Math.abs(v)}${unit}`;}

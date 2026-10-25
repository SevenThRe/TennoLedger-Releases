import type {Auction} from './rivenModel.ts';
export function finishAuctionFingerprint(auction:Auction){
 const i=auction.item;
 if(!auction.id||typeof auction.closed!=='boolean'||typeof auction.visible!=='boolean'||!Number.isSafeInteger(auction.starting_price)||auction.starting_price<1||!i||i.type!=='riven'||!i.weapon_url_name||!i.name||!Number.isSafeInteger(i.mod_rank)||i.mod_rank<0||i.mod_rank>8||!Number.isSafeInteger(i.mastery_level)||i.mastery_level<8||i.mastery_level>18||!Number.isSafeInteger(i.re_rolls)||i.re_rolls<0||!Array.isArray(i.attributes)||i.attributes.length<2||i.attributes.length>4||i.attributes.some(a=>!a.url_name||!Number.isFinite(a.value)||typeof a.positive!=='boolean'))return null;
 return JSON.stringify([auction.id,auction.closed,auction.visible,auction.private??null,auction.starting_price,auction.buyout_price,auction.note??'',auction.minimal_reputation??0,i.weapon_url_name,i.name,i.mod_rank,i.mastery_level,i.re_rolls,i.polarity,[...i.attributes].sort((a,b)=>a.url_name.localeCompare(b.url_name)).map(a=>[a.url_name,a.value,a.positive])]);
}
export function parseFinishAuctions(value:unknown){
 if(!Array.isArray(value))throw Error('挂售响应格式变化');
 let unverified=0;const rows:Auction[]=[];
 for(const item of value){if(!item||typeof item!=='object'||item.item?.type!=='riven')continue;if(finishAuctionFingerprint(item))rows.push(item);else unverified++;}
 return {rows,unverified};
}
export function revalidateFinishAuction(planned:Auction,latest:readonly Auction[]):string|null{
 const rows=latest.filter(a=>a.id===planned.id);
 if(rows.length!==1||rows[0].closed)return '紫卡挂售已结束、消失或返回不明确，请刷新核对';
 const expected=finishAuctionFingerprint(planned);return expected&&expected===finishAuctionFingerprint(rows[0])?null:'紫卡挂售的物品或条款已变化，请重新核对';
}

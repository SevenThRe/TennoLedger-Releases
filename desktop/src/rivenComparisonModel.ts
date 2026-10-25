import type {Auction,Riven} from './rivenModel.ts';

export function comparableAuctions(rows:Auction[],target:Riven):Auction[] {
 if(!target.weaponSlug)return [];
 const seen=new Set<string>();
 return rows.filter(a=>a.item?.type==='riven'&&a.item.weapon_url_name===target.weaponSlug
  &&!a.closed&&a.visible!==false&&a.id!==target.id&&!seen.has(a.id)&&!!seen.add(a.id));
}
export function matchingRivenTrait(target:Riven,slug:string,positive:boolean):boolean {
 return target.attributes.some(a=>a.slug===slug&&a.positive===positive);
}

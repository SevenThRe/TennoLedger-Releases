import type {Sources} from './masteryModel';
export function parseMasterySources(value:unknown):Sources{
 const record=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v);
 if(!record(value)||!record(value.items)||!record(value.marketSlugs))throw Error('Invalid mastery sources');
 if(!Object.values(value.marketSlugs).every(v=>typeof v==='string'&&v.length>0))throw Error('Invalid market mapping');
 for(const item of Object.values(value.items)){
  if(!record(item)||!Array.isArray(item.parts)||!item.parts.every((p:unknown)=>record(p)
   &&typeof p.itemId==='string'&&p.itemId.length>0&&Number.isInteger(p.quantity)&&p.quantity>0
   &&(p.ownedItemId===undefined||typeof p.ownedItemId==='string')&&Array.isArray(p.drops)
   &&p.drops.every((d:unknown)=>record(d)&&typeof d.relicId==='string'&&d.relicId.length>0&&Number.isFinite(d.chance)&&d.chance>=0&&d.chance<=1)))throw Error('Invalid mastery component data');
 }
 return value as Sources;
}

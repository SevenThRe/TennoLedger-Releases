import type {Riven, RivenCatalog} from './rivenModel.ts';

export type RivenWeapon = {id:string;name:string;zh?:string;image?:string;imageUrl?:string;category:string};
const key = (value?:string|null) => (value ?? '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

export function rivenWeaponResolver(items:RivenWeapon[], catalog:RivenCatalog) {
 const byId = new Map(items.map(item => [item.id, item]));
 const byName = new Map(items.map(item => [key(item.name), item]));
 const bySlug = new Map(catalog.weapons.filter(item => item.slug).map(item => [item.slug, item]));
 return (riven:Pick<Riven,'weaponSlug'|'weaponName'|'veiled'>) => {
  if (riven.veiled) return undefined;
  const entry = riven.weaponSlug ? bySlug.get(riven.weaponSlug) : undefined;
  return (entry?.id ? byId.get(entry.id) : undefined)
   ?? [entry?.name, riven.weaponName, riven.weaponSlug].map(name => byName.get(key(name))).find(Boolean);
 };
}

export function rivenTitles(riven:Pick<Riven,'name'|'weaponName'|'weaponSlug'|'veiled'>, weapon?:RivenWeapon) {
 if (riven.veiled) return {primary:riven.name, secondary:''};
 const english = weapon?.name || riven.weaponName || riven.weaponSlug?.replace(/_/g, ' ') || '';
 const chinese = weapon?.zh?.trim();
 const primary = `${chinese && !chinese.includes('�') ? chinese : english} ${riven.name}`.trim();
 const secondary = `${english} ${riven.name}`.trim();
 return {primary, secondary:primary === secondary ? '' : secondary};
}

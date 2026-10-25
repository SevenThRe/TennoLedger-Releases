export type VendorItem={id:string;name:string;zh:string;image:string;imageUrl?:string;category:string};
// Strip only the outer store prefix: some real identifiers contain a nested StoreItems segment.
export const vendorId=(id:string)=>id.replace('/StoreItems/','/');
export function vendorGroup(item:VendorItem|undefined,id:string){if(item?.category==='mod'||id.includes('/Mods/'))return 'mods';if(['primary','secondary','melee','archgun','archmelee'].includes(item?.category??''))return 'weapons';if(item?.category==='cosmetic'||id.includes('/Skins/'))return 'cosmetics';return 'other';}

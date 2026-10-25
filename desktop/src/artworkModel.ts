export type ImageItem={id:string;image?:string;imageUrl?:string;category?:string;mod?:{wikiaThumbnail?:string;cardImage?:string}};
export function artworkSources(item?:ImageItem){
 const fallback=item?.category==='mod'?'/mod-card-placeholder.svg':'/reference/ui/'+({warframe:'warframe.png',pet:'companion.png',sentinel:'companion.png',primary:'primary.png',secondary:'pistol.png',melee:'melee.png'}[item?.category??'']??'question.png');
 // A mod illustration (e.g. RifleDamageAmountMod.jpg) is not the mod card.
 // Missing full art must not silently fall back to a plausible but wrong icon.
 const candidates=item?.category==='mod'?[item.mod?.cardImage,item.mod?.wikiaThumbnail,item.mod?.wikiaThumbnail&&item.imageUrl===item.mod.wikiaThumbnail?item.image:undefined,fallback]:[item?.image,item?.imageUrl,fallback];
 return [...new Set(candidates.filter((s):s is string=>typeof s==='string'&&!!s))];
}

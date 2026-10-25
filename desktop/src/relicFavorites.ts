export type FavoriteRelic={id:string;base:string;aliases?:string[]};
export function isRewardFavorite(favorites:readonly string[],rewardId:string,parents:ReadonlyArray<{id:string}>){
 return favorites.includes(rewardId)||parents.some(parent=>favorites.includes(parent.id));
}
export function isRelicFavorite(favorites:string[],relic:FavoriteRelic,variants:FavoriteRelic[]){
 return favorites.includes(relic.base)||variants.some(r=>r.base===relic.base&&[r.id,...r.aliases??[]].some(id=>favorites.includes(id)));
}
/** Canonicalize only this family; preserve unrelated and unknown legacy IDs. */
export function toggleRelicFavorite(favorites:string[],relic:FavoriteRelic,variants:FavoriteRelic[]){
 const selected=isRelicFavorite(favorites,relic,variants);
 const family=new Set([relic.base,...variants.filter(r=>r.base===relic.base).flatMap(r=>[r.id,...r.aliases??[]])]);
 const next=favorites.filter(id=>!family.has(id));
 return selected?next:[...next,relic.base];
}

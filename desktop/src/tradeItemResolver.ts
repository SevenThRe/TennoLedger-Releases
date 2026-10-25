export type TradeCatalogItem={id:string;name:string;zh?:string};
const key=(name:string)=>name.normalize('NFKC').trim().replace(/^\[([^\[\]]+)\]$/,'$1').replace(/\s+/g,' ').toLowerCase();
/** Exact catalog names only. Never guess a different variant or choose an ambiguous match. */
export function tradeItemResolver(items:readonly TradeCatalogItem[]){
 const names=new Map<string,Set<string>>();
 for(const item of items){
  if(!item.id||typeof item.name!=='string')continue;
  for(const name of [item.name,item.zh]){
   if(typeof name!=='string'||!key(name))continue;
   const ids=names.get(key(name))??new Set<string>();ids.add(item.id);names.set(key(name),ids);
  }
 }
 return (name:string):string|null=>{const ids=names.get(key(name));return ids?.size===1?[...ids][0]:null;};
}

import {officialItemNames} from './officialItemNamesData.ts';
const slug=(value:string)=>value.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
const canonical=(value:string)=>value.replace(/^\/Lotus\/StoreItems\//,'/Lotus/');
export function officialNameResolver(rows:readonly (readonly [string,string,string])[]){
 const byId=new Map<string,string>(),byName=new Map<string,string|null>();
 for(const [id,en,zh] of rows){
  byId.set(canonical(id),zh);const key=slug(en);
  if(key)byName.set(key,byName.has(key)&&byName.get(key)!==zh?null:zh);
 }
 return (id:unknown,name:unknown,marketSlug:unknown):string|undefined=>{
  const exact=typeof id==='string'?byId.get(canonical(id)):undefined;
  if(exact)return exact;
  for(const value of [name,marketSlug]){if(typeof value==='string'){const found=byName.get(slug(value));if(found)return found;}}
  return undefined;
 };
}
export const officialItemName=officialNameResolver(officialItemNames);

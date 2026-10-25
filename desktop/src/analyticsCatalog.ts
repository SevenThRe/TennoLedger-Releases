export type AnalyticsCatalogItem={id:string;name:string;category:string;marketSlug?:string;zh?:string;image?:string;imageUrl?:string;mod?:{wikiaThumbnail?:string;cardImage?:string}};
export function parseAnalyticsCatalog(value:unknown):AnalyticsCatalogItem[]{
 if(!value||typeof value!=='object'||!('items' in value)||!Array.isArray(value.items)||!value.items.length)throw Error('物品目录为空或格式无效');
 for(const item of value.items){
  if(!item||typeof item!=='object'||!['id','name','category'].every(key=>typeof item[key]==='string'&&item[key].trim())
   ||!['zh','image','imageUrl'].every(key=>item[key]===undefined||typeof item[key]==='string'))throw Error('物品目录字段不完整');
 }
 return value.items;
}

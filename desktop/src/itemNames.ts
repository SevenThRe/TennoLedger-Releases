type NamedItem={id:string;name:string;zh?:string;recipe?:{parts:{itemId:string}[]};displayParts?:{itemId:string}[]};
const parts:Record<string,string>={Blueprint:'蓝图',Chassis:'机体',Neuroptics:'头部神经光元',Systems:'系统',Barrel:'枪管',Receiver:'枪机',Stock:'枪托',Blade:'刀刃',Handle:'握柄',Link:'连接器'};
export function itemName(item:Pick<NamedItem,'name'|'zh'>|undefined,en=false){
 if(!item)return '—';
 if(en)return item.name;
 const translated=item.zh?.trim();
 const value=translated&&!translated.includes('�')?translated:item.name;
 return parts[value]??value;
}
/** Qualify generic parts only when their actual recipe owner is unambiguous. */
export function craftingNames(items:Map<string,NamedItem>,en=false){
 const owners=new Map<string,Set<string>>();
 for(const owner of items.values())for(const part of [...(owner.recipe?.parts??[]),...(owner.displayParts??[])]){
  if(part.itemId===owner.id)continue;
  const ids=owners.get(part.itemId)??new Set<string>();ids.add(owner.id);owners.set(part.itemId,ids);
 }
 return (id:string)=>{
  const item=items.get(id);if(!item)return id.split('/').at(-1)??id;
  const label=itemName(item,en);
  if(!Object.hasOwn(parts,item.name))return label;
  // A full translated component name already identifies its owner.
  if(!en&&label!==parts[item.name]&&label!==item.name)return label;
  const candidates=[...(owners.get(id)??[])].map(key=>items.get(key)!).filter(owner=>!Object.hasOwn(parts,owner.name));
  if(candidates.length!==1)return label;
  const owner=itemName(candidates[0],en);
  return owner===label||owner.endsWith(' '+label)?owner:owner+' '+label;
 };
}

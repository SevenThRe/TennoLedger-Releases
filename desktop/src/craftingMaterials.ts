import type {ResourceRecipe,ResourceRequirement} from './resourcePlan.ts';
import {searchText} from './searchText.ts';

export type MaterialKind='resource'|'blueprint'|'component';
export type MaterialOrder='priority'|'name'|'shortage'|'owned';
export function materialKind(id:string,blueprints:ReadonlySet<string>,recipes:Record<string,ResourceRecipe>,resources:ReadonlySet<string>,craft:ReadonlySet<string>):MaterialKind{
 if(blueprints.has(id))return 'blueprint';
 return recipes[id]&&(!resources.has(id)||craft.has(id))?'component':'resource';
}
export function filterMaterials(requirements:Record<string,ResourceRequirement>,options:{focus:string;missingOnly:boolean;kind:MaterialKind|'';search:string;order:MaterialOrder},describe:(id:string)=>{name:string;kind:MaterialKind;sources?:string;alternateName?:string}){
 const descriptions=new Map(Object.keys(requirements).map(id=>[id,describe(id)]));
 return Object.entries(requirements).filter(([id,row])=>{
  const item=descriptions.get(id)!;
  return (!options.focus||row.usedBy.includes(options.focus))&&(!options.missingOnly||row.missing>0)&&(!options.kind||item.kind===options.kind)&&searchText(options.search,item.name,item.alternateName??'',item.sources??'',id);
 }).sort(([a,ra],[b,rb])=>(options.order==='shortage'?rb.missing-ra.missing:options.order==='owned'?rb.owned-ra.owned:options.order==='priority'?Number(rb.missing>0)-Number(ra.missing>0)||rb.usedBy.length-ra.usedBy.length:0)||descriptions.get(a)!.name.localeCompare(descriptions.get(b)!.name));
}

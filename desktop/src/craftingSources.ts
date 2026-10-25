import type {Sources} from './masteryModel';
import type {Relic} from './relicModel';
export type MaterialDetails=Record<string,{wiki?:string;drops?:{location:string;chance:number}[]}>;
type ReadJson=(url:string)=>Promise<unknown>;
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
export async function loadResourceSourceData(read:ReadJson){
 const results=await Promise.allSettled([
  read('/relic-catalog.json').then(d=>{if(!record(d)||!Array.isArray(d.items))throw Error('Invalid relic catalog');return d.items as Relic[];}),
  read('/mastery-sources.json').then(d=>{if(!record(d)||!record(d.items))throw Error('Invalid acquisition sources');return d as Sources;}),
 ]);
 return {relics:results[0].status==='fulfilled'?results[0].value:[],sources:results[1].status==='fulfilled'?results[1].value:{items:{}} as Sources,failed:results.filter(r=>r.status==='rejected').length};
}
export async function loadCraftingSources(read:ReadJson){
 const results=await Promise.allSettled([
  read('/item-details.json').then(d=>{if(!record(d)||!record(d.items))throw Error('Invalid item details');return d.items as MaterialDetails;}),
  read('/relic-catalog.json').then(d=>{if(!record(d)||!Array.isArray(d.items))throw Error('Invalid relic catalog');return d.items as Relic[];}),
  read('/mastery-sources.json').then(d=>{if(!record(d)||!record(d.items))throw Error('Invalid acquisition sources');return d as Sources;}),
 ]);
 const [details,relics,sources]=results;
 return {
  details:details.status==='fulfilled'?details.value:null,
  relics:relics.status==='fulfilled'?relics.value:null,
  sources:sources.status==='fulfilled'?sources.value:null,
  failed:results.flatMap((r,index)=>r.status==='rejected'?[(['details','relics','sources'] as const)[index]]:[]),
 };
}

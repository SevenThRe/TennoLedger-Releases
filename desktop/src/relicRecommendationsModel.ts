import type {Relic} from './relicModel.ts';
export type RecommendationRow={relic:Relic;amount:number|null;platinum:number|null;ducats:number|null;favorite:boolean;missing?:number|null;improvementPlat?:number|null;improvementDucats?:number|null};
export function recommendationRows(rows:RecommendationRow[],filters:{era:string;refinement:string;vault:string;favorites:boolean;sort:string;descending:boolean;favoriteFirst?:boolean}){
 const value=(r:RecommendationRow)=>filters.sort==='missing'?r.missing??null:filters.sort==='efficiency'?r.improvementDucats??null:filters.sort==='platEfficiency'?r.improvementPlat??null:filters.sort==='ducats'?r.ducats:filters.sort==='quantity'?r.amount:r.platinum;
 return rows.filter(r=>r.amount!==null&&r.amount>0&&(!filters.era||r.relic.era===filters.era)&&(!filters.refinement||r.relic.refinement===filters.refinement)&&(filters.vault==='all'||r.relic.vaulted===(filters.vault==='yes'))&&(!filters.favorites||r.favorite)).sort((a,b)=>{
  if(filters.favoriteFirst&&a.favorite!==b.favorite)return Number(b.favorite)-Number(a.favorite);const name=a.relic.name.localeCompare(b.relic.name,undefined,{numeric:true});if(filters.sort==='name')return (filters.descending?1:-1)*name;
  const av=value(a),bv=value(b);return av===null?bv===null?name:1:bv===null?-1:(filters.descending?bv-av:av-bv)||name;
 }).slice(0,32);
}
/** Missing/failed refresh quotes preserve a known cached value, never manufacture zero. */
export function mergeRecommendationQuotes(old:Record<string,number|null>,incoming:Record<string,number|null>){const next={...old};for(const [id,value] of Object.entries(incoming))if(value!==null||next[id]===undefined)next[id]=value;return next;}
export const voidTraceId='/Lotus/Types/Items/MiscItems/VoidTearDrop';

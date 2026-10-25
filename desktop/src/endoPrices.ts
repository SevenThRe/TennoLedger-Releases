import type {MarketRankingRow} from './marketRankingModel.ts';
export function endoPrices(ids:readonly string[],slugs:Record<string,string>,rows:readonly MarketRankingRow[]):Record<string,number>{
 const canonical=(id:string)=>id.replace(/^\/Lotus\/StoreItems\//,'/Lotus/');
 const byId=new Map(rows.filter(row=>row.gameRef).map(row=>[canonical(row.gameRef!),row]));
 const bySlug=new Map(rows.map(row=>[row.slug,row]));
 const result:Record<string,number>={};
 for(const id of ids){
  const row=byId.get(canonical(id))??bySlug.get(slugs[id]);
  const price=row?.unitPrice;
  if(typeof price==='number'&&Number.isSafeInteger(price)&&price>0)result[id]=price;
 }
 return result;
}

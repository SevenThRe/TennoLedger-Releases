export type MarketRankingRow={slug:string;gameRef?:string;i18n:Record<string,{name?:string;thumb?:string}>;unitPrice:number|null;volume:number|null;totalValue:number|null};
export type MarketRankingOrder='unitPrice'|'volume'|'totalValue';
export function marketRankings(rows:readonly MarketRankingRow[],order:MarketRankingOrder){
 return rows.filter(row=>typeof row[order]==='number'&&Number.isSafeInteger(row[order])&&row[order]!>=0).sort((a,b)=>b[order]!-a[order]!).slice(0,50);
}
export function marketCategories(rows:readonly MarketRankingRow[],order:MarketRankingOrder,modNames:ReadonlySet<string>){
 const totals=new Map<string,number>();
 for(const row of rows){
  const value=row[order];if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0)continue;
  const name=row.i18n.en?.name??row.slug;
  const type=name.endsWith(' Set')?'set':name.includes('Prime')?'prime':name.includes('Riven')?'riven':name.includes('Arcane')?'arcane':name.includes('Relic')?'relic':modNames.has(name)?'mod':'other';
  totals.set(type,(totals.get(type)??0)+value);
 }
 return [...totals].sort(([a],[b])=>a.localeCompare(b)).map(([type,value])=>({type,value}));
}

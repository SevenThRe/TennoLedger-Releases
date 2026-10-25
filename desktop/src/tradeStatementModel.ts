import {exchangeCurrency} from './tradeHistoryModel.ts';
import type {Trade,Exchange} from './api';
export const statementTypes=['riven','set','arcane','mod','prime','relic','other','unallocated'] as const;
export type StatementType=typeof statementTypes[number];
export type StatementOrder='revenue'|'expenses'|'net';
export type StatementCatalogItem={id:string;name:string;category?:string};
export function tradeType(trade:Trade,catalog:ReadonlyMap<string,StatementCatalogItem>):StatementType{
 const item=catalog.get(trade.itemId),name=item?.name??trade.name;
 if(trade.itemId.startsWith('/AF_Special/Riven'))return 'riven';
 if(statementTypes.includes(trade.category as StatementType)&&trade.category!=='other')return trade.category as StatementType;
 if(name.endsWith(' Set'))return 'set';
 if(name.includes('Prime'))return 'prime';
 if(name.includes('Riven')||item?.category==='riven')return 'riven';
 if(name.includes('Arcane')||item?.category==='arcane')return 'arcane';
 if(name.includes('Relic')||item?.category==='relic')return 'relic';
 if(item?.category==='mod')return 'mod';
 return 'other';
}
export function tradeStatement(trades:readonly Trade[],catalog:ReadonlyMap<string,StatementCatalogItem>,order:StatementOrder,exchanges:readonly Exchange[]=[]){
 const rows=statementTypes.filter(type=>type!=='unallocated'||exchanges.length>0).map(type=>({type,revenue:0,expenses:0,net:0,graphValue:0}));
 for(const trade of trades){const row=rows.find(row=>row.type===tradeType(trade,catalog))!;row[trade.side==='sale'?'revenue':'expenses']+=trade.platinum;}
 const unallocated=rows.find(row=>row.type==='unallocated')!;for(const e of exchanges){unallocated.revenue+=exchangeCurrency(e,'received');unallocated.expenses+=exchangeCurrency(e,'sent');}
 for(const row of rows){row.net=row.revenue-row.expenses;row.graphValue=Math.max(0,row[order]);}
 return rows.sort((a,b)=>b[order]-a[order]);
}

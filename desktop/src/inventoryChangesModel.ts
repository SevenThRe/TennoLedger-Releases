export const harrowChassisId='/Lotus/Types/Recipes/WarframeRecipes/PriestChassisBlueprint';
export type PendingChange={quantity:number;firstSeen:string;lastSeen:string;arcaneCopies:boolean;rankQuantities?:Record<string,number>|null};
export type InventoryChangesData={revision:number;pending:Record<string,PendingChange>};
export type ChangeCatalogItem={id:string;name:string;zh?:string;category:string};
export type ChangeView='parts'|'all'|'mod'|'arcane';
export type ChangeDisplayRow={key:string;id:string;quantity:number;equivalent:number;rank:number|null;upgraded:boolean;unknownEquivalent:boolean;change:PendingChange};
const copies=(rank:number)=>(rank+1)*(rank+2)/2;
export function parseInventoryChanges(value:unknown):InventoryChangesData{
 if(!value||typeof value!=='object')throw Error('新增物品响应格式无效');const data=value as InventoryChangesData;
 if(!Number.isSafeInteger(data.revision)||data.revision<0||!data.pending||typeof data.pending!=='object'||Array.isArray(data.pending)||Object.keys(data.pending).length>100000)throw Error('新增物品版本或条目无效');
 for(const [id,row]of Object.entries(data.pending)){
  if(!id.startsWith('/Lotus/')||id.length>512||!row||!Number.isSafeInteger(row.quantity)||row.quantity<=0||typeof row.arcaneCopies!=='boolean'||!Number.isFinite(Date.parse(row.firstSeen))||!Number.isFinite(Date.parse(row.lastSeen))||Date.parse(row.firstSeen)>Date.parse(row.lastSeen))throw Error('新增物品数量或时间无效');
  if(row.rankQuantities!=null){let equivalent=0;if(typeof row.rankQuantities!=='object'||Array.isArray(row.rankQuantities)||!Object.keys(row.rankQuantities).length)throw Error('新增等级明细无效');for(const [key,count]of Object.entries(row.rankQuantities)){const rank=Number(key);if(!/^(0|[1-9]\d*)$/.test(key)||rank>100||!Number.isSafeInteger(count)||count<=0)throw Error('新增等级数量无效');equivalent+=count*(row.arcaneCopies?copies(rank):1);}if(!Number.isSafeInteger(equivalent)||equivalent!==row.quantity)throw Error('新增等级份数不一致');}
 }
 return data;
}
export function inventoryChangeRows(data:InventoryChangesData,catalog:ReadonlyMap<string,ChangeCatalogItem>,tradables:Readonly<Record<string,string>>,view:ChangeView):ChangeDisplayRow[]{
 const rows:ChangeDisplayRow[]=[];
 for(const [id,change]of Object.entries(data.pending)){
  if(id===harrowChassisId||!tradables[id])continue;const category=catalog.get(id)?.category;
  if(view==='parts'&&category!=='component'||view==='mod'&&category!=='mod'||view==='arcane'&&category!=='arcane')continue;
  const upgraded=category==='mod'||category==='arcane'||change.arcaneCopies;
  if(upgraded&&change.rankQuantities){for(const [rank,count]of Object.entries(change.rankQuantities))rows.push({key:id+'@'+rank,id,rank:Number(rank),quantity:count,equivalent:count*(change.arcaneCopies?copies(Number(rank)):1),upgraded:true,unknownEquivalent:false,change});}
  else rows.push({key:id,id,rank:null,quantity:change.quantity,equivalent:change.quantity,upgraded,unknownEquivalent:change.arcaneCopies,change});
 }
 return rows;
}
export type ChangeQuote={price:number|null;fetchedAt:string;platform:string};
export function inventoryChangeTotals(rows:readonly ChangeDisplayRow[],quotes:Readonly<Record<string,ChangeQuote>>,ducats:Readonly<Record<string,number>>,platform:string){
 let copies=0,unknownEquivalent=0,platinum=0,priced=0,ducatTotal=0,ducatKnown=0,ducatUnknown=0;
 for(const row of rows){if(row.unknownEquivalent)unknownEquivalent+=row.equivalent;else copies+=row.quantity;
  const quote=quotes[row.key];if(quote?.platform===platform&&quote.price!==null&&Number.isFinite(quote.price)&&quote.price>=0&&(!row.upgraded||row.rank!==null)){platinum+=quote.price*row.quantity;priced++;}
  if(!row.upgraded){const value=ducats[row.id];if(Number.isSafeInteger(value)&&value>=0){ducatTotal+=value*row.quantity;ducatKnown++;}else ducatUnknown++;}
 }
 return {copies,unknownEquivalent,itemTypes:new Set(rows.map(row=>row.id)).size,platinum:priced?platinum:null,unpriced:rows.length-priced,ducats:ducatKnown?ducatTotal:null,ducatUnknown};
}

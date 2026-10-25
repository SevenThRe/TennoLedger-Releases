import type {AnalyticsCatalogItem} from './analyticsCatalog';
import type {MarketRankingRow} from './marketRankingModel';
import {inventoryTradeTarget,type InventoryTradeTarget} from './inventoryTrade.ts';

/** Open the source's market action using verified slugs, never guessed URLs. */
export function analyticsTradeTarget(item:AnalyticsCatalogItem,rows:readonly MarketRankingRow[]|null,zh:boolean):InventoryTradeTarget|null{
 const exact=(rows??[]).filter(row=>row.gameRef===item.id);
 const named=(rows??[]).filter(row=>row.i18n.en?.name===item.name);
 const slug=item.marketSlug??(item.id.startsWith('market:')?item.id.slice(7):exact.length===1?exact[0].slug:exact.length===0&&named.length===1?named[0].slug:undefined);
 if(!slug)return null;
 return inventoryTradeTarget({id:item.id,slug,name:zh?(item.zh||item.name):item.name,englishName:item.name});
}

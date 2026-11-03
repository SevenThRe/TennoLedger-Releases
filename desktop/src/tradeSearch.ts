import type {MarketRankingRow} from './marketRankingModel.ts';
import type {InventoryTradeTarget} from './inventoryTrade.ts';
import {searchText} from './searchText.ts';

// Search the WM catalog, not the mastery/recipe subset. Quote availability and
// inventory ownership must not decide whether an item is searchable.
export function tradeSearch(query:string,rows:readonly MarketRankingRow[]):InventoryTradeTarget[]{
 if(!query.trim())return [];
 return rows.filter(row=>searchText(query,row.i18n['zh-hans']?.name??'',row.i18n.en?.name??'',row.slug))
  .slice(0,20).map(row=>({id:row.gameRef||`market:${row.slug}`,slug:row.slug,
   name:row.i18n['zh-hans']?.name||row.i18n.en?.name||row.slug,englishName:row.i18n.en?.name||row.slug}));
}

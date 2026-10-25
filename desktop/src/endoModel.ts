import {duplicateModEstimate} from './duplicateMods.ts';
import {modRankOwnership} from './modUpgradePlan.ts';
import type {PlannerMod,ModPlannerSnapshot} from './modPlannerModel.ts';
export function buildEndoRows(catalog:readonly PlannerMod[],snapshot:ModPlannerSnapshot|null,keep:number,protectFavorites:boolean){
 if(!Number.isSafeInteger(keep)||keep<1||keep>100)throw Error('Keep between 1 and 100 copies');
 const inventoryAvailable=snapshot?.upgradeCountsByRank!=null&&snapshot?.looseUnrankedMods!=null;
 const rows=[];let unknown=0;
 for(const mod of catalog){
  const ownership=modRankOwnership(snapshot?.upgradeCountsByRank,mod.id,mod.maximumRank);
  const loose=snapshot?.looseUnrankedMods;
  const count=loose==null?null:loose[mod.id]===undefined?0:loose[mod.id];
  const zero=snapshot?.upgradeCountsByRank?.[mod.id]?.['0']??0;
  const estimate=duplicateModEstimate({...mod,...ownership,favorite:!!snapshot?.favorites?.includes(mod.id),looseUnranked:count,known:ownership.known&&inventoryAvailable&&(count==null||count<=zero)},keep,protectFavorites);
  if(estimate.status==='unknown')unknown++;
  if(estimate.status==='available')rows.push({...mod,...estimate,owned:ownership.owned!,favorite:!!snapshot?.favorites?.includes(mod.id)});
 }
 return {inventoryAvailable,unknown,rows};
}

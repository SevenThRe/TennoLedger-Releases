import {refinementLabel} from './relicLabels';
export type RelicPlannerFilterValues={vault:string;rewards:string;parents:string;tenCopies:string;refinement:string;favorite:string};
export default function RelicPlannerFilterPanel({value,onChange,en}:{value:RelicPlannerFilterValues;onChange:(key:keyof RelicPlannerFilterValues,value:string)=>void;en:boolean}){
 const L=(a:string,b:string)=>en?b:a;
 const groups:[keyof RelicPlannerFilterValues,string,[string,string][]][]=[
 ['vault',L('入库状态','Vaulted'),[['yes',L('是','Yes')],['no',L('否','No')]]],
 ['rewards',L('全部奖励已拥有','All rewards owned'),[['yes',L('是','Yes')],['no',L('否','No')]]],
 ['parents',L('全部成品已拥有或精通','All items mastered/owned'),[['yes',L('是','Yes')],['no',L('否','No')]]],
 ['tenCopies',L('至少 10 个','At least 10 copies'),[['yes',L('是','Yes')],['no',L('否','No')]]],
 ['refinement',L('精炼等级','Refinement'),['Intact','Exceptional','Flawless','Radiant'].map(v=>[v,refinementLabel(v,en)])],
 ['favorite',L('收藏','Favorite'),[['yes',L('是','Yes')],['no',L('否','No')],['order',L('优先排序','Order first')]]]
 ];
 return <div className="relicFilters referenceFilterPanel" id="relic-filter-panel" role="group" aria-label={L('筛选遗物','Filter relics')}>{groups.map(([key,label,options])=><fieldset key={key}><legend>{label}</legend><div>{options.map(([v,text])=><button key={v} aria-pressed={value[key]===v} onClick={()=>onChange(key,value[key]===v?(key==='refinement'||key==='tenCopies'?'':'all'):v)}>{text}</button>)}</div></fieldset>)}</div>;
}

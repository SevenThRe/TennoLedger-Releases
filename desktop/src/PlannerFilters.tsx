import './plannerFilters.css';
export type PlannerFilterGroup={id:string;label:string;value:string;options:{value:string;label:string}[];change:(value:string)=>void};
export function PlannerFilterChoices({group,all}:{group:PlannerFilterGroup;all:string}){
 return <div className="plannerFilterChoices">{[{value:'',label:all},...group.options].map(option=><button key={option.value} aria-pressed={group.value===option.value} onClick={()=>group.change(option.value)}>{option.label}</button>)}</div>;
}
export function PlannerFilterSummary({groups,clear}:{groups:PlannerFilterGroup[];clear:string}){
 const active=groups.filter(g=>g.value);return active.length?<div className="plannerFilterSummary">{active.map(g=><button key={g.id} aria-label={clear+' '+g.label} onClick={()=>g.change('')}>{g.label}: {g.options.find(o=>o.value===g.value)?.label} ×</button>)}<button onClick={()=>groups.forEach(g=>g.change(''))}>{clear}</button></div>:null;
}
export function PlannerFilterPanel({groups,en,onClose,title}:{groups:PlannerFilterGroup[];en:boolean;onClose:()=>void;title?:string}){
 return <section className="plannerFilterPanel" aria-label={title??(en?'Filter mods':'筛选 MOD')}><header><strong>{title??(en?'Filter mods':'筛选 MOD')}</strong><button onClick={onClose}>{en?'Done':'完成'}</button></header><div className="plannerFilterGroups">{groups.map(group=><div key={group.id}><span>{group.label}</span><PlannerFilterChoices group={group} all={en?'All':'全部'}/></div>)}</div></section>;
}

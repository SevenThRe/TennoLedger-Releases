export type NavigationDetail =
 | {page:'analytics';view:'personal'|'market'}
 | {page:'resources';view:'inventory'|'plan'|'shards'}
 | {page:'market';view:'orders'|'contracts'}
 | {page:'planner';view:'mods'|'endo'}
 | {page:'rivens';view:'veiled'|'unveiled'|'finder'|'mine'|'sniper'};
export type NavigationChild={detail:NavigationDetail;zh:string;en:string};
export const navigationChildren:Readonly<Record<string,readonly NavigationChild[]>>={
 analytics:[{detail:{page:'analytics',view:'personal'},zh:'我的交易',en:'Your trading'},{detail:{page:'analytics',view:'market'},zh:'市场活动',en:'Market activity'}],
 market:[{detail:{page:'market',view:'orders'},zh:'我的订单',en:'My orders'},{detail:{page:'market',view:'contracts'},zh:'我的合约',en:'My contracts'}],
 resources:[{detail:{page:'resources',view:'inventory'},zh:'资源库存',en:'Resource inventory'},{detail:{page:'resources',view:'plan'},zh:'制造助手',en:'Crafting helper'},{detail:{page:'resources',view:'shards'},zh:'源力石',en:'Archon shards'}],
 planner:[{detail:{page:'planner',view:'mods'},zh:'MOD 规划',en:'MOD planner'},{detail:{page:'planner',view:'endo'},zh:'Endo 助手',en:'Endo helper'}],
 rivens:[{detail:{page:'rivens',view:'unveiled'},zh:'已揭示库存',en:'Unveiled stash'},{detail:{page:'rivens',view:'veiled'},zh:'未揭示库存',en:'Veiled stash'},{detail:{page:'rivens',view:'finder'},zh:'查找',en:'Finder'},{detail:{page:'rivens',view:'sniper'},zh:'狙击',en:'Sniper'}],
};
export function navigationChild(detail:unknown):NavigationChild|undefined{
 if(!detail||typeof detail!=='object'||Array.isArray(detail))return;
 const candidate=detail as {page?:unknown;view?:unknown};
 if(typeof candidate.page!=='string'||typeof candidate.view!=='string'||!Object.hasOwn(navigationChildren,candidate.page))return;
 return navigationChildren[candidate.page]?.find(child=>child.detail.view===candidate.view);
}
export function navigationDetailEqual(left:NavigationDetail|undefined,right:NavigationDetail):boolean{return left?.page===right.page&&left.view===right.view;}


// AlecaFrame 3.0.4 main.html: world is a persistent right-panel view, not a rail item.
export const navigationGroups = [
 {zh:'收藏',en:'Collection',pages:['foundry','mastery']},
 {zh:'库存',en:'Inventory',pages:['inventory','relic','resources']},
 {zh:'交易',en:'Trading',pages:['rivens','market','analytics']},
 {zh:'概览',en:'Overview',pages:['arbitrations','overview','planner','help']},
] as const;
export const navigationIcons:Readonly<Record<string,{file:string;size?:string}>>={
 foundry:{file:'build.png',size:'120%'},mastery:{file:'mastery.png'},inventory:{file:'vaulted.png',size:'160%'},relic:{file:'fissure.webp',size:'120%'},resources:{file:'resources.svg',size:'86%'},rivens:{file:'rivenIcon2.png',size:'123%'},market:{file:'wfMarketIconBW.png',size:'142%'},analytics:{file:'analytics.png'},overview:{file:'line-chart.png',size:'98%'},planner:{file:'planner.svg',size:'90%'},help:{file:'/tenno-ledger.svg',size:'100%'},settings:{file:'settings.png'},
};
export const navigationLabels:Readonly<Record<string,{zh:string;en:string}>>={
 foundry:{zh:'铸造厂',en:'Foundry'},mastery:{zh:'精通助手',en:'Mastery helper'},inventory:{zh:'库存',en:'Inventory'},relic:{zh:'遗物规划',en:'Relic planner'},resources:{zh:'资源',en:'Resources'},rivens:{zh:'紫卡',en:'Rivens'},market:{zh:'Warframe Market',en:'Warframe Market'},analytics:{zh:'交易分析',en:'Trading Analytics'},arbitrations:{zh:'仲裁',en:'Arbitrations'},overview:{zh:'统计',en:'Stats'},planner:{zh:'规划',en:'Planner'},help:{zh:'帮助/关于',en:'Help/About'},settings:{zh:'设置',en:'Settings'},
};

import {useEffect,useMemo,useRef,useState} from 'react';
import type {DetailItem} from './ItemDetails';
import type {DemandCatalog,DemandSnapshot} from './resourceDemand';
import {resourceDemand} from './resourceDemand';
import {craftingNames} from './itemNames';
import {searchText} from './searchText';
import Artwork from './Artwork';
import {useDropLocation} from './useDropLocation';
import './resourceCrafting.css';
import ResourceSources from './ResourceSources';
import {filterMaterials,materialKind,type MaterialKind,type MaterialOrder} from './craftingMaterials';
import {craftingProgress,matchesCraftingCollection,type CollectionChoice} from './craftingProgress';
import {sortCraftingGoals,type ResourcePreferences} from './resourcePreferences';
import {useResourcePreferences} from './useResourcePreferences';
import {useAccounts} from './AccountProvider';
import {accountStorageKey} from './accountScopeModel';

import {craftingAction,craftingEmptyState,materialLocationText} from './craftingWorkspaceModel';
type GoalItem=DetailItem&{maxRank?:number;masteryReq?:number};

type Props={uiPreferences?:ResourcePreferences;onPreferences?:(patch:Partial<ResourcePreferences>)=>void;preferencesKey?:string;catalog:DemandCatalog;items:Map<string,GoalItem>;snapshot:DemandSnapshot|null;en:boolean;busy:boolean;canFavorite:boolean;onFavorite:(id:string,enabled:boolean)=>void;onOpen:(item:DetailItem)=>void};
export default function ResourceCrafting({uiPreferences,onPreferences,catalog,items,snapshot,en,busy,canFavorite,onFavorite,onOpen,preferencesKey='tennoledger.resources.craft.v1'}:Props){
 const {scope}=useAccounts();const storageKey=accountStorageKey(preferencesKey,scope);
 const [sourceItem,setSourceItem]=useState<DetailItem|null>(null);
 const translateLocation=useDropLocation(en);
 const L=(zh:string,eng:string)=>en?eng:zh;
 const [craft,setCraft]=useState<string[]>([]),[storageError,setStorageError]=useState('');
 const [goalsExpanded,setGoalsExpanded]=useState(false),[picker,setPicker]=useState(false),[query,setQuery]=useState(''),[search,setSearch]=useState(''),[focus,setFocus]=useState(''),[remove,setRemove]=useState('');
 const [filtersOpen,setFiltersOpen]=useState(false),filterRoot=useRef<HTMLDivElement>(null),filterButton=useRef<HTMLButtonElement>(null);
 const filterCloseTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 const openFilters=()=>{clearTimeout(filterCloseTimer.current);setFiltersOpen(true);};
 const closeFiltersSoon=()=>{clearTimeout(filterCloseTimer.current);filterCloseTimer.current=setTimeout(()=>setFiltersOpen(false),200);};
 useEffect(()=>()=>clearTimeout(filterCloseTimer.current),[]);
 const [collection,setCollection]=useState<CollectionChoice>('all');
 const localPreferences=useResourcePreferences(`${preferencesKey}.ui`);
 const {materialType,materialOrder:sort,missingOnly}=uiPreferences??localPreferences.preferences;
 const updatePreferences=onPreferences??localPreferences.update;
 const setMaterialType=(materialType:MaterialKind|'')=>updatePreferences({materialType});
 const setSort=(materialOrder:MaterialOrder)=>updatePreferences({materialOrder});
 const setMissingOnly=(missingOnly:boolean)=>updatePreferences({missingOnly});
 const [favoriteOnly,setFavoriteOnly]=useState(false),[kind,setKind]=useState('');
 const [limit,setLimit]=useState(80),[pickLimit,setPickLimit]=useState(48);
 const scroll=useRef<HTMLDivElement>(null),pickScroll=useRef<HTMLDivElement>(null);
 const addButton=useRef<HTMLButtonElement>(null),pickerSearch=useRef<HTMLInputElement>(null);
 useEffect(()=>{setCraft([]);setFocus('');setRemove('');setSourceItem(null);try{const raw=localStorage.getItem(storageKey);if(raw){const value=JSON.parse(raw);if(!Array.isArray(value)||value.some(id=>typeof id!=='string'))throw Error();setCraft([...new Set(value)]);}}catch{setStorageError(L('无法读取已保存的制造偏好','Saved crafting preferences could not be read'));}},[storageKey]);
 const toggleCraft=(id:string)=>{const next=craft.includes(id)?craft.filter(x=>x!==id):[...craft,id];setCraft(next);try{localStorage.setItem(storageKey,JSON.stringify(next));setStorageError('');}catch{setStorageError(L('制造偏好仅在本次会话有效，保存失败','Preferences work this session but could not be saved'));}};
 const plan=useMemo(()=>resourceDemand(catalog,snapshot,items,new Set(craft)).favorites,[catalog,snapshot,items,craft]);
 const resourceIds=useMemo(()=>new Set(catalog.resourceIds??catalog.ids),[catalog]);
 const favorites=new Set(snapshot?.favorites??[]);
 const qualified=useMemo(()=>craftingNames(items,en),[items,en]);
 const name=(id:string)=>id==='credits'?L('现金','Credits'):qualified(id);
 const categoryName=(c:string)=>en?c:({archgun:'Archwing 枪械',archmelee:'Archwing 近战',archwing:'Archwing',component:'装备与组件',melee:'近战',pet:'同伴',primary:'主武器',secondary:'副武器',sentinel:'守护',sentinelweapon:'守护武器',warframe:'战甲'} as Record<string,string>)[c]??c;
 const material=(id:string)=>items.get(id)??{id,name:name(id),zh:name(id),category:'resource'};
 const blueprints=useMemo(()=>new Set(catalog.blueprintIds),[catalog]);
 const rows=filterMaterials(plan.requirements,{focus,missingOnly,kind:materialType,search,order:sort},id=>({name:name(id),alternateName:items.get(id)?.name,kind:materialKind(id,blueprints,catalog.recipes,resourceIds,new Set(craft)),sources:materialLocationText(catalog.dropSources?.[id]??items.get(id)?.detail?.drops,translateLocation)}));
 const emptyState=craftingEmptyState(plan.goals,plan.inventoryKnown,plan.requirements,rows.length);
 const filterCount=Number(missingOnly)+Number(!!materialType);
 const clearFilters=()=>{updatePreferences({missingOnly:false,materialType:''});setSearch('');setFocus('');};
 useEffect(()=>{if(focus&&!plan.goals.some(g=>g.itemId===focus))setFocus('');if(remove&&!plan.goals.some(g=>g.itemId===remove))setRemove('');},[plan.goals,focus,remove]);
 useEffect(()=>{if(!filtersOpen)return;const outside=(e:PointerEvent)=>{if(!filterRoot.current?.contains(e.target as Node))setFiltersOpen(false);};const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'){setFiltersOpen(false);filterButton.current?.focus();}};document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};},[filtersOpen]);
 const candidates=catalog.goalIds.map(id=>items.get(id)).filter((item):item is GoalItem=>!!item).filter(item=>(!favoriteOnly||favorites.has(item.id))&&(!kind||item.category===kind)&&matchesCraftingCollection(collection,item,snapshot)&&searchText(query,item.name,item.zh,item.id)).sort((a,b)=>Number(favorites.has(b.id))-Number(favorites.has(a.id))||name(a.id).localeCompare(name(b.id)));
 const categories=[...new Set(catalog.goalIds.map(id=>items.get(id)?.category).filter((x):x is string=>!!x))].sort();
 useEffect(()=>{setLimit(80);scroll.current?.scrollTo(0,0);},[search,sort,focus,missingOnly,materialType]);
 useEffect(()=>{setPickLimit(48);pickScroll.current?.scrollTo(0,0);},[query,kind,favoriteOnly,collection]);


 useEffect(()=>{if(!picker)return;pickerSearch.current?.focus();const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){setPicker(false);addButton.current?.focus();}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[picker]);
 const status=(g:typeof plan.goals[number])=>g.unknown?L('等待库存或配方数据','Needs inventory or recipe data'):g.owned>=g.quantity?L('已拥有','Owned'):g.missing.length?`${g.missing.length} ${L('种材料待获取','materials left')}`:g.waiting?L('等待铸造厂','Waiting for Foundry'):L('材料齐备','Materials ready');
 return <div className="craftWorkspace">
  {storageError&&<p role="alert">{storageError}</p>}
  {!uiPreferences&&localPreferences.storageError&&<p role="alert">{L('页面偏好无法读取或保存，当前设置仍可使用','Page preferences could not be read or saved; current settings remain usable')}</p>}
  <div className={'craftGoals '+(goalsExpanded||!plan.goals.length?'expanded':'')}><div className="craftGoalsHeading"><h3>{L('我的收藏','Your favorites')}</h3>{plan.goals.length>0&&<button className="craftGoalsToggle" onClick={()=>setGoalsExpanded(v=>!v)}>{goalsExpanded?L('隐藏目标','Hide goals'):L('显示目标','Show goals')}</button>}</div><button ref={addButton} onClick={()=>setPicker(true)}>{L('添加收藏','Add favorites')}</button><div className="craftGoalList">
   {sortCraftingGoals(plan.goals,name).map(g=><article key={g.itemId} className={focus===g.itemId?'selected':''}><button className="craftGoalIdentity" onClick={()=>setFocus(focus===g.itemId?'':g.itemId)} aria-pressed={focus===g.itemId}><Artwork item={material(g.itemId)}/><span><strong>{name(g.itemId)}</strong><small>{status(g)}</small>{craftingProgress(items.get(g.itemId)??{id:g.itemId},snapshot).masteryBlocked&&<small className="craftMasteryWarning">{L('需要段位','Requires MR')} {items.get(g.itemId)?.masteryReq}</small>}</span></button><button className="craftRemove" disabled={busy||!canFavorite} title={L('移出收藏','Remove favorite')} onClick={()=>setRemove(g.itemId)}><img src="/reference/ui/star2.png" alt=""/></button>{remove===g.itemId&&<div className="craftConfirm"><span>{L('移出收藏？','Remove favorite?')}</span><button disabled={busy} onClick={()=>{onFavorite(g.itemId,false);setRemove('');if(focus===g.itemId)setFocus('');}}>✓</button><button onClick={()=>setRemove('')}>{L('取消','Cancel')}</button></div>}</article>)}
   {!plan.goals.length&&<div className="craftGoalEmpty"><span aria-hidden="true">◇</span><strong>{L('尚未收藏制造目标','No crafting favorites')}</strong><p>{L('收藏可制造物品，即可查看所需材料','Add craftable items to your favorites to see their materials')}</p><button onClick={()=>setPicker(true)}>{L('浏览可制造物品','Browse craftable items')}</button></div>}
  </div></div>
  <section className="craftShopping">
   <div className="resourceToolbar craftToolbar">
    <div className="craftSearch"><img src="/reference/ui/search.png" alt=""/><input aria-label={L('搜索材料或地点','Search materials or locations')} placeholder={L('搜索材料或地点','Search materials or locations')} value={search} onChange={e=>setSearch(e.target.value)}/>{search&&<button title={L('清空搜索','Clear search')} aria-label={L('清空材料搜索','Clear material search')} onClick={()=>setSearch('')}><span aria-hidden="true">×</span></button>}</div>
    <select aria-label={L('材料排序','Material ordering')} value={sort} onChange={e=>setSort(e.target.value as MaterialOrder)}><option value="priority">{L('最多目标使用','Most goals helped')}</option><option value="name">{L('名称','Name')}</option><option value="shortage">{L('最多缺少','Largest shortage')}</option><option value="owned">{L('最多拥有','Most owned')}</option></select>
    <div className="craftFilterRoot" ref={filterRoot} onMouseEnter={openFilters} onMouseLeave={e=>{if(!e.currentTarget.contains(document.activeElement))closeFiltersSoon();}}><button ref={filterButton} type="button" className={'craftFilterTrigger'+(filterCount?' selected':'')} aria-label={L('筛选材料','Filter materials')} aria-expanded={filtersOpen} aria-controls="craftMaterialFilters" onClick={e=>setFiltersOpen(open=>e.detail===0?!open:true)}><img src="/reference/ui/filter.png" alt=""/>{L('筛选','Filters')}{filterCount>0&&<b>{filterCount}</b>}</button>
    {filtersOpen&&<div className="craftFilterPanel" id="craftMaterialFilters"><fieldset><legend>{L('进度','Progress')}</legend>{[[false,L('全部材料','Everything')],[true,L('仍需获取','Still needed')]].map(([value,label])=><label key={String(value)}><input type="radio" name="craftNeed" checked={missingOnly===value} onChange={()=>setMissingOnly(value as boolean)}/>{label}</label>)}</fieldset><fieldset><legend>{L('类型','Type')}</legend>{[['',L('全部类型','All types')],['resource',L('资源与现金','Resources & credits')],['blueprint',L('蓝图','Blueprints')],['component',L('待制造组件','Components to craft')]].map(([value,label])=><label key={value}><input type="radio" name="craftMaterialKind" checked={materialType===value} onChange={()=>setMaterialType(value as MaterialKind|'')}/>{label}</label>)}</fieldset><button onClick={clearFilters}>{L('清空筛选','Clear filters')}</button></div>}</div>
   </div>
   <div className="craftFilters"><div className="craftQuickFilters" role="group" aria-label={L('材料需求进度','Material progress')}><button aria-pressed={!missingOnly} onClick={()=>setMissingOnly(false)}>{L('全部材料','Everything')}</button><button aria-pressed={missingOnly} onClick={()=>setMissingOnly(true)}>{L('仍需获取','Still needed')}</button></div>{materialType&&<button className="craftFocusChip" onClick={()=>setMaterialType('')}>{({resource:L('资源与现金','Resources & credits'),blueprint:L('蓝图','Blueprints'),component:L('待制造组件','Components to craft')})[materialType]} ×</button>}{focus&&<button className="craftFocusChip" onClick={()=>setFocus('')}>{name(focus)} ×</button>}</div>
   <div className="craftMaterials" ref={scroll}>
    {emptyState==='inventory'?<p role="status">{L('等待完整库存与制造队列数据','Waiting for complete inventory and Foundry data')}</p>:<>
     {plan.goals.length>0&&plan.incomplete&&<p role="status">{L('部分配方未核实，以下为已知需求','Some recipes are unverified; known requirements follow')}</p>}
     {rows.length>0&&<div className="craftTableHeading"><span>{L('材料','Material')}</span><span>{L('进度','Progress')}</span><span>{L('下一步','Next step')}</span></div>}
     {rows.slice(0,limit).map(([id,row])=>{const output=catalog.recipes[id]?.output??1,action=craftingAction(row,output);return <article key={id} className={action.kind==='covered'?'satisfied':''} onClick={e=>{if(!(e.target as HTMLElement).closest('button,input,label'))setSourceItem(material(id));}}>
      <button className="craftMaterialIdentity" onClick={()=>setSourceItem(material(id))}>{id==='credits'?<img src="/reference/ui/credits.png" alt=""/>:<Artwork item={material(id)}/>}<span><strong>{name(id)}</strong><small>{row.reusable?L('可重复使用蓝图','Reusable blueprint'):row.crafts>0?L('制造缺少的组件','Craft its missing copies'):`${row.usedBy.length} ${L('个目标','goals')}`}{row.pending>0?` · ${row.pending} ${L('正在制造','in Foundry')}`:''}</small></span></button>
      <div className="craftProgress"><span>{(row.allocated+row.pending+row.fromBatches).toLocaleString()} / {row.needed.toLocaleString()}</span><progress aria-label={name(id)+L('需求进度',' progress')} max={Math.max(1,row.needed)} value={Math.min(row.needed,row.allocated+row.pending+row.fromBatches)}/></div>
      <div className="craftNext"><button onClick={()=>setSourceItem(material(id))}><strong>{action.kind==='craft'?output>1?`${L('制造','Craft')} ${action.batches} ${L('批','batches')}`:`${L('制造','Craft')} ${action.quantity}`:action.kind==='missing'?`${action.quantity.toLocaleString()} ${L('缺少','needed')}`:L('已满足','Covered')}</strong><small>{L('详情','Details')} ›</small></button>{resourceIds.has(id)&&catalog.recipes[id]&&<label><input type="checkbox" checked={craft.includes(id)} onChange={()=>toggleCraft(id)}/>{L('自行制造','Craft from ingredients')}</label>}</div>
     </article>;})}
     {emptyState!=='rows'&&<div className="craftShoppingEmpty"><strong>{emptyState==='goals'?L('购物清单将显示在这里','Your shopping list will appear here'):emptyState==='owned'?L('计划中的物品均已拥有','Everything in this plan is owned'):emptyState==='unavailable'?L('暂无材料需求','No materials to show'):L('没有符合条件的材料','Nothing matches this view')}</strong><p>{emptyState==='goals'?L('添加目标，查看所需资源、蓝图和组件。','Add goals to see required resources, blueprints, and components.'):L('查看全部材料、清空筛选或选择其他目标。','Choose Everything, clear your filters, or select another goal.')}</p>{Object.keys(plan.requirements).length>0&&<button onClick={clearFilters}>{L('显示全部材料','Show everything')}</button>}</div>}
     {rows.length>limit&&<button className="resourceShowMore" onClick={()=>setLimit(n=>n+80)}>{L('显示更多材料','Show more materials')}</button>}
    </>}
   </div>
  </section>
  {sourceItem&&<ResourceSources item={sourceItem} items={items} catalog={catalog} snapshot={snapshot} en={en} requirement={plan.inventoryKnown?plan.requirements[sourceItem.id]:undefined} craft={craft.includes(sourceItem.id)} onCraft={resourceIds.has(sourceItem.id)&&catalog.recipes[sourceItem.id]?()=>toggleCraft(sourceItem.id):undefined} onGoal={setFocus} onClose={()=>setSourceItem(null)}/>}
  {picker&&<div className="craftPickerBackdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setPicker(false);}}><section className="craftPicker" onKeyDown={e=>{if(e.key!=='Tab')return;const nodes=[...e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled)')];const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}} role="dialog" aria-modal="true" aria-label={L('收藏物品','Favorite items')}><header><h3>{L('收藏物品','Favorite items')}</h3><button aria-label={L('关闭','Close')} onClick={()=>{setPicker(false);addButton.current?.focus();}}>×</button></header><div className="resourceToolbar"><input ref={pickerSearch} aria-label={L('搜索制造目标','Search crafting goals')} value={query} onChange={e=>setQuery(e.target.value)} placeholder={L('搜索战甲、武器、装备…','Search Warframes, weapons, equipment…')}/><select aria-label={L('类型','Category')} value={kind} onChange={e=>setKind(e.target.value)}><option value="">{L('全部类型','All categories')}</option>{categories.map(c=><option key={c} value={c}>{categoryName(c)}</option>)}</select></div><label><input type="checkbox" checked={favoriteOnly} onChange={e=>setFavoriteOnly(e.target.checked)}/>{L('仅收藏','Favorites only')}</label><select aria-label={L('收藏进度筛选','Collection progress')} value={collection} onChange={e=>setCollection(e.target.value as CollectionChoice)}><option value="all">{L('全部收藏进度','All collection progress')}</option><option value="missing">{L('未拥有且未精通','Not owned or mastered')}</option><option value="owned">{L('已拥有','Owned')}</option></select>{collection==='missing'&&(!snapshot?.complete||!snapshot?.masteryAccount?.ranksComplete)&&<p role="status">{L('仅列出已确认未拥有、未精通的装备','Only confirmed unowned, unmastered items are shown')}</p>}<div className="craftPickerResults" ref={pickScroll}>{candidates.slice(0,pickLimit).map(item=><article key={item.id}><Artwork item={item}/><div className="craftPickerIdentity"><strong>{name(item.id)}</strong><small>{craftingProgress(item,snapshot).owned===null?L('库存未知','Inventory unavailable'):`${craftingProgress(item,snapshot).owned} ${L('已拥有','owned')}`}{craftingProgress(item,snapshot).mastered?` · ${L('已精通','Mastered')}`:''}</small>{craftingProgress(item,snapshot).masteryBlocked&&<small className="craftMasteryWarning">{L('需要段位','Requires MR')} {item.masteryReq}</small>}</div><button disabled={busy||!canFavorite||favorites.has(item.id)} onClick={()=>onFavorite(item.id,true)}>{favorites.has(item.id)?L('已收藏','Favorited'):L('收藏','Favorite')}</button></article>)}{!candidates.length&&<p>{L('没有匹配的配方','No matching recipes')}</p>}{candidates.length>pickLimit&&<button className="resourceShowMore" onClick={()=>setPickLimit(n=>n+48)}>{L('显示更多配方','Show more recipes')}</button>}</div></section></div>}
 </div>;
}

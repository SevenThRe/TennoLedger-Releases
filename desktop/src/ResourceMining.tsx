import {useEffect,useMemo,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import type {DetailItem} from './ItemDetails';
import type {DemandCatalog} from './resourceDemand';
import type {LiveCollection} from './useCollectionSnapshot';
import Artwork from './Artwork';
import PanelIcon from './PanelIcon';
import {useAccounts} from './AccountProvider';
import {accountStorageKey} from './accountScopeModel';
import {itemName} from './itemNames';
import {progress,previewWidths} from './masteryModel';
import {useMasteryPreferences} from './masteryPreferences';
import {
 MINING_ALT_SOURCE_LABELS,
 MINING_VENDOR_LABELS,
 MINING_ZONE_LABELS,
 OPEN_WORLD_ZONES,
 ZONE_VENDOR,
 type OpenWorldZone,
} from './miningCatalogModel';
import {
 buildMiningPlan,
 type MineralDemandRow,
 type MiningPlannerItem,
 type MiningTargetScope,
 type ZoneMiningPlan,
} from './miningPlannerModel';
import './resourceMining.css';

type Props={
 catalog:DemandCatalog;
 items:ReadonlyMap<string,DetailItem&MiningPlannerItem>;
 snapshot:LiveCollection|null;
 en:boolean;
 busy:boolean;
 canFavorite:boolean;
 onFavorite:(id:string,enabled:boolean)=>void;
 onOpen:(item:DetailItem)=>void;
};

type MiningPrefs={
 scope:MiningTargetScope;
 missingOnly:boolean;
 mrEligibleOnly:boolean;
 expandRefined:boolean;
};

const DEFAULT_PREFS:MiningPrefs={
 scope:'unmastered_weapons',
 missingOnly:false,
 mrEligibleOnly:false,
 expandRefined:true,
};

function parseMiningPrefs(raw:string|null):{value:MiningPrefs;error:boolean}{
 if(raw===null)return {value:{...DEFAULT_PREFS},error:false};
 try{
  const parsed:unknown=JSON.parse(raw);
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))return {value:{...DEFAULT_PREFS},error:true};
  const data=parsed as Record<string,unknown>;
  const scope:MiningTargetScope=
   data.scope==='unmastered_weapons'||data.scope==='unmastered_all'||data.scope==='favorites'
    ?data.scope
    :DEFAULT_PREFS.scope;
  return {
   value:{
    scope,
    missingOnly:typeof data.missingOnly==='boolean'?data.missingOnly:DEFAULT_PREFS.missingOnly,
    mrEligibleOnly:typeof data.mrEligibleOnly==='boolean'?data.mrEligibleOnly:DEFAULT_PREFS.mrEligibleOnly,
    expandRefined:typeof data.expandRefined==='boolean'?data.expandRefined:DEFAULT_PREFS.expandRefined,
   },
   error:false,
  };
 }catch{
  return {value:{...DEFAULT_PREFS},error:true};
 }
}

function compactNumber(value:number):string{
 return value>=1000?new Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:1}).format(value):value.toLocaleString();
}

function mineralCompletion(row:MineralDemandRow,inventoryKnown:boolean):number{
 if(!inventoryKnown||row.needed<=0)return 0;
 return Math.min(100,Math.round(row.allocated/row.needed*100));
}

function zoneCompletion(zonePlan:ZoneMiningPlan,inventoryKnown:boolean):number{
 if(!inventoryKnown)return 0;
 let allocated=0;
 let needed=0;
 for(const row of zonePlan.ores){
  allocated+=row.allocated;
  needed+=row.needed;
 }
 for(const row of zonePlan.gems){
  allocated+=row.allocated;
  needed+=row.needed;
 }
 if(needed<=0)return 100;
 return Math.min(100,Math.round(allocated/needed*100));
}

const VEIN_HEX={
 red:'#e76f6f',
 yellow:'#e7c15a',
 blue:'#66b7f0',
} as const;

export default function ResourceMining({catalog,items,snapshot,en,busy,canFavorite,onFavorite,onOpen}:Props){
 const {scope:accountScope}=useAccounts();
 const storageKey=accountStorageKey('tennoledger.resources.mining.v1',accountScope);
 const L=(zh:string,eng:string)=>en?eng:zh;
 const [masteryPrefs]=useMasteryPreferences();

 const [prefs,setPrefs]=useState<MiningPrefs>(DEFAULT_PREFS);
 const [storageError,setStorageError]=useState('');
 const [activeZone,setActiveZone]=useState<OpenWorldZone>('eidolon');
 const [openedMineralId,setOpenedMineralId]=useState<string|null>(null);
 const [hoveredZone,setHoveredZone]=useState<OpenWorldZone|null>(null);
 const [hoveredMineralId,setHoveredMineralId]=useState<string|null>(null);

 const openerRef=useRef<HTMLButtonElement|null>(null);
 const closeBtnRef=useRef<HTMLButtonElement|null>(null);

 useEffect(()=>{
  const loaded=parseMiningPrefs(localStorage.getItem(storageKey));
  setPrefs(loaded.value);
  setStorageError(loaded.error?L('无法读取已保存的采矿偏好','Saved mining preferences could not be read'):'');
 },[storageKey,en]);

 const updatePrefs=(patch:Partial<MiningPrefs>)=>{
  const next={...prefs,...patch};
  setPrefs(next);
  try{
   localStorage.setItem(storageKey,JSON.stringify(next));
   setStorageError('');
  }catch{
   setStorageError(L('采矿偏好仅在本次会话有效','Mining preferences could not be saved'));
  }
 };

 const plan=useMemo(
  ()=>buildMiningPlan(catalog,snapshot,items,{scope:prefs.scope,mrEligibleOnly:prefs.mrEligibleOnly,expandRefined:prefs.expandRefined,hideFounders:masteryPrefs.hideFounders}),
  [catalog,snapshot,items,prefs.scope,prefs.mrEligibleOnly,prefs.expandRefined,masteryPrefs.hideFounders]
 );

 const activePlan=plan.zones[activeZone];
 const allMinerals=useMemo(
  ()=>OPEN_WORLD_ZONES.flatMap(z=>[...plan.zones[z].ores,...plan.zones[z].gems]),
  [plan]
 );
 const activeZoneMinerals=useMemo(
  ()=>[...activePlan.ores,...activePlan.gems],
  [activePlan]
 );
 const openedMineral=useMemo(
  ()=>openedMineralId?allMinerals.find(m=>m.id===openedMineralId)??null:null,
  [allMinerals,openedMineralId]
 );

 const closeModal=()=>{
  setOpenedMineralId(null);
  requestAnimationFrame(()=>{
   if(openerRef.current?.isConnected)openerRef.current.focus();
  });
 };

 const openModal=(id:string,trigger:HTMLButtonElement)=>{
  openerRef.current=trigger;
  setOpenedMineralId(id);
 };

 useEffect(()=>{
  if(!openedMineralId)return;
  closeBtnRef.current?.focus();
  const onKey=(e:KeyboardEvent)=>{
   if(e.key==='Escape')closeModal();
  };
  window.addEventListener('keydown',onKey);
  return ()=>window.removeEventListener('keydown',onKey);
 },[openedMineralId]);

 const masteryProgress=useMemo(()=>{
  if(!snapshot)return null;
  return progress({
   masteryRank:snapshot.masteryRank??null,
   credits:snapshot.credits??null,
   complete:snapshot.complete,
   counts:snapshot.counts,
   ranks:snapshot.ranks??{},
   favorites:snapshot.favorites??[],
   masteryAccount:snapshot.masteryAccount??null,
  });
 },[snapshot]);

 const favXp=useMemo(
  ()=>Object.values(plan.goalsById).filter(g=>g.favorite).reduce((sum,g)=>sum+g.xp,0),
  [plan.goalsById]
 );

 const hoveredMineral=hoveredMineralId?activeZoneMinerals.find(m=>m.id===hoveredMineralId)??null:null;
 const hoverXp=hoveredZone?plan.zones[hoveredZone].potentialXp:hoveredMineral?hoveredMineral.potentialXp:0;
 const xpWidths=masteryProgress?previewWidths(masteryProgress.percent,masteryProgress.needed,favXp,hoverXp):{fav:0,hover:0};

 const activeZoneMeta=MINING_ZONE_LABELS[activeZone];
 const activeVendorLabel=en?MINING_VENDOR_LABELS[activePlan.vendor].en:MINING_VENDOR_LABELS[activePlan.vendor].zh;

 const oreRows=prefs.missingOnly&&plan.inventoryKnown?activePlan.ores.filter(r=>r.missing>0):activePlan.ores;
 const gemRows=prefs.missingOnly&&plan.inventoryKnown?activePlan.gems.filter(r=>r.missing>0):activePlan.gems;

 const openItem=(id:string,fallbackId?:string)=>{
  const target=items.get(id)??(fallbackId?items.get(fallbackId):undefined);
  if(target)onOpen(target);
 };

 const renderMineralCard=(row:MineralDemandRow)=>{
  const item=items.get(row.id);
  const label=itemName(item,en);
  const pct=mineralCompletion(row,plan.inventoryKnown);
  const rawOwned=plan.inventoryKnown?row.owned:snapshot?.counts?.[row.id];
  const covered=plan.inventoryKnown&&row.needed>0&&row.missing===0;
  const idle=plan.inventoryKnown&&row.needed===0;
  const veinKey=row.meta.vein==='gem'?'blue':activeZoneMeta.oreColor;
  const veinHex=VEIN_HEX[veinKey];
  const fillColor=covered
   ?'rgba(107,201,153,0.20)'
   :!plan.inventoryKnown||idle
    ?'rgba(148,163,184,0.06)'
    :veinKey==='blue'
     ?'rgba(102,183,240,0.17)'
     :veinKey==='yellow'
      ?'rgba(231,193,90,0.16)'
      :'rgba(231,111,111,0.16)';
  const hasMissingBp=plan.inventoryKnown&&row.refinedSteps.some(s=>s.blueprintMissing);
  const fillPct=covered?'100%':`${pct}%`;

  return (
   <button
    key={row.id}
    type="button"
    className={'miningCard'+(covered?' covered':idle?' idle':'')+(openedMineralId===row.id?' selected':'')}
    style={{
     '--vein-color':veinHex,
     '--fill-pct':fillPct,
     '--fill-color':fillColor,
    } as React.CSSProperties}
    onClick={e=>openModal(row.id,e.currentTarget)}
    onMouseEnter={()=>setHoveredMineralId(row.id)}
    onMouseLeave={()=>setHoveredMineralId(null)}
    onFocus={()=>setHoveredMineralId(row.id)}
    onBlur={()=>setHoveredMineralId(null)}
   >
    <div className="miningCardHead">
     <i className={'veinDot '+veinKey} aria-hidden="true"/>
     <div className="miningCardBadges">
      {row.meta.drillTier==='sunpoint'&&(
       <span
        className="miningDrillTag"
        title={L('需在奥布山谷烟指处购买阳点等离子钻头才能采集','Requires Sunpoint Plasma Drill from Smokefinger in Fortuna')}
       >
        {L('阳点','Sunpoint')}
       </span>
      )}
      {hasMissingBp&&(
       <span
        className="miningBpTag"
        title={L('关联精炼成品缺少蓝图','Missing refining blueprint for alloy/cut gem')}
       >
        {L('缺图','No BP')}
       </span>
      )}
     </div>
    </div>

    <div className="miningCardHero">
     <Artwork item={item}/>
     <strong className="miningCardName" title={label}>{label}</strong>
    </div>

    <div className="miningCardProgress">
     <div className="miningCardRatio">
      <b className={covered?'ok':plan.inventoryKnown&&row.missing>0?'deficit':'muted'}>
       {!plan.inventoryKnown||idle?'—':`${pct}%`}
      </b>
      <span>
       {rawOwned!==undefined?compactNumber(rawOwned):'—'}
       {' / '}
       {plan.inventoryKnown?compactNumber(row.needed):'—'}
      </span>
     </div>
     <div className="miningCardBar">
      <i style={{width:covered?'100%':`${pct}%`}}/>
     </div>
    </div>

    <div className="miningCardFoot">
     <span className={'miningCardState '+( !plan.inventoryKnown?'pending':row.missing>0?'deficit':covered?'ok':'idle')}>
      {!plan.inventoryKnown
       ?'—'
       :row.missing>0
        ?`${L('缺 ','Need ')}${compactNumber(row.missing)}`
        :covered
         ?L('已齐','Done')
         :L('无需','None')}
     </span>
     <span className={'miningCardMeta'+(plan.inventoryKnown&&row.readyAfterMiningGoals.length>0?' ready':'')}>
      {plan.inventoryKnown&&row.readyAfterMiningGoals.length>0
       ?`${row.readyAfterMiningGoals.length} ${L('可开工','ready')}`
       :row.usedByGoals.length>0
        ?`${row.usedByGoals.length} ${L('件','items')}`
        :`${L('详情','Info')} ›`}
     </span>
    </div>
   </button>
  );
 };

 const renderZoneCard=(zone:OpenWorldZone,zonePlan:ZoneMiningPlan)=>{
  const zoneMeta=MINING_ZONE_LABELS[zone];
  const vendorMeta=MINING_VENDOR_LABELS[zonePlan.vendor];
  const oreMissing=zonePlan.ores.filter(r=>r.missing>0);
  const gemMissing=zonePlan.gems.filter(r=>r.missing>0);
  const oreUnits=oreMissing.reduce((sum,r)=>sum+r.missing,0);
  const gemUnits=gemMissing.reduce((sum,r)=>sum+r.missing,0);
  const pct=zoneCompletion(zonePlan,plan.inventoryKnown);
  const active=activeZone===zone;
  const vendorName=en?vendorMeta.en:vendorMeta.zh;
  return (
   <button
    key={zone}
    type="button"
    className={'miningZoneCard'+(active?' selected':'')}
    aria-pressed={active}
    onClick={()=>setActiveZone(zone)}
    onMouseEnter={()=>setHoveredZone(zone)}
    onMouseLeave={()=>setHoveredZone(null)}
    onFocus={()=>setHoveredZone(zone)}
    onBlur={()=>setHoveredZone(null)}
   >
    <header>
     <strong>{en?zoneMeta.en:zoneMeta.zh}</strong>
     {plan.inventoryKnown&&(
      <span className={'miningStatusBadge'+(zonePlan.missingCount===0?' ok':'')}>
       <i className="statusDot"/>
       {zonePlan.missingCount>0
        ?`${L('缺','Need')} ${zonePlan.missingCount} ${L('种','')}`.trim()
        :L('已齐备','Covered')}
      </span>
     )}
    </header>
    <div className="miningZoneBar" aria-hidden="true">
     <i className={plan.inventoryKnown&&zonePlan.missingCount===0?'ok':''} style={{width:`${pct}%`}}/>
    </div>
    <div className="miningZoneMetrics">
     <span title={L(`${zonePlan.miningOnlyGoalIds.length} 件仅缺矿可直接开工`,`${zonePlan.miningOnlyGoalIds.length} mining-ready`)}>
      {L('解锁','Unlocks')} <b>{plan.inventoryKnown?zonePlan.goalIds.length:'—'}</b>
     </span>
     <span>
      {plan.inventoryKnown?(
       <><b>{pct}%</b>{' · '}<b>+{compactNumber(zonePlan.potentialXp)}</b> XP</>
      ):(
       <><b>—</b> XP</>
      )}
     </span>
    </div>
    <div className="miningZoneVeins">
     <span>
      <i className={'veinDot '+zoneMeta.oreColor}/>
      {L('矿脉','Ore')}
      <b>{!plan.inventoryKnown?'—':oreMissing.length>0?compactNumber(oreUnits):L('齐','OK')}</b>
     </span>
     <span>
      <i className="veinDot blue"/>
      {L('宝石','Gem')}
      <b>{!plan.inventoryKnown?'—':gemMissing.length>0?compactNumber(gemUnits):L('齐','OK')}</b>
     </span>
    </div>
    {plan.inventoryKnown&&(zonePlan.needsSunpointDrill||zonePlan.missingBlueprints.length>0)&&(
     <div className="miningZoneFlags">
      {zonePlan.needsSunpointDrill&&(
       <span
        className="miningDrillTag"
        title={L('含稀有宝石，需奥布山谷烟指购买阳点等离子钻头','Rare gems require Sunpoint Plasma Drill from Smokefinger')}
       >
        {L('阳点钻头','Sunpoint')}
       </span>
      )}
      {zonePlan.missingBlueprints.length>0&&(
       <span
        className="miningBpTag"
        title={L(`在${vendorName}处缺少 ${zonePlan.missingBlueprints.length} 张精炼蓝图`,`Missing ${zonePlan.missingBlueprints.length} refining blueprints at ${vendorName}`)}
       >
        {L('缺蓝图','BPs')} {zonePlan.missingBlueprints.length}
       </span>
      )}
     </div>
    )}
   </button>
  );
 };

 const portalTarget=typeof document!=='undefined'?(document.querySelector('.resourceWorkspace')??document.body):null;
 const openedItem=openedMineral?items.get(openedMineral.id):undefined;
 const openedZoneMeta=openedMineral?MINING_ZONE_LABELS[openedMineral.meta.zone]:activeZoneMeta;
 const openedPct=openedMineral?mineralCompletion(openedMineral,plan.inventoryKnown):0;
 const openedOwned=openedMineral?(plan.inventoryKnown?openedMineral.owned:snapshot?.counts?.[openedMineral.id]):undefined;

 return (
  <div className="miningWorkspace">
   {storageError&&<p role="alert" className="miningNotice">{storageError}</p>}

   <div className="miningToolbar">
    <div className="miningScopes" role="group" aria-label={L('规划目标','Planning scope')}>
     {([
      ['unmastered_weapons',L('未精通武器','Weapons')],
      ['unmastered_all',L('全部未精通','All gear')],
      ['favorites',L('收藏','Favorites')],
     ] as const).map(([key,label])=>(
      <button
       key={key}
       type="button"
       aria-pressed={prefs.scope===key}
       onClick={()=>updatePrefs({scope:key})}
      >
       {label}
      </button>
     ))}
    </div>
    <div className="miningToggles">
     {!plan.inventoryKnown&&(
      <span
       className="miningStatusBadge pending"
       title={L('需完整库存、铸造厂队列与精通档案以精确核算矿石缺口','Full inventory, Foundry queue, and Mastery records are needed to compute shortages')}
      >
       <i className="statusDot"/>
       {L('待同步','Pending sync')}
      </span>
     )}
     <button
      type="button"
      className="miningToggle"
      aria-pressed={prefs.missingOnly}
      title={L('仅显示当前仍有缺口的矿物','Show only minerals with missing units')}
      onClick={()=>updatePrefs({missingOnly:!prefs.missingOnly})}
     >
      {L('仅缺口','Missing')}
     </button>
     <button
      type="button"
      className="miningToggle"
      aria-pressed={prefs.mrEligibleOnly}
      title={L('仅统计当前精通段位可直接制造的装备','Only count gear meeting your current Mastery Rank')}
      onClick={()=>updatePrefs({mrEligibleOnly:!prefs.mrEligibleOnly})}
     >
      {L('当前段位','Current MR')}
     </button>
     <button
      type="button"
      className="miningToggle"
      aria-pressed={prefs.expandRefined}
      title={L('将缺少的精炼合金与切割宝石自动折算为原矿需求，并同步跨平原矿石','Expand missing alloys and cut gems into raw mineral needs')}
      onClick={()=>updatePrefs({expandRefined:!prefs.expandRefined})}
     >
      {L('展开合金','Expand alloys')}
     </button>
    </div>
   </div>

   {masteryProgress&&(
    <section className="miningXpStrip" aria-label={L('精通经验预览','Mastery XP preview')}>
     <span className="miningMrTag">MR {snapshot?.masteryRank??'—'}</span>
     <div className="miningXpTrackWrap">
      <div className="masteryTrack" role="progressbar" aria-label={L('段位经验预览','Mastery progress')} aria-valuenow={masteryProgress.percent} aria-valuemin={0} aria-valuemax={100}>
       <div className="masteryActual" style={{width:`${masteryProgress.percent}%`}}/>
       <div className="masteryFav" style={{width:`${xpWidths.fav>0?masteryProgress.percent+xpWidths.fav:0}%`}} title={`+${favXp.toLocaleString()} XP`}/>
       <div className="masteryHover" style={{width:`${xpWidths.hover>0?masteryProgress.percent+xpWidths.fav+xpWidths.hover:0}%`}} title={`+${hoverXp.toLocaleString()} XP`}/>
      </div>
     </div>
     <div className="miningXpSummary">
      <span title={L('悬停矿区或矿石可预览对应经验收益','Hover a zone or mineral to preview XP gain')}>
       <b>{plan.inventoryKnown?`+${(hoverXp>0?hoverXp:plan.totalPotentialXp).toLocaleString()}`:'—'}</b> XP
      </span>
      <span
       className="miningReadyCounter"
       title={L('其余非矿石材料均已备齐，挖完矿即可制造的装备数量','Gear with all non-mineral materials already covered')}
      >
       {L('可开工','Ready')} <b>{plan.inventoryKnown?plan.miningOnlyGoalsCount:'—'}</b>/{plan.inventoryKnown?plan.goalsUsingMining:'—'}
      </span>
     </div>
    </section>
   )}

   <div className="miningZones" role="group" aria-label={L('开放世界矿区','Open-world zones')}>
    {OPEN_WORLD_ZONES.map(zone=>renderZoneCard(zone,plan.zones[zone]))}
   </div>

   <div className="miningScroll">
    {oreRows.length===0&&gemRows.length===0?(
     <div className="miningZoneCovered">
      <span className="miningStatusBadge ok"><i className="statusDot"/>{L('需求已齐备','All covered')}</span>
      <strong>{en?activeZoneMeta.en:activeZoneMeta.zh}</strong>
     </div>
    ):(
     <>
      {oreRows.length>0&&(
       <section className="miningVeinSection" aria-label={activeZoneMeta.oreColor==='yellow'?L('黄矿脉','Yellow ore veins'):L('红矿脉','Red ore veins')}>
        <header>
         <i className={'veinDot '+activeZoneMeta.oreColor}/>
         <h4>{activeZoneMeta.oreColor==='yellow'?L('黄矿脉 · 矿石','Yellow veins · Ores'):L('红矿脉 · 矿石','Red veins · Ores')}</h4>
         <span>{oreRows.length}</span>
        </header>
        <div className="miningCardGrid">{oreRows.map(renderMineralCard)}</div>
       </section>
      )}
      {gemRows.length>0&&(
       <section className="miningVeinSection" aria-label={L('蓝宝石脉','Blue gem veins')}>
        <header>
         <i className="veinDot blue"/>
         <h4>{L('蓝宝石脉 · 宝石','Blue veins · Gems')}</h4>
         <span>{gemRows.length}</span>
        </header>
        <div className="miningCardGrid">{gemRows.map(renderMineralCard)}</div>
       </section>
      )}
     </>
    )}

    {plan.inventoryKnown&&activePlan.missingBlueprints.length>0&&(
     <details className="miningCollapsed">
      <summary>
       <span>{L('缺失精炼蓝图','Missing refining BPs')}</span>
       <b className="miningBpTag">{activePlan.missingBlueprints.length}</b>
      </summary>
      <div className="miningBlueprintList">
       {activePlan.missingBlueprints.map(bp=>{
        const refinedItem=items.get(bp.refinedId);
        return (
         <button
          key={bp.blueprintId}
          type="button"
          className="miningBlueprintRow"
          title={L(`前往 ${activeVendorLabel} 购买蓝图`,`Buy blueprint from ${activeVendorLabel}`)}
          onClick={()=>openItem(bp.blueprintId,bp.refinedId)}
         >
          <Artwork item={refinedItem}/>
          <span>
           <strong>{itemName(refinedItem,en)}</strong>
           <small>{activeVendorLabel}</small>
          </span>
          <b>×{bp.craftsNeeded} {L('批','')}</b>
         </button>
        );
       })}
      </div>
     </details>
    )}
   </div>

   {openedMineral&&portalTarget&&createPortal(
    <div className="miningDetailShade" onClick={e=>{if(e.target===e.currentTarget)closeModal();}}>
     <div
      className="miningDetailDialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mining-detail-title"
     >
      <header className="miningDrillHeader">
       <Artwork item={openedItem}/>
       <div className="miningDrillIdentity">
        <h3 id="mining-detail-title">{itemName(openedItem,en)}</h3>
        <div className="miningDrillBadges">
         <span>{en?openedZoneMeta.en:openedZoneMeta.zh}</span>
         <span>
          <i className={'veinDot '+(openedMineral.meta.vein==='gem'?'blue':openedZoneMeta.oreColor)}/>
          {openedMineral.meta.vein==='gem'?L('蓝宝石脉','Blue vein'):openedZoneMeta.oreColor==='yellow'?L('黄矿脉','Yellow vein'):L('红矿脉','Red vein')}
         </span>
         {openedMineral.meta.drillTier==='sunpoint'&&(
          <span
           className="miningDrillTag"
           title={L('需在奥布山谷烟指处购买阳点等离子钻头','Requires Sunpoint Plasma Drill from Smokefinger')}
          >
           {L('阳点钻头','Sunpoint')}
          </span>
         )}
         {openedMineral.meta.altSources.map(src=>(
          <span
           key={src}
           className="miningAltTag"
           title={L('除挖矿外的替代获取途径','Alternative farm source')}
          >
           {en?MINING_ALT_SOURCE_LABELS[src].en:MINING_ALT_SOURCE_LABELS[src].zh}
          </span>
         ))}
        </div>
       </div>
       <div className="miningDrillActions">
        <button
         type="button"
         className="miningOpenSources"
         onClick={()=>{
          closeModal();
          openItem(openedMineral.id);
         }}
        >
         {L('掉落来源','Sources')} ›
        </button>
        <button
         ref={closeBtnRef}
         type="button"
         className="miningCloseBtn"
         aria-label={L('关闭详情','Close details')}
         onClick={closeModal}
        >
         <PanelIcon name="close"/>
        </button>
       </div>
      </header>

      <div className="miningDetailSummary">
       <div className="miningDrillNumbers">
        <div>
         <span>{L('库存','Owned')}</span>
         <strong>{openedOwned!==undefined?openedOwned.toLocaleString():'—'}</strong>
        </div>
        <div>
         <span>{L('需求','Needed')}</span>
         <strong>{plan.inventoryKnown?openedMineral.needed.toLocaleString():'—'}</strong>
        </div>
        <div>
         <span>{L('缺口','Missing')}</span>
         <strong className={!plan.inventoryKnown?'':openedMineral.missing>0?'deficit':'ok'}>
          {!plan.inventoryKnown?'—':openedMineral.missing.toLocaleString()}
         </strong>
        </div>
        <div>
         <span>{L('进度','Progress')}</span>
         <strong className={plan.inventoryKnown&&openedMineral.needed>0&&openedMineral.missing===0?'ok':''}>
          {!plan.inventoryKnown||openedMineral.needed<=0?'—':`${openedPct}%`}
         </strong>
        </div>
       </div>
       <div className="miningCardBar">
        <i
         className={plan.inventoryKnown&&openedMineral.needed>0&&openedMineral.missing===0?'ok':''}
         style={{width:`${openedPct}%`}}
        />
       </div>
      </div>

      <div className="miningDetailBody">
       {openedMineral.refinedSteps.length>0&&(
        <div className="miningDrillSection">
         <h4>{L('需精炼批次','Refining batches')}</h4>
         <div className="miningStepList">
          {openedMineral.refinedSteps.map(step=>{
           const refItem=items.get(step.refinedId);
           const crossNames=step.crossZoneInputs.map(z=>en?MINING_ZONE_LABELS[z].en:MINING_ZONE_LABELS[z].zh).join(' · ');
           const vendorObj=MINING_VENDOR_LABELS[ZONE_VENDOR[step.zone]];
           const stepVendor=en?vendorObj.en:vendorObj.zh;
           return (
            <button
             key={step.refinedId}
             type="button"
             className="miningStepRow"
             onClick={()=>{
              closeModal();
              openItem(step.refinedId);
             }}
            >
             <Artwork item={refItem}/>
             <div className="miningStepInfo">
              <strong>{itemName(refItem,en)}</strong>
              <small>
               {L('需','Need')} {plan.inventoryKnown?step.needed.toLocaleString():'—'}
               {step.owned>0?` · ${L('库存','Owned')} ${step.owned.toLocaleString()}`:''}
               {step.pending>0?` · ${L('在造','Foundry')} ${step.pending.toLocaleString()}`:''}
              </small>
             </div>
             <div className="miningStepBadges">
              <b>{plan.inventoryKnown?`×${step.crafts} ${L('批','')}`.trim():'—'}</b>
              {plan.inventoryKnown&&step.blueprintMissing&&(
               <span className="miningBpTag" title={L(`在 ${stepVendor} 处缺少蓝图`,`Missing blueprint at ${stepVendor}`)}>
                {L('缺蓝图','No BP')}
               </span>
              )}
              {step.crossZoneInputs.length>0&&(
               <span
                className="miningCrossTag"
                title={L(`此精炼配方还需来自 ${crossNames} 的原矿`,`Requires raw ores from ${crossNames}`)}
               >
                {L('跨图','Cross')} · {crossNames}
               </span>
              )}
             </div>
            </button>
           );
          })}
         </div>
        </div>
       )}

       <div className="miningDrillSection">
        <h4>{L('关联装备','Affected gear')} · {openedMineral.usedByGoals.length}</h4>
        {openedMineral.usedByGoals.length===0?(
         <p className="miningEmptyHint">{L('当前筛选下无未精通装备需要此矿物','No unmastered gear in current scope requires this mineral')}</p>
        ):(
         <div className="miningGearList">
          {openedMineral.usedByGoals.map(goalId=>{
           const goal=plan.goalsById[goalId];
           const gearItem=items.get(goalId);
           if(!goal)return null;
           const stillMissingThis=goal.missingRawMinerals.includes(openedMineral.id);
           return (
            <article key={goalId} className="miningGearRow">
             <button
              type="button"
              className="miningGearIdentity"
              onClick={()=>{
               closeModal();
               openItem(goalId);
              }}
             >
              <Artwork item={gearItem}/>
              <span>
               <strong>{itemName(gearItem,en)}</strong>
               <small>
                +{goal.xp.toLocaleString()} XP
                {goal.masteryBlocked?` · MR ${goal.masteryReq}`:''}
               </small>
              </span>
             </button>
             <span
              className={'miningGearState '+( !plan.inventoryKnown?'partial':goal.miningOnlyBlocked?'ready':stillMissingThis?'partial':'covered')}
              title={
               !plan.inventoryKnown
                ?L('同步完整库存后可判定制造就绪状态','Sync inventory to evaluate crafting readiness')
                :goal.miningOnlyBlocked
                 ?L('其余非矿石材料已备齐，挖完即可制造','All non-mineral ingredients covered')
                 :stillMissingThis
                  ?L(`除矿石外还缺 ${goal.missingOtherMaterials.length} 种其他材料/蓝图`,`Also missing ${goal.missingOtherMaterials.length} non-mineral materials`)
                  :L('当前库存已满足该装备的此矿物需求','This mineral requirement is covered by stock')
              }
             >
              {!plan.inventoryKnown?L('待同步','Pending'):goal.miningOnlyBlocked?L('可开工','Ready'):stillMissingThis?L('缺其他','Needs more'):L('已备齐','Covered')}
             </span>
             <button
              type="button"
              className="miningGearStar"
              disabled={busy||!canFavorite}
              aria-label={L('收藏 ','Favorite ')+itemName(gearItem,en)}
              aria-pressed={goal.favorite}
              title={goal.favorite?L('移出收藏','Remove favorite'):L('加入收藏并同步制造助手','Add to favorites & Crafting helper')}
              onClick={()=>onFavorite(goalId,!goal.favorite)}
             >
              <img src={'/reference/ui/'+(goal.favorite?'star2.png':'starEmpty.png')} alt=""/>
             </button>
            </article>
           );
          })}
         </div>
        )}
       </div>
      </div>
     </div>
    </div>,
    portalTarget
   )}
  </div>
 );
}

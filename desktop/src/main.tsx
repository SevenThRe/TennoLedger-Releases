import {marketLoginEvent} from './marketLoginNavigation';
import {startMarketPrices} from './useMarketPrices';
import {installClientDiagnostics} from './clientDiagnostics';
import {RelicCapture} from './Collector';
import {MarketAutoRuntime} from './MarketPresence';
import {useAppPreferences} from './useAppPreferences';
import WorldRail,{WorldRailSidebar} from './WorldRail';
import GameOverlay from './GameOverlay';
import {listen} from '@tauri-apps/api/event';
import {StatsShareProvider} from './StatsSharing';
import {RivenMonitorRuntime} from './RivenMonitor';
import Help,{WelcomeTour} from './Help';
import {ThemeRuntime} from './useTheme';
import {openInventoryTrade,inventoryTradeTarget,type InventoryTradeTarget} from './inventoryTrade';
import InventoryChanges from './InventoryChanges';
import ArbitrationRuns,{ArbitrationLive} from './ArbitrationRuns';
import ArbitrationDataTools from './ArbitrationDataTools';
import type {ArbitrationView} from './arbitrationRunModel';
import TradeSidebar from './TradeSidebar';
import AccountProvider,{useAccounts} from './AccountProvider';
import Arbitrations from './Arbitrations';
import EventSidebar from './EventSidebar';
import ModPlanner from './ModPlanner';
import type {ShardFocus} from './shardFocus';
import Settings from './Settings';
import {builtinLanguages,readLanguagePacks,parseLanguagePack,packsKey,languageKey} from './settingsModel';
import Resources from './Resources';
import Navigation from './Navigation';
import type {NavigationDetail} from './navigationModel';
import './brand.css';
import StartupUpdate from './StartupUpdate';
import TradeInbox from './TradeInbox';
import TradeRankings from './TradeRankings';
import AssetHistory from './AssetHistory';
import {useLedger} from './useLedger';
import {useCollectionSnapshot} from './useCollectionSnapshot';
import WorldProvider from './WorldProvider';
import WorldPanel from './WorldPanel';
import CollectionWorldLayout from './CollectionWorldLayout';
import WindowShell from './WindowShell';
import React,{useEffect,useState,useCallback} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {createRoot} from 'react-dom/client';
import {useTranslation} from 'react-i18next';
import i18n,{i18nReady,changeUiLanguage} from './i18n';
import {save,native} from './api';
import './style.css';
import './foundry-visual.css';
import './workshop.css';
import './strictParity.css';
import Collection from './Collection';
import './collector.css';
import './tradingParity.css';
import Market from './Market';
import RivenMarket from './RivenMarket';
import RelicPlanner from './RelicPlanner';
function App(){useEffect(startMarketPrices,[]);const [appPreferences]=useAppPreferences();const {scope:accountScope}=useAccounts();const [marketRequest,setMarketRequest]=useState<InventoryTradeTarget|null>(null);const [navigationRequest,setNavigationRequest]=useState<NavigationDetail>();const [resourceView,setResourceView]=useState<'inventory'|'plan'|'shards'>('plan'),[plannerView,setPlannerView]=useState<'mods'|'endo'>('mods'),[rivenView,setRivenView]=useState<'veiled'|'unveiled'|'finder'|'mine'|'sniper'>('unveiled');const resourceChanged=useCallback((view:'inventory'|'plan'|'shards')=>setResourceView(view),[]),plannerChanged=useCallback((view:'mods'|'endo')=>setPlannerView(view),[]),rivenChanged=useCallback((view:'veiled'|'unveiled'|'finder'|'mine'|'sniper')=>setRivenView(view),[]);const [arbitrationView,setArbitrationView]=useState<ArbitrationView>(new URLSearchParams(location.search).get('view')==='history'?'history':'schedule');const [shardFocus,setShardFocus]=useState<ShardFocus>();const openShards=(target:ShardFocus)=>{setShardFocus(target);setNavigationRequest({page:'resources',view:'shards'});setResourceView('shards');setPage('resources');};const collection=useCollectionSnapshot();const {t}=useTranslation();const [analyticsView,setAnalyticsView]=useState<'personal'|'market'>('personal');const [marketView,setMarketView]=useState<'orders'|'contracts'>('orders');const [settingsOpen,setSettingsOpen]=useState(new URLSearchParams(location.search).get('page')==='settings');const [page,setCurrentPage]=useState(()=>{const p=new URLSearchParams(location.search).get('page');return ['world','overview','arbitrations','help','resources','rivens','market','analytics'].includes(p??'')?p!:'foundry';}),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[languages,setLanguages]=useState(()=>{try{return [...builtinLanguages,...readLanguagePacks(localStorage.getItem(packsKey)).map(({id,name})=>({id,name}))];}catch{return builtinLanguages;}});
const setPage=(target:string)=>{if(target==='settings'){setSettingsOpen(true);return;}setSettingsOpen(false);setCurrentPage(target);};
useEffect(()=>{if(!appPreferences.statsTabEnabled&&page==='overview')setCurrentPage('foundry');},[appPreferences.statsTabEnabled,page]);
useEffect(()=>{if(!native)return;const off=listen('open-trade-finish',()=>setPage('market'));return()=>{void off.then(f=>f());};},[]);
useEffect(()=>{if(page!=='resources')setShardFocus(undefined);},[page]);
useEffect(()=>{const login=()=>{setMarketView('orders');setNavigationRequest({page:'market',view:'orders'});setPage('market');};window.addEventListener(marketLoginEvent,login);return()=>window.removeEventListener(marketLoginEvent,login);},[]);
useEffect(()=>{const market=(e:Event)=>{const target=inventoryTradeTarget((e as CustomEvent).detail);if(target){setMarketRequest(target);setPage('inventory');}};window.addEventListener('myframe-open-market',market);return()=>window.removeEventListener('myframe-open-market',market);},[]);
useEffect(()=>{if(page==='inventory'&&marketRequest){openInventoryTrade(marketRequest);setMarketRequest(null);}},[page,marketRequest]);
useEffect(()=>{setMessage('');setShardFocus(undefined);setMarketRequest(null);},[accountScope]);
const {data,stats,error:ledgerError,loading:ledgerLoading,refresh:refreshLedger}=useLedger(page,accountScope);
useEffect(()=>{let live=true;if(native)void invoke('collector_request_refresh').catch(e=>{if(live)setMessage(String(e));});window.dispatchEvent(new Event('myframe-collection-updated'));return()=>{live=false;};},[page]);
useEffect(()=>{document.documentElement.lang=i18n.language;},[i18n.language]);
const download=(value:unknown,name:string)=>{const u=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);};
async function onExport(){setBusy(true);try{if(native){const path=await invoke<string|null>('export_data',{kind:'backup',expectedScope:accountScope});if(path)setMessage('✓ '+t('export')+': '+path);}else download(data,'myframe-backup.json');}catch(e){setMessage(t('error')+': '+String(e));}finally{setBusy(false);}}
async function exportCsv(kind:'stats-csv'|'trades-csv'){setBusy(true);try{const path=await invoke<string|null>('export_data',{kind,expectedScope:accountScope});if(path)setMessage('✓ '+t('export')+': '+path);}catch(e){setMessage(t('error')+': '+String(e));}finally{setBusy(false);}}
async function onImport(file?:File){if(!file)return;setBusy(true);try{if(file.size>20*1024*1024)throw new Error('20 MiB limit');const d=await save(await file.text(),accountScope);await refreshLedger();setMessage('✓ '+t('records')+': '+(d.trades.length+(d.exchanges?.length??0)+d.generalDataPoints.length));}catch(e){setMessage(t('error')+': '+String(e));}finally{setBusy(false);}}
async function onImportRivens(file?:File){if(!file)return;setBusy(true);try{if(!native)throw Error('请在桌面版导入');if(file.size>10*1024*1024)throw Error('文件超过10MiB');const input=JSON.parse(await file.text()),rivens=Array.isArray(input)?input:input.rivens;if(!Array.isArray(rivens))throw Error('需要紫卡数组或含rivens字段的快照');const base=await invoke<any>('load_collection')??{schemaVersion:1,capturedAt:new Date().toISOString(),source:'manual',complete:false,masteryRank:null,credits:null,counts:{},ranks:{},favorites:[]};await invoke('import_collection',{expectedScope:accountScope,input:JSON.stringify({...base,rivens})});window.dispatchEvent(new Event('myframe-collection-updated'));setMessage('紫卡已导入');}catch(e){setMessage(String(e));}finally{setBusy(false);}}
async function changeLanguage(id:string){await changeUiLanguage(id);}
async function onLanguage(file?:File){if(!file)return;try{if(file.size>1024*1024)throw new Error('1 MiB limit');const p=parseLanguagePack(JSON.parse(await file.text()));if(languages.some(x=>x.id.toLowerCase()===p.id.toLowerCase()))throw Error('Language already exists');const packs=readLanguagePacks(localStorage.getItem(packsKey));localStorage.setItem(packsKey,JSON.stringify([...packs,p]));i18n.addResourceBundle(p.id,'translation',p.messages);setLanguages([...languages,{id:p.id,name:p.name}]);await changeLanguage(p.id);}catch(e){setMessage(String(e));}}
return <div className="app"><RivenMonitorRuntime/><MarketAutoRuntime/><WelcomeTour onNavigate={setPage}/><InventoryChanges key={"changes:"+accountScope}/><Navigation key={"navigation:"+accountScope} page={page} activeDetail={page==='analytics'?{page:'analytics',view:analyticsView}:page==='market'?{page:'market',view:marketView}:page==='resources'?{page:'resources',view:resourceView}:page==='planner'?{page:'planner',view:plannerView}:page==='rivens'?{page:'rivens',view:rivenView}:undefined} onNavigateDetail={detail=>{setNavigationRequest({...detail});if(detail.page==='market')setMarketView(detail.view);if(detail.page==='analytics')setAnalyticsView(detail.view);}} onNavigate={setPage} arbitrationView={arbitrationView} onArbitrationView={setArbitrationView}/><main className={['foundry','mastery','inventory'].includes(page)?'collectionPage'+(page==='mastery'?' masteryPage':''):['resources','planner'].includes(page)?'resourcesPage'+(page==='planner'?' plannerPage':''):page==='relic'?'relicPage':page==='market'?'marketPage tradingPage':page==='analytics'?'analyticsPage tradingPage':page==='rivens'?'rivenWorkspace tradingPage':page==='arbitrations'?'arbitrationsPage':page==='overview'?'statsPage':page==='world'?'worldPage':''}>{page==='world'&&<header><h1>{t(page)}</h1></header>}{message&&page!=='arbitrations'&&<p className="notice" role="status">{message}</p>}
{['foundry','mastery','inventory'].includes(page)&&<CollectionWorldLayout key={accountScope} foundry={page==='foundry'}><div className="collectionWorldMain"><header className="pageSectionHeading"><h1>{t(page)}</h1></header><Collection page={page} onOpenShards={openShards}/></div><WorldRailSidebar onNavigate={target=>{if(target==='arbitrations')setArbitrationView('schedule');setPage(target);}}/></CollectionWorldLayout>}
{page==='overview'&&<>{ledgerLoading&&<p role="status">{i18n.language.startsWith('en')?'Refreshing ledger…':'正在刷新账目…'}</p>}{ledgerError&&<p role="alert">{i18n.language.startsWith('en')?'Could not refresh ledger: ':'账目刷新失败：'}{ledgerError} <button onClick={()=>void refreshLedger()}>{i18n.language.startsWith('en')?'Retry':'重试'}</button></p>}</>}{page==='world'&&<WorldPanel/>}{page==='arbitrations'&&<div className="arbitrationPageLayout">{arbitrationView==='history'?<ArbitrationRuns key={accountScope} onSettings={()=>setPage('settings')}/>:<Arbitrations view={arbitrationView} onView={setArbitrationView} onSettings={()=>setPage('settings')}/>}<EventSidebar onNavigate={target=>{if(target==='arbitrations')setArbitrationView('schedule');setPage(target);}}/></div>}
{page==='overview'&&<div className="statsWorkspace"><AssetHistory key={accountScope} points={data.generalDataPoints} trades={data.trades} exchanges={data.exchanges}/><EventSidebar onNavigate={target=>{if(target==='arbitrations')setArbitrationView('schedule');setPage(target);}}/></div>}
{page==='analytics'&&<CollectionWorldLayout foundry={false}><div className="collectionWorldMain"><TradeRankings error={ledgerError} loading={ledgerLoading} onRefresh={()=>void refreshLedger()} key={accountScope} requestedView={analyticsView} onViewChange={setAnalyticsView} trades={data.trades} exchanges={data.exchanges} stats={stats}/></div><WorldRailSidebar onNavigate={target=>{if(target==='arbitrations')setArbitrationView('schedule');setPage(target);}}/></CollectionWorldLayout>}
<div hidden={page!=='analytics'}><TradeInbox key={accountScope}/></div>
{page==='help'&&<Help onNavigate={setPage}/>}
{page==='market'&&marketView==='contracts'&&<CollectionWorldLayout foundry={false}><div className="collectionWorldMain"><RivenMarket key={'contracts:'+accountScope} contractsOnly onOrders={()=>{setMarketView('orders');setNavigationRequest({page:'market',view:'orders'});}}/></div><WorldRailSidebar onNavigate={target=>{if(target==='arbitrations')setArbitrationView('schedule');setPage(target);}}/></CollectionWorldLayout>}{page==='market'&&marketView==='orders'&&<Market onContracts={()=>{setMarketView('contracts');setNavigationRequest({page:'market',view:'contracts'});}} key={accountScope} rail={<WorldRail view="timers" onNavigate={setPage}/>} fissures={<WorldRail view="fissures" onNavigate={setPage}/>}/>}{page==='rivens'&&<CollectionWorldLayout foundry={false}><div className="collectionWorldMain"><RivenMarket key={accountScope} requestedView={navigationRequest?.page==='rivens'?navigationRequest:undefined} onViewChange={rivenChanged}/></div><WorldRailSidebar onNavigate={target=>{if(target==='arbitrations')setArbitrationView('schedule');setPage(target);}}/></CollectionWorldLayout>}
{page==='relic'&&<CollectionWorldLayout foundry={false}><div className="collectionWorldMain"><RelicPlanner key={accountScope}/></div><WorldRailSidebar onNavigate={target=>{if(target==='arbitrations')setArbitrationView('schedule');setPage(target);}}/></CollectionWorldLayout>}
{page==='planner'&&<ModPlanner key={accountScope} requestedView={navigationRequest?.page==='planner'?navigationRequest:undefined} onViewChange={plannerChanged}/>}
{page==='resources'&&<CollectionWorldLayout key={accountScope} foundry={false}><Resources shardFocus={shardFocus} requestedView={navigationRequest?.page==='resources'?navigationRequest:undefined} onViewChange={resourceChanged}/><WorldRailSidebar onNavigate={target=>{if(target==='arbitrations')setArbitrationView('schedule');setPage(target);}}/></CollectionWorldLayout>}
{settingsOpen&&<Settings onExport={onExport} exportBusy={busy} onClose={()=>setSettingsOpen(false)} languages={languages} onLanguageChange={changeLanguage} onNavigate={setPage}><div className="settingsDataTools"><ArbitrationDataTools key={accountScope}/><RelicCapture/><details className="settingsBackup" open><summary>{i18n.language.startsWith('en')?'Statistics & trades':'统计与交易'}</summary><div className="settingsBackupActions"><button disabled={busy} onClick={()=>void onExport()}>{t('export')}</button><button disabled={!native||busy} onClick={()=>void exportCsv('stats-csv')}>{i18n.language.startsWith('en')?'Statistics CSV':'统计 CSV'}</button><button disabled={!native||busy} onClick={()=>void exportCsv('trades-csv')}>{i18n.language.startsWith('en')?'Trades CSV':'交易 CSV'}</button><label className={'settingsImport settingsFile '+(busy?'disabled':'')}>{t('import')}<input type="file" accept=".json" disabled={busy} onChange={e=>{void onImport(e.target.files?.[0]);e.target.value='';}}/></label></div></details><div className="settingsTransfers"><label className="primary settingsFile">{i18n.language.startsWith('en')?'Import rivens':'导入紫卡'}<input type="file" accept=".json" disabled={busy||!native} onChange={e=>{void onImportRivens(e.target.files?.[0]);e.target.value='';}}/></label><button disabled={!native||busy} onClick={()=>void invoke('export_data',{kind:'inventory',expectedScope:accountScope}).catch(e=>setMessage(String(e)))}>{i18n.language.startsWith('en')?'Export inventory':'导出库存'}</button><label className="primary settingsFile">{i18n.language.startsWith('en')?'Import inventory snapshot':'导入库存快照'}<input type="file" accept=".json" disabled={busy||!native} onChange={async e=>{const f=e.target.files?.[0];e.target.value='';if(!f)return;setBusy(true);try{if(f.size>20*1024*1024)throw Error('文件过大');await invoke('import_collection',{expectedScope:accountScope,input:await f.text()});window.dispatchEvent(new Event('myframe-collection-updated'));setMessage('库存已导入');}catch(err){setMessage(String(err));}finally{setBusy(false);}}}/></label></div><p>{t('replace')}</p><p>{t('itemNote')}</p><label className="primary settingsFile">{t('addLanguage')}<input type="file" accept=".json" onChange={e=>{void onLanguage(e.target.files?.[0]);e.target.value='';}}/></label><button onClick={()=>download({generalDataPoints:[],trades:[{id:'example-1',ts:'2026-10-23T00:00:00Z',itemId:'example-item',name:'示例物品 / Example item',side:'sale',quantity:1,platinum:20,partner:'',category:'other'}]},'myframe-trade-example.json')}>{t('sample')}</button></div></Settings>}
</main></div>;}
installClientDiagnostics();
void i18nReady.then(()=>createRoot(document.getElementById('root')!).render(<React.StrictMode>{new URLSearchParams(location.search).has('overlay')?<AccountProvider><GameOverlay/></AccountProvider>:<WindowShell><StartupUpdate><AccountProvider><WorldProvider>{new URLSearchParams(location.search).get('arbitrationLive')==='1'?<ArbitrationLive/>:<StatsShareProvider><App/></StatsShareProvider>}</WorldProvider></AccountProvider></StartupUpdate></WindowShell>}</React.StrictMode>));



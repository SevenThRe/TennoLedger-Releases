import {visibleBounds} from './viewportBounds';
import {currentLanguagePreference} from './i18n';
import {useArbitrationRuns} from './useArbitrationRuns';
import {createPortal} from 'react-dom';
import MarketPreferences from './MarketPreferences';
import OverlaySettings from './OverlaySettings';
import StatsSharing from './StatsSharing';
import ThemeSettings from './ThemeSettings';
import NotificationPreferences from './NotificationPreferences';
import WorldRewardPreferences from './WorldRewardPreferences';
import {useAppPreferences} from './useAppPreferences';
import {replayWelcome} from './Help';
import {useEffect,useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {useTranslation} from 'react-i18next';
import {invoke} from '@tauri-apps/api/core';
import {native} from './api';
import {useZoom,useAppearance} from './useUiPreferences';
import {useMasteryPreferences} from './masteryPreferences';
import {useCollector} from './Collector';
import AccountProfiles from './AccountProfiles';
import './settings.css';

export default function Settings({languages,onLanguageChange,onNavigate,onClose,onExport,exportBusy=false,children}:{onExport?:()=>unknown;exportBusy?:boolean;onClose:()=>void;languages:{id:string;name:string}[];onLanguageChange:(id:string)=>Promise<unknown>;onNavigate:(page:string)=>void;children:ReactNode}){
 const {i18n}=useTranslation(),en=i18n.language.startsWith('en'),L=(zh:string,english:string)=>en?english:zh;
 const panel=useRef<HTMLElement>(null),[bounds,setBounds]=useState({left:0,top:48,width:innerWidth,height:innerHeight-48});
 useLayoutEffect(()=>{const before=document.activeElement as HTMLElement|null;const main=document.querySelector<HTMLElement>('.app>main');const root=main?.querySelector<HTMLElement>('.collectionWorldMain,.arbitrationWorkspace,.statsContent,.marketBoard')??main;const wasInert=root?.inert;if(root)root.inert=true;const place=()=>{if(root){const r=root.getBoundingClientRect();setBounds(visibleBounds(r,{width:innerWidth,height:innerHeight},document.querySelector('.windowContent')?.getBoundingClientRect()));}};place();const observer=new ResizeObserver(place);if(root)observer.observe(root);window.addEventListener('resize',place);document.addEventListener('scroll',place,true);panel.current?.focus();return()=>{observer.disconnect();window.removeEventListener('resize',place);document.removeEventListener('scroll',place,true);if(root)root.inert=wasInert??false;before?.focus();};},[]);
 const [tab,setTab]=useState('general'),[error,setError]=useState(''),[notice,setNotice]=useState(''),[working,setWorking]=useState(false);
 const [appPreferences,setAppPreferences,preferenceError,preferenceReady]=useAppPreferences();
 const [zoom,setZoom]=useZoom(),[appearance,setAppearance]=useAppearance(),[mastery,setMastery]=useMasteryPreferences();
 const collector=useCollector();
 const arbitration=useArbitrationRuns();
 async function run(action:()=>unknown|Promise<unknown>){setError('');setNotice('');setWorking(true);try{await action();}catch(e){setError(String(e));}finally{setWorking(false);}}
 const row=(label:string,control:ReactNode,hint?:string)=><div className="settingRow"><div><span>{label}</span>{hint&&<small>{hint}</small>}</div>{control}</div>;
 const toggle=(label:string,checked:boolean,onChange:()=>unknown,disabled=false)=><label className="settingRow"><span>{label}</span><input type="checkbox" role="switch" checked={checked} disabled={disabled||working} onChange={()=>void run(onChange)}/></label>;
 const group=(title:string,body:ReactNode)=><section className="settingGroup"><h2>{title}</h2>{body}</section>;
 return createPortal(<div className="settingsBackdrop" style={bounds} onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><section ref={panel} tabIndex={-1} role="dialog" aria-modal="false" aria-labelledby="settings-title" className="settingsPage" onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();onClose();}if(e.key==='Tab'){const nodes=[...e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary,[tabindex="0"]')].filter(n=>n.getClientRects().length);const first=nodes[0],last=nodes.at(-1);if(!first){e.preventDefault();return;}if(e.shiftKey&&(document.activeElement===first||document.activeElement===panel.current)){e.preventDefault();last?.focus();}else if(!e.shiftKey&&(document.activeElement===last||document.activeElement===panel.current)){e.preventDefault();first.focus();}}}}><div className="settingsDialogHeader"><h2 id="settings-title">{L('设置','Settings')}</h2><button autoFocus aria-label={L('关闭设置','Close settings')} onClick={onClose}><img src="/reference/ui/close.png" alt=""/></button></div>
  <div className="settingsTabs" role="tablist" aria-label={L('设置分类','Settings categories')}>{[['general',L('通用','General')],['overlays',L('覆盖层','Overlays')],['notifications',L('通知','Notifications')],['themes',L('主题','Themes')],['premium',L('数据','Data')]].map(([id,label])=><button key={id} id={'settings-tab-'+id} type="button" role="tab" tabIndex={tab===id?0:-1} onKeyDown={e=>{const ids=['general','overlays','notifications','themes','premium'];const index=ids.indexOf(id);const next=e.key==='ArrowRight'?ids[(index+1)%ids.length]:e.key==='ArrowLeft'?ids[(index+ids.length-1)%ids.length]:e.key==='Home'?ids[0]:e.key==='End'?ids.at(-1):null;if(next){e.preventDefault();setTab(next);document.getElementById('settings-tab-'+next)?.focus();}}} aria-selected={tab===id} aria-controls={'settings-panel-'+id} onClick={()=>{setTab(id);setError('');setNotice('');}}>{label}</button>)}</div>
  {error&&<p className="settingsError" role="alert">{error}</p>}{notice&&<p className="settingsNotice" role="status">{notice}</p>}
  <div className="settingsBody" role="tabpanel" id={'settings-panel-'+tab} aria-labelledby={'settings-tab-'+tab}>
  {tab==='general'&&<>
   {group(L('应用与启动','App & startup'),<>
   {row(L('了解天诺手账','Get to know TennoLedger'),<button onClick={()=>{onClose();replayWelcome();}}>{L('重播欢迎引导','Replay welcome tour')}</button>)}
   {toggle(L('关闭时确认','Confirm before closing'),appPreferences.warnOnClose,()=>setAppPreferences({...appPreferences,warnOnClose:!appPreferences.warnOnClose}))}
   {toggle(L('启动时移到副屏','Open on secondary monitor'),appPreferences.launchOnSecondary,()=>setAppPreferences({...appPreferences,launchOnSecondary:!appPreferences.launchOnSecondary}))}
   {toggle(L('仲裁开始时自动打开实时窗口','Open live Arbitration window when a run starts'),arbitration.status.autoOpen,async()=>{await invoke('arbitration_set_auto_live',{enabled:!arbitration.status.autoOpen});arbitration.refresh();},!arbitration.canEdit||arbitration.loading)}
   {toggle(L('显示资产总览','Show Stats page'),appPreferences.statsTabEnabled,()=>setAppPreferences({...appPreferences,statsTabEnabled:!appPreferences.statsTabEnabled}),!preferenceReady)}
   {preferenceError&&<p role="alert">{preferenceError}</p>}
   </>)}
   {group(L('库存与精通','Inventory & mastery'),<>
    {toggle(L('铸造厂、库存和遗物默认显示全部物品','Show all items by default in the Foundry, Inventory and Relic tabs'),appPreferences.fullInventoryExperienceEnabled,()=>setAppPreferences({...appPreferences,fullInventoryExperienceEnabled:!appPreferences.fullInventoryExperienceEnabled}),!preferenceReady)}
    {toggle(L('隐藏创始人装备','Hide Founders items'),mastery.hideFounders,()=>setMastery({...mastery,hideFounders:!mastery.hideFounders}))}
    {toggle(L('计入需要 Forma 的等级经验','Include levels requiring Forma'),mastery.includeForma,()=>setMastery({...mastery,includeForma:!mastery.includeForma}))}
   </>)}
   <MarketPreferences/>
   {group(L('语言','Language'),row(L('界面语言','Interface language'),<select aria-label={L('界面语言','Interface language')} value={currentLanguagePreference()} disabled={working} onChange={e=>void run(()=>onLanguageChange(e.target.value))}><option value="auto">{L('跟随 Warframe','Follow Warframe')}</option>{languages.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select>))}
  </>}
  {tab==='overlays'&&<OverlaySettings/>}
  {tab==='themes'&&<ThemeSettings/>}
  {tab==='notifications'&&<NotificationPreferences/>}
  {tab==='premium'&&<>
   {group(L('数据导出','Data export'),<div className="settingsPremiumFeature"><div><strong>{L('导出所有数据','Export all my data')}</strong><p className="settingsHint">{L('保存一份已记录的数据到桌面','Save a copy of your recorded data to your desktop')}</p></div><button disabled={!onExport||exportBusy} onClick={()=>void run(()=>onExport?.())}>{L('导出到桌面','Export to desktop')}</button></div>)}
   <details className="settingsMaintenance"><summary>{L('数据与连接','Data & connections')}</summary><div className="settingsDataTools">{children}</div><AccountProfiles/><StatsSharing/>
    {group(L('数据采集','Data collection'),<>
     {toggle(L('记录资产统计','Record asset statistics'),appPreferences.recordStats,()=>setAppPreferences({...appPreferences,recordStats:!appPreferences.recordStats}))}
     {toggle(L('自动同步游戏数据','Automatically sync game data'),collector.status.enabled,async()=>{collector.setStatus(await invoke('collector_set_enabled',{enabled:!collector.status.enabled}));},!native||collector.status.code==='preview'||collector.status.code==='worker-start-failed')}
     {row(L('账户同步','Account sync'),<button disabled={!native||working||!collector.status.enabled||collector.status.scanCode==='helper-fetching'} onClick={()=>void run(async()=>{if(!await invoke<boolean>('collector_request_refresh'))throw Error(L('请先开启自动同步','Enable automatic sync first'));setNotice(L('已请求同步','Sync requested'));})}>{L('立即同步','Sync now')}</button>)}
    </>)}
    {group(L('显示','Display'),<>
     {row(L('界面缩放','Interface scale'),<select value={zoom} onChange={e=>void run(()=>setZoom(Number(e.target.value)))}>{Array.from({length:9},(_,i)=>70+i*10).map(n=><option key={n} value={n}>{n}%</option>)}</select>)}
     {toggle(L('减少界面动画','Reduce interface motion'),appearance.reducedMotion,()=>setAppearance({...appearance,reducedMotion:!appearance.reducedMotion}))}
    </>)}
    <WorldRewardPreferences/>
   </details>
  </>}
  </div>
 </section></div>,document.body);
}

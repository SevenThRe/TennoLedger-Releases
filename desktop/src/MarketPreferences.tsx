import {useEffect,useState} from 'react';
import {useTranslation} from 'react-i18next';
import {invoke} from '@tauri-apps/api/core';
import {native} from './api';
import {useAppPreferences} from './useAppPreferences';
import {useMarketSession,sessionChanged} from './MarketAccount';
import {marketPreferenceKey,marketPreferenceEvent,parseMarketPreferences,type MarketPreferences} from './marketPreferencesModel';
export function useMarketPreferences(){
 const read=()=>{try{return parseMarketPreferences(localStorage.getItem(marketPreferenceKey));}catch{return parseMarketPreferences(null);}};
 const [preferences,setPreferences]=useState(read),[error,setError]=useState('');
 useEffect(()=>{const reload=()=>setPreferences(read()),storage=(e:StorageEvent)=>{if(e.key===marketPreferenceKey||e.key===null)reload();};window.addEventListener(marketPreferenceEvent,reload);window.addEventListener('storage',storage);return()=>{window.removeEventListener(marketPreferenceEvent,reload);window.removeEventListener('storage',storage);};},[]);
 function update(patch:Partial<MarketPreferences>){try{const next={...read(),...patch};localStorage.setItem(marketPreferenceKey,JSON.stringify(next));setPreferences(next);setError('');window.dispatchEvent(new Event(marketPreferenceEvent));}catch{setError('市场偏好保存失败');}}
 return {preferences,update,error};
}
export default function MarketPreferences(){
 const {i18n}=useTranslation(),en=i18n.language.startsWith('en'),L=(zh:string,eng:string)=>en?eng:zh;
 const {preferences:p,update,error}=useMarketPreferences(),[app,setApp,appError,ready]=useAppPreferences(),session=useMarketSession(),[busy,setBusy]=useState(false),[actionError,setActionError]=useState('');
 const logout=async()=>{setBusy(true);setActionError('');try{await invoke('market_logout');sessionChanged();}catch(e){setActionError(String(e));}finally{setBusy(false);}};
 return <section className="settingGroup marketPreferences"><div className="settingsSectionHeader"><h2>Warframe.market</h2>{session.connected&&<button className="settingsLogout" disabled={!native||busy} onClick={()=>void logout()}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 4H4v16h5M10 12h10m-4-4 4 4-4 4"/></svg>{L('退出登录','Log out')}</button>}</div>
 <label className="settingRow"><span>{L('市场“缺少物品”检查计入 MOD 等级',"Take mod rank into account for the WFM 'missing items' check")}</span><input type="checkbox" role="switch" disabled={!ready} checked={app.takeRankIntoAccount} onChange={e=>void setApp({...app,takeRankIntoAccount:e.target.checked}).catch(()=>{})}/></label>
 <label className="settingRow"><span>{L('批量更新“最低价”','Bulk "lowest price" updates')}</span><select aria-label={L('批量改价来源','Bulk lowest price source')} value={p.bulkOrderPriceSource} onChange={e=>update({bulkOrderPriceSource:e.target.value==='aleca-public'?'aleca-public':e.target.value==='local-cache'?'local-cache':'live'})}><option value="aleca-public">{L('AlecaFrame（推荐）','AlecaFrame (recommended)')}</option><option value="live">{L('warframe.market（实时）','warframe.market (live)')}</option>{p.bulkOrderPriceSource==='local-cache'&&<option value="local-cache">{L('本地缓存','Local cache')}</option>}</select></label>
 <p className="settingsHint">{L('AlecaFrame 报价让更新更快、更安全，并降低价格操纵影响。选择 warframe.market 可检查实时报价；没有匹配报价时保留原订单。','AlecaFrame prices make updates faster and safer, with better protection against price manipulation. Choose warframe.market to check live prices instead. Orders stay unchanged if no matching price is found.')}</p>
 <label className="settingRow"><span>{L('买入 / 卖出仅显示游戏中玩家','In-game traders only in Buy / Sell')}</span><input type="checkbox" role="switch" checked={p.marketInGameOnly} onChange={e=>update({marketInGameOnly:e.target.checked})}/></label>
 <p className="settingsHint">{L('关闭后同时显示在线与离线玩家','Turn off to also show Online and Offline traders')}</p>
 <label className="settingRow"><span>{L('重启后记住市场 Auto 状态',"Remember WFM 'Auto' status when AlecaFrame is restarted")}</span><input type="checkbox" role="switch" checked={p.autoKeepEnabled} onChange={e=>update({autoKeepEnabled:e.target.checked})}/></label>
 <label className="settingRow"><span>{L('切换 Auto 模式时不再询问是否记住',`Don't show "remember Auto status" window when changing 'Auto' mode`)}</span><input type="checkbox" role="switch" checked={p.skipWarningAutoKeep} onChange={e=>update({skipWarningAutoKeep:e.target.checked})}/></label>
 {(error||appError||actionError)&&<p role="alert">{error||appError||actionError}</p>}
 </section>;
}

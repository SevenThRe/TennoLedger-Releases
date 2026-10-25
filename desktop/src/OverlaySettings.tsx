import MenuScaleSettings from './MenuScaleSettings';
import {useEffect,useState} from 'react';import {invoke} from '@tauri-apps/api/core';import {useTranslation} from 'react-i18next';import {native} from './api';import {overlayDefaults,parseOverlayPreferences,type OverlayPreferences,type OverlayKind} from './overlayModel';
export default function OverlaySettings(){const {i18n}=useTranslation(),en=i18n.language.startsWith('en'),L=(a:string,b:string)=>en?b:a;const [preferences,setPreferences]=useState(overlayDefaults),[loaded,setLoaded]=useState(!native),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{let live=true;if(native)void invoke<OverlayPreferences>('overlay_preferences').then(v=>{if(live){setPreferences(parseOverlayPreferences(v));setLoaded(true);}}).catch(e=>{if(live)setError(String(e));});return()=>{live=false;};},[]);
 async function save(next:OverlayPreferences){setBusy(true);setError('');try{setPreferences(await invoke<OverlayPreferences>('overlay_set_preferences',{preferences:next}));}catch(e){setError(String(e));}finally{setBusy(false);}}
 useEffect(()=>{if(!native)return;let live=true;const poll=()=>void invoke<Record<string,string>>('overlay_status').then(errors=>{if(live&&Object.keys(errors).length)setError(Object.entries(errors).map(([kind,message])=>kind+': '+message).join(' · '));}).catch(()=>{});const timer=setInterval(poll,1500);return()=>{live=false;clearInterval(timer);};},[]);
 const row=(key:keyof Omit<OverlayPreferences,'scale'>,zh:string,eng:string)=><label className="settingRow"><span>{L(zh,eng)}</span><input type="checkbox" role="switch" checked={preferences[key]} disabled={!native||!loaded||busy} onChange={e=>void save({...preferences,[key]:e.target.checked})}/></label>;
 return <>
  <section className="settingGroup"><h2>{L('遗物','Relics')}</h2>
   {row('relicRewards','启用遗物奖励覆盖层','Enable relic rewards overlay')}
   {row('relicRecommendations','启用遗物推荐覆盖层','Enable relic recommendations overlay')}
   {row('showBalances','在遗物覆盖层中显示账户杜卡德与白金','Show account ducats and platinum on relic overlay')}
   {row('copyRewards','打开遗物后复制奖励数据到剪贴板','Copy relic reward data to clipboard when a relic is opened')}
  </section>
  <section className="settingGroup"><h2>{L('交易与紫卡','Trading & rivens')}</h2>
   {row('tradeFinished','启用交易完成检测与覆盖层','Enable trade finished detection/overlay')}
   <label className="settingRow"><span>{L('启用紫卡覆盖层','Enable riven overlays')}</span><input type="checkbox" role="switch" checked={preferences.rivenChat&&preferences.rivenReroll} disabled={!native||!loaded||busy} onChange={e=>void save({...preferences,rivenChat:e.target.checked,rivenReroll:e.target.checked})}/></label>
  </section>
  <MenuScaleSettings/>
  <details className="settingsMaintenance"><summary>{L('覆盖层控制','Overlay controls')}</summary><section className="settingGroup">
   {row('enabled','启用游戏覆盖层','Enable game overlays')}{row('gameNotifications','游戏内通知','In-game notifications')}{row('clickThrough','鼠标穿透','Pass mouse input through')}
   <label className="settingRow"><span>{L('覆盖层缩放','Overlay scale')}</span><select value={preferences.scale} disabled={!native||!loaded||busy} onChange={e=>void save({...preferences,scale:Number(e.target.value)})}>{Array.from({length:9},(_,i)=>70+i*10).map(n=><option key={n} value={n}>{n}%</option>)}</select></label>
   <div className="settingsActions">{(['relic-rewards','relic-recommendations','trade-finished','riven-chat','riven-reroll','game-notification'] as OverlayKind[]).map((kind,index)=><button key={kind} disabled={!native||busy} onClick={()=>void invoke('overlay_preview',{kind}).catch(e=>setError(String(e)))}>{L(['奖励预览','推荐预览','成交预览','紫卡预览','洗练预览','通知预览'][index],['Rewards preview','Recommendation preview','Trade preview','Riven preview','Reroll preview','Notification preview'][index])}</button>)}</div>
  </section></details>
  {error&&<p role="alert">{error}</p>}
 </>;
}

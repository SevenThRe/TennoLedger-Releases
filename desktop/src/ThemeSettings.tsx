import {useEffect,useState} from 'react';
import {useTranslation} from 'react-i18next';
import {useTheme,useThemeLibrary} from './useTheme';
import {native} from './api';
import {themeCatalog} from './themeCatalog';
import {parseTheme,parseThemeText,serializeTheme,serializeThemeCss,serializeAlecaTheme,themePresets,themeSlots,changeThemeSlot,type Theme,type ThemeSlot} from './themeModel';
import './theme.css';
const labels:Record<ThemeSlot,[string,string]>={'color-bg-1':['背景 1','Background 1'],'color-bg-2':['背景 2','Background 2'],'color-bg-3':['背景 3','Background 3'],'color-card':['卡片','Card'],'color-card-hover':['卡片 · 悬停','Card - Hover'],'color-card-active':['卡片 · 按下','Card - Active'],'color-tab':['标签','Tab'],'color-tab-hover':['标签 · 悬停','Tab - Hover'],'color-tab-active':['标签 · 选中','Tab - Active'],'color-buy':['买入','Buy'],'color-buy-hover':['买入 · 悬停','Buy - Hover'],'color-buy-active':['买入 · 按下','Buy - Active'],'color-sell':['卖出','Sell'],'color-sell-hover':['卖出 · 悬停','Sell - Hover'],'color-sell-active':['卖出 · 按下','Sell - Active'],'color-navigation':['导航','Navigation'],'color-navigation-hover':['导航 · 悬停','Navigation - Hover'],'color-navigation-active':['导航 · 选中','Navigation - Active'],'color-text':['文字','Text'],'color-text-bg':['背景上文字','Text on BG'],'color-icons':['图标','Icons'],'color-icons-bg':['背景上图标','Icons on BG']};
export default function ThemeSettings(){const {i18n}=useTranslation(),en=i18n.language.startsWith('en'),L=(a:string,b:string)=>en?b:a;
 const [saved,save,storageError]=useTheme(),presets=useThemeLibrary(),[draft,setDraft]=useState(saved??themePresets[0]),[message,setMessage]=useState('');
 useEffect(()=>setDraft(saved??themePresets[0]),[saved]);
 async function run(fn:()=>unknown|Promise<unknown>){try{setMessage('');await fn();}catch(e){setMessage(String(e));}}
 const apply=(theme:Theme)=>{const clean=parseTheme(theme);setDraft(clean);save(clean);};
 const importTheme=async(text:string)=>{const theme=parseThemeText(text);await presets.add(theme);apply(theme);setMessage(L('主题已导入','Theme imported'));};
 const active=(theme:Theme)=>saved?.name===theme.name&&saved.author===theme.author&&JSON.stringify(saved.palette)===JSON.stringify(theme.palette);
 const download=(text:string,extension:string)=>{const url=URL.createObjectURL(new Blob([text],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=(draft.name.replace(/[^\p{L}\p{N} _-]/gu,'').slice(0,64)||'tennoledger-theme')+extension;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 return <div className="themeSettings">
 <section className="settingGroup"><h2>{L('社区主题','Community themes')}</h2><div className="themePresets">
  <button aria-pressed={!saved} onClick={()=>void run(()=>save(null))}><span className="themePresetImage"><img src="/tenno-ledger.svg" alt=""/></span><span className="themePresetName">{L('默认','Default')}</span><small className="themePresetAuthor">TennoLedger</small></button>
  {themeCatalog(presets.library).map(theme=><button key={theme.name+'\0'+theme.author} aria-pressed={active(theme)} onClick={()=>void run(()=>apply(theme))}><span className="themePresetImage">{theme.iconBase64?<img src={'data:image/png;base64,'+theme.iconBase64} alt=""/>:<span className="themePreview" style={{background:theme.palette['color-bg-1'],borderColor:theme.palette['color-tab-active']}}/>}</span><span className="themePresetName">{theme.name}</span><small className="themePresetAuthor">{theme.author}</small></button>)}
 </div></section>
 <section className="settingGroup"><h2>{L('颜色与覆盖层','Colors & overlays')}</h2>
 <label className="settingRow themeOverlayToggle"><input type="checkbox" role="switch" checked={draft.applyToOverlays} onChange={e=>void run(()=>apply({...draft,applyToOverlays:e.target.checked}))}/><span>{L('主题应用到覆盖层','Apply themes to overlays')}</span></label>
 <div className="themeColors">{themeSlots.map(slot=><label key={slot}><input type="color" data-theme-slot={slot} aria-label={L(...labels[slot])} value={draft.palette[slot].slice(0,7)} onChange={e=>void run(()=>apply(changeThemeSlot(draft,slot,e.target.value+draft.palette[slot].slice(7))))}/>{L(...labels[slot])}</label>)}</div>
 </section>
 <section className="settingGroup"><h2>{L('分享','Sharing')}</h2>
 <div className="settingsActions themeShareActions"><button onClick={()=>void run(async()=>{apply(draft);await navigator.clipboard.writeText(serializeThemeCss(draft));setMessage(L('已复制','Copied'));})}>{L('复制到剪贴板','Copy to clipboard')}</button><button onClick={()=>void run(async()=>importTheme(await navigator.clipboard.readText()))}>{L('从剪贴板导入','Import from clipboard')}</button><button disabled={!native||presets.busy} onClick={()=>void run(presets.openDirectory)}>{L('打开主题目录','Open themes folder')}</button></div>
 <div className="themeMeta"><label>{L('主题名称','Theme name')}<input value={draft.name} maxLength={64} onChange={e=>setDraft({...draft,id:'custom',name:e.target.value})}/></label><label>{L('主题作者','Theme author')}<input value={draft.author} maxLength={64} onChange={e=>setDraft({...draft,author:e.target.value})}/></label><button onClick={()=>void run(()=>{apply(draft);download(serializeAlecaTheme(draft),'.alecatheme');})}>{L('导出主题文件','Export as theme file')}</button></div>
 </section>
 <details className="settingsMaintenance"><summary>{L('主题库管理','Theme library')}</summary><div className="settingsActions">
  <button disabled={presets.busy} onClick={()=>void run(presets.refresh)}>{presets.busy?L('读取主题…','Reading themes…'):L('刷新预设库','Refresh presets')}</button>
  <button onClick={()=>void run(async()=>{const theme=parseTheme(draft);await presets.add(theme);apply(theme);setMessage(L('预设已保存','Preset saved'));})}>{L('保存预设','Save preset')}</button>
  <label className="settingsFile">{L('导入主题文件','Import file')}<input type="file" multiple accept=".json,.alecatheme,.css,.txt" onChange={e=>{const files=[...e.target.files??[]];e.target.value='';if(files.length)void run(async()=>{if(files.length>50)throw Error(L('一次最多导入50个主题','Import at most 50 themes'));for(const file of files){if(file.size>65536)throw Error(L('主题文件过大','Theme too large'));await importTheme(await file.text());}});}}/></label>
  <button onClick={()=>void run(()=>download(serializeTheme(draft),'.json'))}>{L('导出 JSON','Export JSON')}</button>
 </div>
 <div className="themePresets">{themePresets.slice(1).map(theme=><button key={theme.id} aria-pressed={active(theme)} onClick={()=>void run(()=>apply(theme))}><span className="themePreview" style={{background:theme.palette['color-bg-1'],borderColor:theme.palette['color-tab-active']}}/>{theme.name}</button>)}</div>
 {presets.library.map(theme=><button key={theme.name+theme.author} onClick={()=>void run(()=>presets.remove(theme.name,theme.author))}>{L('移除 ','Remove ')+theme.name}</button>)}
 </details>
 {(message||storageError||presets.error)&&<p role="status">{message||storageError||presets.error}</p>}
 </div>;
}

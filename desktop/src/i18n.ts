import {invoke,isTauri} from '@tauri-apps/api/core';
import {languagePreference,launcherUiLanguage,followWarframeLanguage} from './languageModel';
import {readLanguagePacks,builtinLanguages,packsKey,languageKey} from './settingsModel';
import i18n from 'i18next';
import {initReactI18next} from 'react-i18next';
export const zh={world:'计时与警报',market:'市场交易',rivens:'紫卡市场',foundry:'铸造厂',mastery:'精通助手',inventory:'库存',overview:'资产总览',analytics:'交易分析',relic:'遗物规划',settings:'设置',import:'导入 JSON',export:'导出数据',empty:'导入统计或交易记录开始使用',revenue:'出售收入',expenses:'购买支出',net:'白金净流入',records:'记录数',platinum:'白金',credits:'现金',endo:'内融核心',completion:'收集完成度',date:'日期',name:'物品',bought:'买入数量',sold:'卖出数量',pending:'尚未接入',local:'本地数据',desktop:'桌面模式 · SQLite',preview:'浏览器预览 · 不保存数据',replace:'导入将替换当前统计和交易记录，建议先导出备份。',error:'操作失败',offline:'独立运行 / 离线优先',noData:'暂无记录',trades:'交易记录',language:'界面语言',addLanguage:'导入语言包',ocrNote:'本地 OCR 原型已建立；Rust OCR worker 与窗口采集尚未接入。',cashNote:'净流入 = 出售收入 − 购买支出，不是按成本核算的已实现利润。',dbNote:'桌面数据保存在应用数据目录的 myframe.sqlite3。导出文件不包含原产品用户哈希。',itemNote:'支持 MyFrame 与 AlecaFrame 交易记录，包含多物品买卖和交换。',sample:'下载交易格式示例',resources:'当前图片为本机参考资源，开源发行前须替换或核实授权。'};
export const en:Record<keyof typeof zh,string>={world:'Timers & Alerts',market:'Market',rivens:'Riven market',foundry:'Foundry',mastery:'Mastery helper',inventory:'Inventory',overview:'Asset overview',analytics:'Trading analytics',relic:'Relic planner',settings:'Settings',import:'Import JSON',export:'Export data',empty:'Import statistics or trades to begin',revenue:'Sales revenue',expenses:'Purchases',net:'Net platinum flow',records:'Records',platinum:'Platinum',credits:'Credits',endo:'Endo',completion:'Completion',date:'Date',name:'Item',bought:'Bought',sold:'Sold',pending:'Not connected',local:'Local data',desktop:'Desktop · SQLite',preview:'Browser preview · No persistence',replace:'Import replaces all current statistics and trades. Export a backup first.',error:'Operation failed',offline:'Independent / Local first',noData:'No records',trades:'Trades',language:'Interface language',addLanguage:'Import language pack',ocrNote:'Local OCR prototype exists; Rust OCR worker and window capture are not connected.',cashNote:'Net flow = sales revenue − purchases. This is not realized cost-basis profit.',dbNote:'Desktop data is stored in the app data directory as myframe.sqlite3. Exports exclude the original user hash.',itemNote:'Accepts MyFrame and AlecaFrame trades, including multi-item sales, purchases and exchanges.',sample:'Download trade schema example',resources:'Images are local reference assets. Verify permission or replace before open-source distribution.'};
let packs:ReturnType<typeof readLanguagePacks>=[];
try{packs=readLanguagePacks(localStorage.getItem(packsKey));}catch{}
export function currentLanguagePreference(){
 try{return languagePreference(localStorage.getItem(languageKey),[...builtinLanguages,...packs]);}catch{return followWarframeLanguage;}
}
async function launcherLanguage(){
 try{return isTauri()?launcherUiLanguage(await invoke('warframe_launcher_language')):'en';}catch{return 'en';}
}
export async function changeUiLanguage(preference:string){
 try{packs=readLanguagePacks(localStorage.getItem(packsKey));}catch{}
 const valid=languagePreference(preference,[...builtinLanguages,...packs]);
 const language=valid===followWarframeLanguage?await launcherLanguage():valid;
 try{localStorage.setItem(languageKey,valid);}catch{}
 await i18n.changeLanguage(language);
 document.documentElement.lang=language;
}
export const i18nReady=(async()=>{
 const preference=currentLanguagePreference();
 const language=preference===followWarframeLanguage?await launcherLanguage():preference;
 await i18n.use(initReactI18next).init({lng:language,fallbackLng:'en',resources:{'zh-CN':{translation:zh},en:{translation:en},...Object.fromEntries(packs.map(p=>[p.id,{translation:p.messages}]))},interpolation:{escapeValue:false}});
 document.documentElement.lang=language;
})();
export default i18n;

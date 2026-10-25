import {useState} from 'react';
import {useTranslation} from 'react-i18next';
import {useWorld,worldQA} from './WorldProvider';
import {native} from './api';
import {defaultDelivery} from './worldModel';
import {parseTimerLeadMinutes} from './settingsModel';
import './worldRewards.css';
export default function NotificationPreferences(){
 const {i18n}=useTranslation(),en=i18n.language.startsWith('en'),L=(zh:string,eng:string)=>en?eng:zh;
 const world=useWorld(),settings={...defaultDelivery(),...world.status.subscriptions.delivery},[url,setUrl]=useState(''),[template,setTemplate]=useState<string|null>(null),[conversation,setConversation]=useState<string|null>(null),[wfmTemplate,setWfmTemplate]=useState<string|null>(null),[error,setError]=useState('');
 const disabled=world.busy||!world.loaded||!native&&!worldQA;
 const update=async(patch:Partial<typeof settings>)=>{try{await world.save({...world.status.subscriptions,delivery:{...settings,...patch}});setError('');return true;}catch(e){setError(String(e));return false;}};
 const toggle=(key:'windowsEnabled'|'soundEnabled'|'onlyBackgroundGame'|'webhookEnabled',label:string)=><label className="settingRow"><span>{label}</span><input type="checkbox" role="switch" disabled={disabled||(key==='webhookEnabled'&&!settings.webhookConfigured)} checked={settings[key]} onChange={()=>void update({[key]:!settings[key]})}/></label>;
 return <>
 <section className="settingGroup"><h2>{L('渠道与声音','Delivery & sound')}</h2>
  {toggle('soundEnabled',L('启用通知声音','Enable notification sounds'))}
  {toggle('windowsEnabled',L('通过 Windows 发送通知','Send notifications through Windows'))}
  {toggle('webhookEnabled',L('通过 Discord 发送通知','Send notifications through Discord'))}
  {(settings.webhookEnabled||!settings.webhookConfigured)&&<div className="settingRow settingTemplate"><label htmlFor="settings-discord-webhook">Discord webhook URL</label><div className="settingsWebhook"><input id="settings-discord-webhook" type="password" autoComplete="off" value={url} disabled={disabled||!native} placeholder={settings.webhookConfigured?L('已保存','Saved'):L('留空停用','Empty to disable')} onChange={e=>setUrl(e.target.value)}/><button disabled={disabled||!native||!url.trim()} onClick={()=>void update({webhookUrl:url.trim(),webhookEnabled:true}).then(saved=>{if(saved)setUrl('');})}>{L('保存','Save')}</button>{settings.webhookConfigured&&<button disabled={disabled} onClick={()=>void update({clearWebhook:true,webhookEnabled:false})}>{L('移除','Remove')}</button>}</div></div>}
 </section>
 <section className="settingGroup"><h2>{L('世界周期提醒','World cycle reminders')}</h2><label className="settingRow"><span>{L('周期切换前提醒（分钟）','Notify before the cycle changes (minutes)')}</span><input type="number" min="0" max="60" aria-label={L('提前提醒分钟数','Cycle reminder lead minutes')} value={world.status.subscriptions.timerLeadMinutes??3} disabled={disabled} onChange={e=>{const value=Number(e.target.value);if(e.target.value!==''&&Number.isInteger(value)&&value>=0&&value<=60)void world.save({...world.status.subscriptions,timerLeadMinutes:parseTimerLeadMinutes(value)}).catch(e=>setError(String(e)));}}/></label></section>
 <section className="settingGroup"><h2>{L('Warframe 会话','Warframe conversations')}</h2>
  {toggle('onlyBackgroundGame',L('仅在 Warframe 位于后台时发送消息通知','Only send message notifications when Warframe is in the background'))}
  <label className="settingRow settingTemplate"><span>{L('消息模板（支持 Discord 提及）','Message template (accepts Discord pings)')}</span><input type="text" placeholder={L('留空停用','Empty to disable')} disabled={disabled} maxLength={1500} value={conversation??settings.conversationTemplate??''} onChange={e=>setConversation(e.target.value)} onBlur={()=>{if(conversation!==null)void update({conversationTemplate:conversation,conversationEnabled:!!conversation.trim()}).then(saved=>{if(saved)setConversation(null);});}}/></label><p className="settingsHint">{L('使用 <PLAYER_NAME> 代表 Warframe 玩家名','Use <PLAYER_NAME> for the Warframe username')}</p>
 </section>
 <section className="settingGroup"><h2>{L('Warframe.market 消息','Warframe.market messages')}</h2>
  <label className="settingRow settingTemplate"><span>{L('消息模板（支持 Discord 提及）','Message template (accepts Discord pings)')}</span><input type="text" aria-label={L('市场消息模板','Market message template')} placeholder={L('留空停用','Empty to disable')} disabled={disabled} maxLength={1500} value={wfmTemplate??settings.wfmMessageTemplate??''} onChange={e=>setWfmTemplate(e.target.value)} onBlur={()=>{if(wfmTemplate!==null)void update({wfmMessageTemplate:wfmTemplate}).then(saved=>{if(saved)setWfmTemplate(null);});}}/></label><p className="settingsHint">{L('使用 <WFM_MESSAGE> 代表消息内容','Use <WFM_MESSAGE> for the message content')}</p>
 </section>
 <details className="settingsMaintenance"><summary>{L('通知控制','Notification controls')}</summary><section className="settingGroup"><label className="settingRow settingTemplate"><span>{L('通用消息模板','General message template')}</span><textarea disabled={disabled} maxLength={1500} value={template??settings.messageTemplate} onChange={e=>setTemplate(e.target.value)} onBlur={()=>{if(template!==null)void update({messageTemplate:template}).then(saved=>{if(saved)setTemplate(null);});}}/><small>{'{title} · {body} · {kind}'}</small></label><div className="settingsActions"><button disabled={disabled||world.testing} onClick={()=>void world.testNotice().catch(e=>setError(String(e)))}>{L('测试通知','Test notification')}</button></div></section></details>
 {error&&<p role="alert">{error}</p>}
 </>;
}

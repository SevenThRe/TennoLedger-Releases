export type WorldEvent={id:string;kind:string;nodeId:string;node:string;planet:string;missionType:string;faction:string;tier?:string|null;steelPath:boolean;voidStorm?:boolean;activation:string;expiry:string;rewards:string[];rating?:string|null;predicted:boolean};
export type Cycle={id:string;name:string;state:string;nextState:string;expiry:string};
export type FissureRule={id:string;type:string;mode:string;location:string;steelPath:string};
export type RewardPreferences={enabled:boolean;catalyst:boolean;reactor:boolean;exilus:boolean;weaponParts:string[]};
export type DeliverySettings={windowsEnabled:boolean;soundEnabled:boolean;onlyBackgroundGame:boolean;webhookEnabled:boolean;webhookConfigured:boolean;messageTemplate:string;conversationEnabled?:boolean;conversationTemplate?:string;wfmMessageTemplate?:string;webhookUrl?:string;clearWebhook?:boolean};
export type WorldReward={id:string;name:string;quantity:number;category:'catalyst'|'reactor'|'exilus'|'weapon'|'other'};
export type RewardMission={id:string;kind:'invasion'|'alert'|'event';nodeId:string;node:string;planet:string;missionType:string;activation:string;expiry:string|null;side:'attacker'|'defender'|null;faction:string;progressPercent:number|null;requiredCompletions:number|null;eventTarget:number|null;rewards:WorldReward[]};
export const defaultRewardPreferences=():RewardPreferences=>({enabled:false,catalyst:true,reactor:true,exilus:true,weaponParts:[]});
export const defaultDelivery=():DeliverySettings=>({windowsEnabled:true,soundEnabled:true,onlyBackgroundGame:true,webhookEnabled:false,webhookConfigured:false,messageTemplate:'{body}',conversationEnabled:true,conversationTemplate:'收到来自 <PLAYER_NAME> 的新游戏会话',wfmMessageTemplate:'新 Warframe.market 消息：<WFM_MESSAGE>'});
export const activeReward=(row:RewardMission,now=Date.now())=>Date.parse(row.activation)<=now&&(!row.expiry||Date.parse(row.expiry)>now);
export function matchesReward(reward:WorldReward,p:RewardPreferences){return reward.category==='weapon'?p.weaponParts.includes(reward.id):reward.category==='catalyst'?p.catalyst:reward.category==='reactor'?p.reactor:reward.category==='exilus'?p.exilus:false;}
export function rewardOwned(counts:Record<string,number>|undefined,complete:boolean|undefined,id:string):number|null{return counts&&Object.hasOwn(counts,id)?counts[id]:complete?0:null;}
export function rewardDisplayName(reward:Pick<WorldReward,'id'|'name'|'category'>,item:{name:string;zh?:string;category?:string}|undefined,parents:readonly {name:string;zh?:string}[],en=false){
 if(reward.id==='@credits')return en?'Credits':'现金';
 const leaf=reward.id.split('/').at(-1)??'',special:Record<string,[string,string]>={OrokinCatalyst:['奥罗金催化剂','Orokin Catalyst'],OrokinReactor:['奥罗金反应堆','Orokin Reactor'],UtilityUnlocker:['特殊功能槽连接器','Exilus Adapter'],WeaponUtilityUnlocker:['武器特殊功能槽连接器','Exilus Weapon Adapter']};
 const base=leaf.replace(/Blueprint$/,'');if(['catalyst','reactor','exilus'].includes(reward.category)&&special[base])return special[base][en?1:0]+(leaf.endsWith('Blueprint')?(en?' Blueprint':'蓝图'):'');
 const name=item?(en?item.name:item.zh||item.name):reward.name;
 if(parents.length&&(reward.category==='weapon'||item?.category==='component')){const parent=[...new Set(parents.map(p=>en?p.name:p.zh||p.name))].slice(0,3).filter(p=>!name.toLowerCase().includes(p.toLowerCase()));if(parent.length)return parent.join(' / ')+' '+name;}
 return name;
}
export type Subscriptions={fissureEnabled:boolean;fissureAll?:boolean;fissureRules:FissureRule[];alertEnabled:boolean;alertRewards:string[];arbitrationEnabled:boolean;arbitrationTiers:string[];arbitrationNodes:string[];arbitrationPreferences?:import('./arbitrationModel').ArbitrationPreferences|null;cycleStates:string[];timerLeadMinutes?:number;rewardPreferences?:RewardPreferences;delivery?:DeliverySettings};
export type WorldNotice={id:string;title:string;body:string;createdAt:string;kind:string;deliveryError?:string|null;systemState?:string|null};
export function noticeForScope(notice:WorldNotice,scope:string){for(const prefix of ['riven-monitor:','conversation:'])if(notice.id.startsWith(prefix))return notice.id.slice(prefix.length).split(':')[0]===scope;return true;}
export type CircuitSchedule={Activation:{$date:{$numberLong:string}};Expiry:{$date:{$numberLong:string}};CategoryChoices:{Category:string;Choices:string[]}[]};
export type VoidTrader={Activation:{$date:{$numberLong:string}};Expiry:{$date:{$numberLong:string}};Node:string;Manifest?:{ItemType:string;PrimePrice:number;RegularPrice:number}[]};
export type WorldStatus={rewardMissions?:RewardMission[];primeVaultTraders?:import("./resurgenceModel").ResurgenceTrader[];voidTraders?:VoidTrader[];circuit?:CircuitSchedule[];updatedAt:string|null;error:string|null;stale:boolean;fissures:WorldEvent[];alerts:WorldEvent[];arbitrations:WorldEvent[];cycles:Cycle[];subscriptions:Subscriptions;notifications:WorldNotice[];sources:{id:string;url:string;fetchedAt:string|null;error:string|null}[]};
export const defaultSubscriptions=():Subscriptions=>({fissureEnabled:false,fissureRules:[],alertEnabled:false,alertRewards:[],arbitrationEnabled:false,arbitrationTiers:['S','A'],arbitrationNodes:[],cycleStates:[],timerLeadMinutes:3,rewardPreferences:defaultRewardPreferences(),delivery:defaultDelivery()});
export const emptyWorld=():WorldStatus=>({updatedAt:null,error:null,stale:true,fissures:[],alerts:[],arbitrations:[],cycles:[],subscriptions:defaultSubscriptions(),notifications:[],sources:[]});
/** Explicit development fixtures work on any page; production can never enable them. */
export function worldPreviewEnabled(dev:boolean,search:string){const params=new URLSearchParams(search);return dev&&(params.get('worldFixture')==='1'||['world','modules','arbitrations','stats'].includes(params.get('qa')??''));}
export function previewWorldStatus(source:WorldStatus,now=Date.now()):WorldStatus{
 const result=structuredClone(source),at=Date.parse(source.updatedAt??'');if(!Number.isFinite(at)||!Number.isFinite(now))return result;const delta=now-at;
 const shift=(value:string)=>{const time=Date.parse(value);return Number.isFinite(time)?new Date(time+delta).toISOString():value;};
 for(const list of [result.fissures,result.alerts,result.arbitrations])for(const row of list){row.activation=shift(row.activation);row.expiry=shift(row.expiry);}
 for(const row of result.cycles)row.expiry=shift(row.expiry);
 for(const row of result.rewardMissions??[]){row.activation=shift(row.activation);if(row.expiry)row.expiry=shift(row.expiry);}
 for(const list of [result.voidTraders??[],result.primeVaultTraders??[],result.circuit??[]])for(const row of list)for(const field of ['Activation','Expiry'] as const){const value=row[field]?.$date;if(value){const old=Number(value.$numberLong);if(Number.isFinite(old))value.$numberLong=String(old+delta);}}
 result.updatedAt=new Date(now).toISOString();return result;
}
export const remaining=(expiry:string,now=Date.now())=>Math.max(0,Math.ceil((Date.parse(expiry)-now)/1000));
export function countdown(expiry:string,now=Date.now(),en=true){const seconds=Math.max(0,Math.floor((Date.parse(expiry)-now)/1000));if(!Number.isFinite(seconds))return '—';const h=Math.floor(seconds/3600),m=Math.floor(seconds%3600/60),s=seconds%60;if(h>=24)return en?`${Math.floor(h/24)}d ${h%24}h`:`${Math.floor(h/24)}天 ${h%24}小时`;return h?`${h}h ${m.toString().padStart(2,'0')}m`:`${m}m ${s.toString().padStart(2,'0')}s`;}
export const active=(event:WorldEvent,now=Date.now())=>Date.parse(event.activation)<=now&&Date.parse(event.expiry)>now;
export const upcoming=(event:WorldEvent,now=Date.now())=>Date.parse(event.expiry)>now;
export function matchesFissure(event:WorldEvent,rule:FissureRule){return (rule.type==='all'||rule.type.toLowerCase()===event.tier?.toLowerCase())&&(rule.mode==='all'||rule.mode===event.missionType)&&(rule.location==='all'||rule.location===event.planet)&&(rule.steelPath==='all'||event.steelPath===(rule.steelPath==='steelPath'));}
export const highValue=(event:WorldEvent)=>event.rating==='S'||event.rating==='A';
export const toggleValue=(values:string[],value:string)=>values.includes(value)?values.filter(x=>x!==value):[...values,value];
export const missionZh:Record<string,string>={Extermination:'歼灭',Capture:'捕获',Defense:'防御','Mirror Defense':'镜像防御','Mobile Defense':'移动防御',Survival:'生存',Excavation:'挖掘',Interception:'拦截',Spy:'间谍',Rescue:'救援',Sabotage:'破坏',Assassination:'刺杀',Disruption:'中断',Alchemy:'炼金',Skirmish:'前哨战',Volatile:'易变',Orphix:'奥影',Assault:'强袭',Hijack:'劫持',Hive:'清巢','Infested Salvage':'清巢回收',Defection:'叛逃','Void Flood':'虚空洪流','Void Cascade':'虚空覆涌','Void Armageddon':'虚空大决战',Unknown:'未知任务'};
export const stateZh:Record<string,string>={day:'昼',night:'夜',warm:'暖',cold:'冷',fass:'Fass',vome:'Vome',fear:'恐惧',joy:'喜悦',anger:'愤怒',envy:'嫉妒',sorrow:'悲伤'};

export function enqueueNotice(queue:WorldNotice[],notice:WorldNotice):WorldNotice[]{return queue.some(n=>n.id===notice.id)?queue:[...queue,notice];}

export const canAutoDismissNotice=(notice:WorldNotice,_visible:boolean,_focused:boolean)=>notice.kind!=='test';

export function notificationStateHint(state?:string|null,en=false){
 if(state==='foreground-suppressed')return en?'Paused by preference while Warframe is in the foreground.':'游戏在前台，已按偏好暂停提醒。';
 if(state==='game-unavailable-suppressed')return en?'Waiting for Warframe to run in the background.':'等待游戏在后台运行，当前不发送提醒。';
 if(state==='in-app-only')return en?'In-app notification only; external channels are off.':'仅应用内提醒，外部渠道已关闭。';
 const suppressed=['busy','d3d-fullscreen','presentation','quiet-time','not-present','windows-store-app'].includes(state??'');
 return suppressed?(en?'Windows is busy or suppressing banners; the message remains in MyFrame.':'Windows 正忙或正在限制横幅，消息已保留在 MyFrame。'):'';
}

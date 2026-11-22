export type WorkArea={x:number;y:number;width:number;height:number;scale:number};
export type MiniStatusTone='live'|'warn'|'ended'|'watching'|'muted';
export type MiniStatusBadge={tone:MiniStatusTone;label:string;title:string};
export const MINI_WIDTH=380;
export const MINI_HEIGHT_COLLAPSED=46;
export const MINI_HEIGHT_NORMAL=276;

export function miniWindowHeight(collapsed:boolean,details:boolean,intervalCount=0){
 if(collapsed)return MINI_HEIGHT_COLLAPSED;
 if(!details)return MINI_HEIGHT_NORMAL;
 const rows=Math.min(6,Math.max(1,intervalCount));
 return Math.min(440,MINI_HEIGHT_NORMAL+12+rows*31);
}

export function miniPhaseLabel(phase:{phase:string;index:number|null}|null,kind:string|undefined,en:boolean){
 if(phase?.phase==='preparing')return en?'Preparing':'准备中';
 if(phase?.index!=null){
  if(kind==='wave')return en?`Wave ${phase.index}`:`波次 ${phase.index}`;
  if(kind==='rotation')return en?`Rotation ${phase.index}`:`轮次 ${phase.index}`;
  return en?`Interval ${phase.index}`:`阶段 ${phase.index}`;
 }
 return en?'Current interval':'当前区间';
}

export function miniStatusBadge(run:{status:string;hasGap:boolean;lastLogSeconds:number}|null,clock:number,captureCode:string|undefined,en:boolean):MiniStatusBadge{
 if(run){
  if(run.hasGap)return {tone:'warn',label:en?'Partial':'残缺记录',title:en?'Partial capture due to a log gap':'日志存在断点，当前为不完整采集'};
  if(run.status!=='recording')return {tone:'ended',label:en?'Ended':'已结束',title:en?'Arbitration run ended':'本局仲裁记录已结束'};
  if(clock-run.lastLogSeconds>10)return {tone:'warn',label:en?'Estimated':'计时推算',title:en?'Waiting for new logs; clock is estimated':'等待新日志 · 计时推算中'};
  return {tone:'live',label:en?'Live':'实时',title:en?'Receiving live Arbitration logs':'正在实时接收仲裁日志'};
 }
 if(captureCode==='waiting-account')return {tone:'muted',label:en?'Waiting sync':'未同步',title:en?'Enable auto-sync and log in to begin recording':'开启自动同步并登录游戏后开始采集'};
 if(captureCode==='log-unavailable')return {tone:'warn',label:en?'No EE.log':'无日志',title:en?'Warframe EE.log not found; start the game':'未找到 Warframe EE.log，请确认游戏已启动'};
 return {tone:'watching',label:en?'Watching':'监听中',title:en?'Ready; recording starts upon entering an Arbitration':'已就绪，进入仲裁任务后自动开始记录'};
}

export function restoreMiniPosition(saved:{x:number;y:number},areas:WorkArea[],height=320){
 if(!Number.isFinite(saved.x)||!Number.isFinite(saved.y)||!areas.length)return null;
 const area=areas.find(a=>saved.x>=a.x&&saved.x<a.x+a.width&&saved.y>=a.y&&saved.y<a.y+a.height)??areas[0];
 return {x:Math.round(Math.max(area.x,Math.min(saved.x,area.x+Math.max(0,area.width-MINI_WIDTH*area.scale)))),y:Math.round(Math.max(area.y,Math.min(saved.y,area.y+Math.max(0,area.height-height*area.scale))))};
}

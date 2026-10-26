import {durationLabel,runStatus,type ArbitrationRun} from './arbitrationRunModel';
import {captureSeconds,reportIntervals,observationSeries,type ObservationMetric} from './arbitrationRunView';
export type ImageMetric='intervals'|ObservationMetric;
export function reportImage(run:ArbitrationRun,metric:ImageMetric,en:boolean){
 const L=(zh:string,english:string)=>en?english:zh,canvas=document.createElement('canvas');canvas.width=1400;canvas.height=850;
 const c=canvas.getContext('2d');if(!c)throw Error(L('无法创建报告图像','Cannot create report image'));
 c.fillStyle='#111827';c.fillRect(0,0,1400,850);
 const text=(value:string,x:number,y:number,size=20,color='#aeb9cb')=>{c.fillStyle=color;c.font=`${size}px Arial, "Microsoft YaHei", sans-serif`;c.fillText(value,x,y,1280);};
 text(L('仲裁任务报告','ARBITRATION RUN REPORT'),60,60,20,'#78d8cc');
 text([run.node||run.nodeId,run.planet].filter(Boolean).join(', ').slice(0,58),60,122,42,'#f0f4fa');
 text([run.missionType,run.startUtc?new Date(run.startUtc).toLocaleString(en?'en':'zh-CN'):L('时间未知','Time unknown'),run.isHost===null?L('身份未知','Unknown perspective'):run.isHost?L('房主','Host'):L('队员','Client')].join(', '),60,162);
 const intervals=reportIntervals(run),values=[[L('时长','Duration'),durationLabel(captureSeconds(run))],[L('完整区间','Intervals'),String(intervals.length)],[L('敌人生成','Enemy spawns'),run.enemySpawns==null?'—':String(run.enemySpawns)],[L('无人机生成','Drone spawns'),run.droneTelemetry?String(run.droneSpawns):'—']];
 values.forEach(([label,value],i)=>{text(label,60+i*320,233,19);text(value,60+i*320,279,34,'#f0f4fa');});
 const labels:Record<ImageMetric,string>={intervals:L('完整区间时长 · 秒','Completed interval durations · seconds'),enemies:L('敌人生成','Enemy spawns'),drones:L('无人机生成','Drone spawns'),enemyRate:L('敌人生成速率 · 每分钟','Enemy spawns / min'),droneRate:L('无人机生成速率 · 每分钟','Drone spawns / min'),live:L('观测到的单位','Observed agents')};
 text(labels[metric]+' · '+L('完整任务','full run'),60,340,18);
 const points=metric==='intervals'?intervals.map(i=>({x:i.index,y:i.duration})):observationSeries(run,metric),peak=points.reduce((m,p)=>p.y!==null&&Number.isFinite(p.y)?Math.max(m,p.y):m,1),first=points[0]?.x??0,span=Math.max(1,(points.at(-1)?.x??0)-first);
 c.strokeStyle='#334155';c.lineWidth=1;
 for(const fraction of [0,.5,1]){const y=585-fraction*200;c.beginPath();c.moveTo(90,y);c.lineTo(1340,y);c.stroke();text(String(+(peak*fraction).toFixed(1)),35,y+5,16);}
 c.strokeStyle='#dfbc82';c.lineWidth=3;c.beginPath();let connected=false,hasData=false;
 for(const p of points){if(p.y===null||!Number.isFinite(p.y)){connected=false;continue;}const x=90+(p.x-first)*1250/span,y=585-p.y*200/peak;if(connected)c.lineTo(x,y);else c.moveTo(x,y);connected=true;hasData=true;}c.stroke();
 if(!hasData)text(L('此记录没有完整观测数据','No complete observations in this capture'),480,490,18);
 text([runStatus(run.status,en),run.hasGap?L('部分采集','Partial capture'):L('完整采集','Complete capture'),run.source].join(', '),60,660,20,'#f0f4fa');
 text(L('生成事件不等于击杀或掉落。','Observed spawn events, not kills or drops. ')+(run.qualityNotes[0]??'').slice(0,100),60,708,17);
 text(L('不含玩家名称 · TennoLedger','Player names hidden · TennoLedger'),60,753,17);
 return canvas.toDataURL('image/png');
}

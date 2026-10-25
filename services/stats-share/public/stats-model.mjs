export const labels={played:'记录天数',relicOpened:'开启遗物数',trades:'交易总数',plat:'白金',ducats:'杜卡德',endo:'内融核心',credits:'现金',aya:'阿耶精华',vitus:'生息精华'};
export const activity=f=>['played','relicOpened','trades'].includes(f);
export const dayMs=86400000;
export const key=time=>new Date(time).toISOString().slice(0,10);
export function parseDay(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;const n=Date.parse(value+'T00:00:00Z');return Number.isFinite(n)&&key(n)===value?n:null;}
export function rangePreset(rows,days,now=Date.now()){const end=Math.floor(now/dayMs)*dayMs;return {start:days?end-(days-1)*dayMs:rows.length?Date.parse(rows[0].ts.slice(0,10)):end,end};}
export function validateStats(data){
 if(!data||!Array.isArray(data.fields)||!data.fields.length||new Set(data.fields).size!==data.fields.length||data.fields.some(f=>!Object.hasOwn(labels,f))||!Array.isArray(data.generalDataPoints)||data.generalDataPoints.length>100000)throw Error('统计格式无效');
 let previous='';for(const row of data.generalDataPoints){if(!row||typeof row.ts!=='string'||parseDay(row.ts.slice(0,10))===null||!Number.isFinite(Date.parse(row.ts))||row.ts<=previous)throw Error('统计日期无效');previous=row.ts;for(const f of data.fields)if(row[f]!==null&&(!Number.isSafeInteger(row[f])||row[f]<0))throw Error('统计数值无效');}
 return data;
}
export function series(data,field,range,mode='balance'){
 const rows=data.generalDataPoints.filter(row=>activity(field)||row.balanceSample!==false);
 return rows.map((row,i)=>({date:row.ts.slice(0,10),time:parseDay(row.ts.slice(0,10)),value:field==='played'?1:mode==='change'&&!activity(field)?i===0||row[field]===null||rows[i-1][field]===null?null:row[field]-rows[i-1][field]:row[field],partial:row[field+'Partial']===true})).filter(row=>row.time>=range.start&&row.time<=range.end);
}
export function summarize(rows,field,mode='balance'){
 const known=rows.filter(r=>r.value!==null),sum=known.reduce((a,b)=>a+b.value,0);
 // An unknown last balance must remain unknown, even when an earlier one exists.
 return {value:activity(field)||mode==='change'?(known.length?sum:null):rows.at(-1)?.value??null,partial:rows.some(r=>r.partial||r.value===null),count:rows.length};
}
export function grouped(rows,group='daily',balance=false){
 if(group==='daily')return rows;
 const groups=new Map();for(const row of rows){const date=new Date(row.time);const time=group==='weekly'?row.time-(date.getUTCDay()+6)%7*dayMs:group==='monthly'?Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),1):Date.UTC(date.getUTCFullYear(),0,1);const bucket=groups.get(time)??[];bucket.push(row);groups.set(time,bucket);}
 return [...groups].map(([time,bucket])=>{const known=bucket.filter(r=>r.value!==null);return {date:key(time),time,value:balance?bucket.at(-1).value:known.length?known.reduce((a,b)=>a+b.value,0):null,partial:bucket.some(r=>r.partial||r.value===null)};});
}
export function calendar(year,range,rows){const recorded=new Set(rows.map(r=>r.ts.slice(0,10)));return Array.from({length:12},(_,month)=>{const start=Date.UTC(year,month,1),last=Date.UTC(year,month+1,0);return {month,start,offset:(new Date(start).getUTCDay()+6)%7,count:0,days:Array.from({length:new Date(last).getUTCDate()},(_,i)=>{const time=start+i*dayMs;return {date:key(time),day:i+1,inRange:time>=range.start&&time<=range.end,recorded:recorded.has(key(time))};})};}).map(m=>({...m,count:m.days.filter(d=>d.inRange&&d.recorded).length}));}

export const manualUpdateUrl='https://github.com/SevenThRe/TennoLedger-Releases/releases/latest';
const stages=['check','download','install','prepare','client','manifest','signature','archive'] as const;
const kinds=['timeout','connect','tls','redirect','body','transport_unknown','http','parse','signature','validation','range','size','hash','unknown'] as const;
const causes=['tls','timeout','connection_refused','connection_reset','io','unknown'] as const;
export type UpdateDiagnostic={type:'update-diagnostic';schema:1;stage:typeof stages[number];kind:typeof kinds[number];elapsedMs:number|null;status:number|null;causes:string[];recoveryFailed?:boolean};
export function updateDiagnostic(error:unknown,stage:string='check'):UpdateDiagnostic{
 let value:any;try{value=JSON.parse(error instanceof Error?error.message:typeof error==='string'?error:'');}catch{}
 const valid=value?.type==='update-diagnostic'&&value?.schema===1;
 return {type:'update-diagnostic',schema:1,stage:valid&&stages.includes(value.stage)?value.stage:stages.includes(stage as any)?stage as UpdateDiagnostic['stage']:'check',kind:valid&&kinds.includes(value.kind)?value.kind:'unknown',elapsedMs:valid&&Number.isSafeInteger(value.elapsedMs)&&value.elapsedMs>=0?value.elapsedMs:null,status:valid&&Number.isInteger(value.status)&&value.status>=100&&value.status<=599?value.status:null,causes:valid&&Array.isArray(value.causes)?value.causes.slice(0,8).map((v:unknown)=>causes.includes(v as any)?v:'unknown'):[],...(valid&&value.recoveryFailed===true?{recoveryFailed:true}:{})};
}
export function safeUpdateError(error:unknown,stage='check',recoveryFailed=false):string{return JSON.stringify({...updateDiagnostic(error,stage),...(recoveryFailed?{recoveryFailed:true}:{})});}
export function updateErrorSummary(error:unknown,en=false):string{
 const d=updateDiagnostic(error),stage={check:['检查更新','Checking updates'],download:['下载更新','Downloading update'],install:['安装更新','Installing update'],prepare:['准备安装','Preparing installation'],client:['创建连接','Creating connection'],manifest:['获取清单','Fetching manifest'],signature:['获取或校验签名','Fetching or verifying signature'],archive:['下载或校验文件','Downloading or verifying files']}[d.stage][en?1:0];
 const kind={timeout:['请求超时','Request timed out'],connect:['连接失败','Connection failed'],tls:['TLS 握手或证书校验失败','TLS handshake or certificate validation failed'],redirect:['重定向失败','Redirect failed'],body:['响应读取失败','Response read failed'],transport_unknown:['传输失败，具体原因未知','Transport failed; cause unknown'],http:['服务器返回 HTTP '+d.status,'Server returned HTTP '+d.status],parse:['更新数据格式无效','Invalid update data'],signature:['签名校验失败，更新已停止','Signature verification failed; update stopped'],validation:['更新清单校验失败','Manifest validation failed'],range:['文件范围响应无效','Invalid file range response'],size:['更新响应大小无效','Invalid update response size'],hash:['文件哈希校验失败','File hash verification failed'],unknown:['更新失败，具体原因未知','Update failed; cause unknown']}[d.kind][en?1:0];
 return `${stage}：${kind}${d.elapsedMs===null?'':` (${d.elapsedMs} ms)`}${d.recoveryFailed?(en?' · Collector resume failed':' · 恢复采集失败'):''}`;
}

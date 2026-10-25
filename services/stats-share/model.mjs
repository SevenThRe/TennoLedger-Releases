import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
export const fields=['played','relicOpened','trades','plat','ducats','endo','credits','aya','vitus'];
export const digest=value=>createHash('sha256').update(value).digest('hex');
export const newToken=()=>randomBytes(32).toString('base64url');
export function authorized(header,token){if(typeof header!=='string'||!header.startsWith('Bearer '))return false;const a=Buffer.from(header.slice(7)),b=Buffer.from(token);return a.length===b.length&&timingSafeEqual(a,b);}
export function selectFields(value){if(!Array.isArray(value)||!value.length||value.length>fields.length||new Set(value).size!==value.length||value.some(f=>!fields.includes(f)))throw Error('Invalid fields');return value;}
export function filterSnapshot(value,selected){
 selectFields(selected);if(!value||typeof value!=='object'||!Array.isArray(value.generalDataPoints)||value.generalDataPoints.length>100000)throw Error('Invalid snapshot');
 const rows=value.generalDataPoints.map(row=>{
  if(!row||typeof row!=='object'||typeof row.ts!=='string'||!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(row.ts)||!Number.isFinite(Date.parse(row.ts))||new Date(row.ts.slice(0,10)+'T00:00:00Z').toISOString().slice(0,10)!==row.ts.slice(0,10))throw Error('Invalid timestamp');
  const clean={ts:new Date(row.ts).toISOString()};if(selected.some(f=>!['played','trades','relicOpened'].includes(f))){if(row.balanceSample!==undefined&&typeof row.balanceSample!=='boolean')throw Error('Invalid snapshot');clean.balanceSample=row.balanceSample!==false;}
  for(const f of selected){const n=row[f];if(n!==undefined&&n!==null&&(!Number.isSafeInteger(n)||n<0))throw Error('Invalid amount');if(Object.hasOwn(row,f))clean[f]=n??null;if(['relicOpened','trades'].includes(f)){if(row[f+'Partial']!==undefined&&typeof row[f+'Partial']!=='boolean')throw Error('Invalid amount');clean[f+'Partial']=row[f+'Partial']===true;}}
  return clean;
 }).sort((a,b)=>a.ts.localeCompare(b.ts));
 // Canonical UTC day rows match the desktop model; never overwrite an earlier
 // observed balance merely because a later point omits that field.
 const daily=new Map();for(const row of rows){const key=row.ts.slice(0,10),bucket=daily.get(key)??[];bucket.push(row);daily.set(key,bucket);}
 const generalDataPoints=[...daily].map(([day,bucket])=>{const row={ts:day+'T23:59:59.000Z'};if(selected.some(f=>!['played','trades','relicOpened'].includes(f)))row.balanceSample=bucket.some(p=>p.balanceSample);for(const f of selected){if(f==='played'){row[f]=1;continue;}if(['trades','relicOpened'].includes(f)){const known=bucket.map(p=>p[f]).filter(n=>typeof n==='number');const total=known.reduce((a,b)=>a+b,0);if(!Number.isSafeInteger(total))throw Error('Invalid amount');row[f]=known.length?total:null;row[f+'Partial']=known.length<bucket.length||bucket.some(p=>p[f+'Partial']);}else{const observations=bucket.filter(p=>Object.hasOwn(p,f));row[f]=observations.at(-1)?.[f]??null;}}return row;});
 const result={schemaVersion:1,fields:[...selected],generalDataPoints};if(Buffer.byteLength(JSON.stringify(result))>1800*1024)throw Error('Snapshot too large');return result;
}
export function validateCreation(body,now=Date.now()){if(typeof body?.clientTag!=='string'||!/^[-a-zA-Z0-9]{16,100}$/.test(body.clientTag))throw Error('Invalid client');const selected=selectFields(body.fields),expires=Date.parse(body.expiresAt);if(!Number.isFinite(expires)||expires<=now||expires>now+366*86400000)throw Error('Invalid expiry');const title=typeof body.title==='string'?body.title.trim():'TennoLedger';if(title.length>64||/[\x00-\x1f]/.test(title))throw Error('Invalid title');return {clientTag:body.clientTag,fields:selected,expiresAt:new Date(expires).toISOString(),title,snapshot:filterSnapshot(body.snapshot,selected)};}

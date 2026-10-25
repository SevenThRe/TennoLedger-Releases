export const zoomKey='myframe.uiZoom';
export const appearanceKey='myframe.appearance';
export const languageKey='myframe.language';
export const packsKey='myframe.languagePacks';
export const builtinLanguages=[{id:'zh-CN',name:'简体中文'},{id:'en',name:'English'}];
export type LanguagePack={schemaVersion:1;id:string;name:string;messages:Record<string,string>};
export function normalizeZoom(value:unknown){const n=Number(value);return Number.isFinite(n)&&n>=70&&n<=150?Math.round(n/10)*10:100;}
export function parseLanguagePack(value:unknown):LanguagePack{
 const p=value as Partial<LanguagePack>|null;
 if(!p||p.schemaVersion!==1||typeof p.id!=='string'||!/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(p.id)||builtinLanguages.some(l=>l.id.toLowerCase()===p.id!.toLowerCase())||typeof p.name!=='string'||!p.name.trim()||p.name.length>64||!p.messages||typeof p.messages!=='object'||Array.isArray(p.messages))throw Error('Invalid language pack');
 const entries=Object.entries(p.messages);
 if(!entries.length||entries.length>2000||entries.some(([k,v])=>!k||k.length>200||['__proto__','constructor','prototype'].includes(k)||typeof v!=='string'||v.length>16000))throw Error('Invalid language pack messages');
 return {schemaVersion:1,id:p.id,name:p.name.trim(),messages:Object.fromEntries(entries)};
}
export function readLanguagePacks(raw:string|null):LanguagePack[]{
 try{const list:unknown=JSON.parse(raw??'[]');if(!Array.isArray(list))return [];const result:LanguagePack[]=[];for(const v of list){try{const p=parseLanguagePack(v);if(!result.some(x=>x.id.toLowerCase()===p.id.toLowerCase()))result.push(p);}catch{}}return result;}catch{return [];}
}
export type Appearance={accent:'violet'|'mint'|'blue';reducedMotion:boolean};
export function readAppearance(raw:string|null):Appearance{try{const v=JSON.parse(raw??'{}');return {accent:['violet','mint','blue'].includes(v?.accent)?v.accent:'violet',reducedMotion:v?.reducedMotion===true};}catch{return {accent:'violet',reducedMotion:false};}}

export function parseTimerLeadMinutes(value:unknown):number{
 if(value===undefined)return 3;
 if(typeof value!=='number'||!Number.isInteger(value)||value<0||value>60)throw Error('World cycle reminder must be an integer from 0 to 60 minutes');
 return value;
}

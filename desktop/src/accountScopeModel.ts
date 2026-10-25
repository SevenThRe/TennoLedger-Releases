export const legacyScope='legacy-unassigned';
export type AccountProfile={accountScope:string;name:string|null;capturedAt:string|null;active:boolean;unassigned:boolean};
export function validAccountScope(value:unknown):value is string{return typeof value==='string'&&(value===legacyScope||/^(acct|name)-v1-[a-f0-9]{64}$/.test(value));}
export function parseAccountProfiles(value:unknown):AccountProfile[]{
 if(!Array.isArray(value)||value.length>1000)throw Error('账号资料响应无效');
 const seen=new Set<string>();
 const profiles=value.map((row:unknown)=>{
  if(!row||typeof row!=='object')throw Error('账号资料响应无效');const p=row as AccountProfile;
  if(!validAccountScope(p.accountScope)||seen.has(p.accountScope)||typeof p.active!=='boolean'||typeof p.unassigned!=='boolean'||(p.name!==null&&typeof p.name!=='string')||(p.capturedAt!==null&&(typeof p.capturedAt!=='string'||!Number.isFinite(Date.parse(p.capturedAt)))))throw Error('账号资料响应无效');
  seen.add(p.accountScope);return p;
 });
 if(profiles.filter(p=>p.active).length!==1)throw Error('当前账号资料不明确');
 return profiles;
}
export function accountStorageKey(base:string,scope:string){if(!validAccountScope(scope))throw Error('账号资料无效');return scope===legacyScope?base:base+'.account.'+scope;}
export function snapshotScope(snapshot:unknown):string{const scope=snapshot&&typeof snapshot==='object'?(snapshot as {accountScope?:unknown}).accountScope:undefined;return validAccountScope(scope)?scope:legacyScope;}

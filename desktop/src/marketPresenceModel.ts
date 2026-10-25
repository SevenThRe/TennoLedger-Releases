export type MarketPresenceStatus='online'|'ingame'|'invisible';
export type MarketPresenceView={accountId:string;platform:string;connected:boolean;authenticated:boolean;ready:boolean;status:MarketPresenceStatus|'offline'|null;pending:boolean;error:string|null;revision:number|null;autoMode?:boolean};
export const validPresenceStatus=(status:unknown):status is MarketPresenceStatus=>status==='online'||status==='ingame'||status==='invisible';
export const presenceStorageKey=(accountId:string,platform:string)=>'myframe.marketPresence.v1:'+JSON.stringify([accountId,platform]);
export function readRememberedPresence(raw:string|null):MarketPresenceStatus|null{try{const v=JSON.parse(raw??'null');return v?.version===1&&validPresenceStatus(v.status)?v.status:null;}catch{return null;}}
export function parseMarketPresence(value:unknown,accountId:string,platform:string):MarketPresenceView{
 if(!value||typeof value!=='object')throw Error('状态响应无效');const v=value as MarketPresenceView;
 if(v.accountId&&v.accountId!==accountId||v.platform&&v.platform!==platform)throw Error('状态账号或平台已变化');
 if(v.autoMode!==undefined&&typeof v.autoMode!=='boolean')throw Error('Auto 状态格式变化');
 if(!['connected','authenticated','ready','pending'].every(k=>typeof (v as any)[k]==='boolean')||!(v.status===null||v.status==='offline'||validPresenceStatus(v.status)))throw Error('状态响应格式变化');
 return v;
}

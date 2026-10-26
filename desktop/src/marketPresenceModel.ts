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

export function presenceErrorText(error:string,en:boolean){
 if(!en)return error;
 if(error.includes('Cloudflare'))return 'Market status service requires Cloudflare verification (HTTP 403). Check the system proxy and reconnect later.';
 const http=error.match(/HTTP (\d{3})/);
 if(http)return error.includes('代理')?`System proxy refused the status tunnel (HTTP ${http[1]}).`:`Market status handshake rejected (HTTP ${http[1]}).`;
 if(error.includes('证书'))return 'Market status TLS certificate verification or encryption negotiation failed.';
 if(error.includes('代理要求认证'))return 'The system proxy requires authentication. Check its credentials.';
 if(error.includes('不支持此代理协议'))return 'This proxy protocol is not supported for status connections. Use an HTTP system proxy.';
 if(error.includes('超时'))return 'Market status connection timed out. Check the network or system proxy and reconnect.';
 if(error.includes('域名解析'))return 'Could not resolve the market status server or proxy.';
 if(error.includes('认证失败'))return 'Market status authentication failed. Sign in again.';
 if(error.includes('连接已断开'))return 'Market status connection closed; waiting to reconnect.';
 if(error.includes('WebSocket'))return 'Market status WebSocket protocol handshake failed.';
 return error;
}

export const marketLoginEvent='tennoledger-open-wm-login';
export function openMarketLogin(){window.dispatchEvent(new Event(marketLoginEvent));}
export function marketReadFailure(error:string,en:boolean){
 if(/HTTP\s*429|限流|请求过于频繁/.test(error))return en?'WM is rate limiting requests. Wait before refreshing.':'WM 请求受限，请稍后刷新';
 if(/HTTP\s*401|登录已过期/.test(error))return en?'WM authentication failed. Check your account in Warframe Market.':'WM 身份验证失败，请前往 Warframe Market 检查登录';
 if(/HTTP\s*403|Cloudflare|网页访问检查/.test(error))return en?'WM refused this request. Check network access in Warframe Market.':'WM 拒绝了请求，请检查网络或官网访问状态';
 if(/连接|超时|network|timeout|TLS|证书/i.test(error))return en?'Cannot reach WM. Check your network or proxy.':'无法连接 WM，请检查网络或代理';
 return error;
}

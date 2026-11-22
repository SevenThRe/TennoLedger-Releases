export type CollectorScanDiagnostic={
 code:string;
 status:string;
 hint:string;
};

type LocalizedPair=[string,string];

const SCAN_CODE_TABLE:Record<string,{status:LocalizedPair;hint:LocalizedPair}>={
 'helper-fetching':{
  status:['正在读取游戏数据…','Loading game data…'],
  hint:['正在从运行中的 Warframe 同步最新库存，当前保留上次确认的数据。','Syncing latest inventory from running Warframe; last confirmed data remains visible.'],
 },
 'game-not-running':{
  status:['等待启动 Warframe','Waiting for Warframe'],
  hint:['请启动 Warframe 并登录账号，应用会自动检测并同步。','Start Warframe and sign in; the app will detect and sync automatically.'],
 },
 'helper-session-unavailable':{
  status:['等待游戏登录','Waiting for game login'],
  hint:['请确认已在游戏内完成登录并进入飞船，随后可点击立即同步。','Sign in to Warframe and enter your Orbiter, then click Sync now.'],
 },
 'helper-network-failed':{
  status:['连接失败，保留上次数据','Connection failed; last data retained'],
  hint:['无法连接 Warframe 数据接口，请检查网络或系统代理设置后重试。','Could not reach Warframe data endpoint; check network or system proxy and retry.'],
 },
 'helper-auth-failed':{
  status:['游戏会话已失效，请重新登录','Game session expired; sign in again'],
  hint:['当前游戏登录凭证已过期或失效，请在游戏内重新打开仓库或重新登录。','In-game session expired; open your inventory in Warframe or sign in again.'],
 },
 'helper-missing':{
  status:['采集组件缺失','Collector component missing'],
  hint:['未找到内置采集辅助组件，将尝试兼容模式读取或检查安装包完整性。','Bundled helper executable is missing; using compatibility mode or check installation integrity.'],
 },
 'helper-invalid-inventory':{
  status:['数据校验失败','Data validation failed'],
  hint:['返回的游戏库存结构未通过校验，当前保留上次确认数据，可重试同步。','Returned inventory data failed validation; last confirmed data is retained, retry sync.'],
 },
 'helper-current':{
  status:['游戏数据已同步','Game data synced'],
  hint:['最近一次游戏数据读取成功。','The latest game data was read successfully.'],
 },
 'access-denied':{
  status:['权限不足，无法读取游戏进程','Access denied reading game process'],
  hint:['系统拒绝访问 Warframe 进程，请确认游戏与本应用运行在同一用户权限下。','OS denied access to the Warframe process; ensure the game and app run under the same user privilege.'],
 },
 'helper-timeout':{
  status:['读取游戏数据超时','Game data read timed out'],
  hint:['采集等待超时，保留上次数据；请确认游戏响应正常并点击立即同步重试。','Data collection timed out; last data retained. Ensure the game is responsive and click Sync now.'],
 },
 'helper-start-failed':{
  status:['采集组件启动失败','Collector component failed to start'],
  hint:['无法启动本地采集辅助进程，请检查安全软件拦截或点击立即同步重试。','Could not start the local collector helper; check security software or click Sync now to retry.'],
 },
 'helper-integrity-error':{
  status:['采集组件完整性校验未通过','Collector component integrity check failed'],
  hint:['采集辅助文件损坏或哈希不匹配，请重新安装或更新应用，或点击立即同步尝试兼容读取。','Collector helper failed SHA-256 verification; reinstall or update the app, or click Sync now.'],
 },
 'helper-account-mismatch':{
  status:['游戏账号身份不匹配','Game account identity mismatch'],
  hint:['返回的库存账号与当前会话不一致，已拦截跨账号写入；请确认游戏登录状态后重试。','Returned inventory account did not match the active session; verify in-game login and retry.'],
 },
 'helper-failed':{
  status:['游戏数据采集异常退出','Game data collection failed'],
  hint:['采集进程返回未预期错误，当前保留上次数据，可点击立即同步重试。','Collector helper exited unexpectedly; last data retained, click Sync now to retry.'],
 },
 'helper-cancelled':{
  status:['同步已取消','Sync cancelled'],
  hint:['上一轮同步因账号切换或停止采集被中断，可点击立即同步重新读取。','Previous sync was interrupted by account switch or stop; click Sync now to read again.'],
 },
 'history-save-failed':{
  status:['本地库存保存失败','Failed to save inventory locally'],
  hint:['采集成功但写入本地数据库失败，请检查磁盘空间与目录权限后重试。','Data was read but could not be saved to local storage; check disk space and permissions.'],
 },
 'stopped':{
  status:['自动同步已暂停','Automatic sync paused'],
  hint:['自动采集已关闭，可点击立即同步或开启自动同步以更新数据。','Automatic collection is stopped; click Sync now or enable automatic sync.'],
 },
 'waiting-data':{
  status:['等待游戏数据','Waiting for game data'],
  hint:['等待读取 Warframe 账户数据，请启动游戏或点击立即同步。','Waiting to read Warframe account data; start the game or click Sync now.'],
 },
};

const INVALID_INVENTORY_HINTS:Record<string,LocalizedPair>={
 'login-changed-during-read':['采集期间登录信息发生变化，请点击立即同步重新读取。','Login information changed during collection; click Sync now to retry.'],
 'identity-selection-blocked':['采集结果无法确认归属当前账号，请切换到对应账号或登录游戏。','Collected data could not be bound to the selected account; switch account or sign in to Warframe.'],
 'identity-invalid':['采集结果的账号身份校验未通过，请重新登录游戏后重试。','Collected account identity failed validation; sign in to Warframe again and retry.'],
 'acquisition-incomplete':['采集结果缺少必要库存分类，已保留上次完整快照。','Collected inventory is missing required categories; previous complete snapshot was retained.'],
 'acquisition-older':['采集结果早于已保存数据，已保留较新的本地快照。','Collected inventory is older than saved data; newer local snapshot was retained.'],
};

export const KNOWN_SCAN_CODES=Object.freeze(Object.keys(SCAN_CODE_TABLE));

export function collectorScanStatus(scanCode:string,en:boolean,fresh=false):CollectorScanDiagnostic{
 const idx=en?1:0;
 const [prefix,reason]=scanCode.split(':',2);
 if((scanCode==='waiting-data'||!SCAN_CODE_TABLE[prefix])&&fresh){
  const entry=SCAN_CODE_TABLE['helper-current'];
  return {code:scanCode,status:entry.status[idx],hint:entry.hint[idx]};
 }
 const entry=SCAN_CODE_TABLE[scanCode]??SCAN_CODE_TABLE[prefix]??SCAN_CODE_TABLE['waiting-data'];
 const specificHint=prefix==='helper-invalid-inventory'&&reason?INVALID_INVENTORY_HINTS[reason]?.[idx]:undefined;
 return {
  code:scanCode,
  status:entry.status[idx],
  hint:specificHint??entry.hint[idx],
 };
}

export function connectionChecks(scanCode:string,diagnostics:Record<string,unknown>|null){
 const bool=(key:string)=>typeof diagnostics?.[key]==='boolean'?diagnostics[key] as boolean:null;
 return {
  game:scanCode==='game-not-running'?false:bool('gameDetected'),
  inventory:scanCode.startsWith('helper-invalid-inventory:')?false:bool('inventoryAvailable')??bool('inventoryComplete'),
 };
}
export function inventoryFailureText(scanCode:string,en:boolean):string|null{
 const reason=scanCode.replace(/^helper-invalid-inventory:/,'');
 const messages:Record<string,[string,string]>={
  'account-not-accepted':['账号库存未被接收，当前版本未记录具体原因','Account inventory was not accepted; this version did not record the cause'],
  'acquisition-incomplete':['采集结果缺少库存分类，未保存不完整快照','The collected inventory is missing categories; the incomplete snapshot was not saved'],
  'identity-invalid':['采集结果的账号身份校验失败','The collected account identity failed validation'],
  'identity-selection-blocked':['采集结果无法确认归属当前账号','The collected inventory could not be bound to the current account'],
  'login-changed-during-read':['采集期间登录信息发生变化，等待重新采集','Login information changed during collection; waiting for another attempt'],
  'acquisition-older':['采集结果早于已保存数据，保留原快照','The collected inventory is older than the saved snapshot'],
  'acquisition-invalid-time':['采集结果时间异常，未保存','The collected inventory timestamp is invalid'],
  'acquisition-unknown-identity':['采集结果缺少已确认的账号身份','The collected inventory has no confirmed account identity'],
  'history-save-failed':['库存写入失败，未完成同步','Inventory could not be saved; sync did not complete'],
 };
 if(messages[reason])return messages[reason][en?1:0];
 if(reason.startsWith('storage-'))return en?'Local inventory storage failed':'本地库存存储失败';
 if(scanCode.startsWith('helper-invalid-inventory:'))return en?'Inventory validation failed; see the exported diagnostic summary':'库存数据校验失败，请查看导出的诊断摘要';
 return null;
}

type Invoke=<T>(command:string,args?:Record<string,unknown>)=>Promise<T>;
/** Explicit retry also starts a disabled collector. Never ignore its false receipt. */
export async function requestGameSync(invoke:Invoke){
 const status=await invoke<{enabled:boolean;running:boolean}>('collector_status');
 if(!status.enabled||!status.running)await invoke('collector_set_enabled',{enabled:true});
 if(!await invoke<boolean>('collector_request_refresh'))throw Error('无法启动游戏同步 / Game sync could not start');
}

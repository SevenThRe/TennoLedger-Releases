import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {check} from '@tauri-apps/plugin-updater';
import {incrementalPackage,type IncrementalOffer} from './incrementalUpdateModel';
import type {PackageUpdate} from './updateFlow';
/** Invalid signatures fail closed; a missing/current incremental release uses legacy checking. */
export async function checkApplicationUpdate():Promise<PackageUpdate|null>{
 const offer=await invoke<IncrementalOffer|null>('incremental_check');
 if(!offer)return check({timeout:15000});
 return incrementalPackage(offer,command=>invoke(command),receive=>listen<{downloaded:number;total:number}>('incremental-progress',({payload})=>receive(payload.downloaded)));
}

import {safeUpdateError} from './updateDiagnostics.ts';
export type UpdateState = {phase:'checking'|'downloading'|'installing'|'ready'|'error'; version?:string; downloaded?:number; total?:number; error?:string};
type Event = {event:'Started';data:{contentLength?:number}}|{event:'Progress';data:{chunkLength:number}}|{event:'Finished'};
export interface PackageUpdate {
 version:string;
 download:(onEvent:(event:Event)=>void, options:{timeout:number})=>Promise<void>;
 install:()=>Promise<void>;
 close:()=>Promise<void>;
}
export async function runUpdate(deps:{check:()=>Promise<PackageUpdate|null>;prepare:()=>Promise<unknown>;resume:()=>Promise<unknown>}, report:(s:UpdateState)=>void):Promise<void>{
 let update:PackageUpdate|null=null, prepared=false,stage='check';
 try {
  report({phase:'checking'});
  update=await deps.check();
  if(!update){report({phase:'ready'});return;}
  let downloaded=0,total:number|undefined;
  const version=update.version;
  report({phase:'downloading',version,downloaded});
  stage='download';await update.download(e=>{
   if(e.event==='Started')total=e.data.contentLength;
   if(e.event==='Progress')downloaded+=e.data.chunkLength;
   report({phase:'downloading',version,downloaded,total});
  },{timeout:300000});
  report({phase:'installing',version});
  prepared=true;
  stage='prepare';await deps.prepare();
  stage='install';await update.install(); // Windows installer exits and relaunches this application.
 } catch(error){
  let message=safeUpdateError(error,stage);
  if(prepared)try{await deps.resume();}catch{message=safeUpdateError(error,stage,true);}
  report({phase:'error',error:message});
 } finally {if(update)try{await update.close();}catch{/* Process may already be exiting. */}}
}

import type {PackageUpdate} from './updateFlow.ts';
export type IncrementalOffer={version:string;files:number;bytes:number};
export function incrementalPackage(offer:IncrementalOffer,rpc:(command:string)=>Promise<void>,subscribe:(receive:(downloaded:number)=>void)=>Promise<()=>void>):PackageUpdate{
 return {version:offer.version,async download(report){let previous=0;report({event:'Started',data:{contentLength:offer.bytes}});
  const unlisten=await subscribe(downloaded=>{const next=Math.max(previous,Math.min(offer.bytes,downloaded));report({event:'Progress',data:{chunkLength:next-previous}});previous=next;});
  try{await rpc('incremental_download');report({event:'Finished'});}finally{unlisten();}
 },install:()=>rpc('incremental_install'),close:async()=>{}};
}

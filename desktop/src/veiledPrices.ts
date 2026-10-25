import type {Quote} from './quoteCache.ts';
/** One lookup per veiled market item, never one lookup per owned card. */
export async function loadVeiledPrices(slugs:string[],load:(slug:string)=>Promise<Quote>,current:()=>boolean,publish:(slug:string,quote:Quote|null)=>void){
 for(const slug of new Set(slugs)){
  if(!current())return;
  let quote:Quote|null=null;
  try{quote=await load(slug);}catch{}
  if(!current())return;
  publish(slug,quote);
 }
}

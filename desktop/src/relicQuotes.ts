import type {Quote} from './quoteCache';

/** Sequential requests respect the shared market client's rate limit. */
export async function loadRelicQuotes(rewards:ReadonlyArray<{id:string;marketSlug?:string}>,load:(slug:string)=>Promise<Quote>,current:()=>boolean,update?:(prices:Record<string,number|null>,done:number)=>void){
 const prices:Record<string,number|null>={},errors:string[]=[];let stale=false;
 let done=0;
 for(const reward of rewards){
  if(!current())return null;
  prices[reward.id]=null;
  try{if(reward.marketSlug){const quote=await load(reward.marketSlug);prices[reward.id]=quote.price;stale ||= quote.stale;}}
  catch(error){errors.push(String(error));}
  if(!current())return null;
  update?.({...prices},++done);
 }
 return current()?{prices,stale,errors}:null;
}

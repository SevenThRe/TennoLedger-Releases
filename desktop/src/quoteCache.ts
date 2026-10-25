export type Quote={price:number|null;fetchedAt:string;stale:boolean};
type Storage={getItem:(key:string)=>string|null;setItem:(key:string,value:string)=>void};
export function readFreshQuote(storage:Pick<Storage,'getItem'>,slug:string,platform='pc',now=Date.now()):Quote|null{
 try{
  const q=JSON.parse(storage.getItem(`myframe.quote.v2:${platform}:${slug}`)||'null');
  if(!q||typeof q.fetchedAt!=='string'||!(q.price===null||(Number.isFinite(q.price)&&q.price>=0)))return null;
  const age=now-Date.parse(q.fetchedAt);
  return Number.isFinite(age)&&age>=0&&age<900000?{price:q.price,fetchedAt:q.fetchedAt,stale:false}:null;
 }catch{return null;}
}
export function createQuoteCache(load:(slug:string,platform:string)=>Promise<Quote>,storage:Storage,now=Date.now){
 const pending=new Map<string,Promise<Quote>>(),retryAfter=new Map<string,number>();
 return async (slug:string,platform='pc'):Promise<Quote>=>{
  const key=`myframe.quote.v2:${platform}:${slug}`;
  let old:Quote|null=null;
  try{const v=JSON.parse(storage.getItem(key)||'null');if(v&&typeof v.fetchedAt==='string'&&Number.isFinite(Date.parse(v.fetchedAt))&&(v.price===null||(Number.isFinite(v.price)&&v.price>=0)))old=v;}catch{}
  const age=old?now()-Date.parse(old.fetchedAt):Infinity;
  if(old&&age>=0&&age<900000)return {...old,stale:false};
  if((retryAfter.get(key)??0)>now()){if(old)return {...old,stale:true};throw Error('行情稍后重试');}
  const active=pending.get(key);if(active)return active;
  const job=Promise.resolve().then(()=>load(slug,platform)).then(quote=>{
   retryAfter.delete(key);
   try{storage.setItem(key,JSON.stringify(quote));}catch{}
   return quote;
  }).catch(error=>{retryAfter.set(key,now()+60000);if(old)return {...old,stale:true};throw error;}).finally(()=>pending.delete(key));
  pending.set(key,job);return job;
 };
}

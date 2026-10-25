/** Ignore superseded reads while preserving the last successful inventory on failure. */
export function rivenInventoryRefresh<T>(load:()=>Promise<T>,publish:(value:T)=>void,loading:(value:boolean)=>void,failed:(message:string)=>void,timeoutMs=0){
 let generation=0,disposed=false;
 return {
  async refresh(){
   if(disposed)return;
   const current=++generation;
   loading(true);failed('');
   let timer:ReturnType<typeof setTimeout>|undefined;
   try{const request=load();const value=timeoutMs>0?await Promise.race([request,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('Request timed out')),timeoutMs);})]):await request;if(!disposed&&current===generation)publish(value);}
   catch(error){if(!disposed&&current===generation)failed(String(error));}
   finally{if(timer)clearTimeout(timer);if(!disposed&&current===generation)loading(false);}
  },
  dispose(){disposed=true;generation++;},
 };
}

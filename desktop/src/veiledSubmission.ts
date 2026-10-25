export type SubmissionState={pending:boolean;receipt:string;error:string};
const empty:SubmissionState={pending:false,receipt:'',error:''};
/** Kept by the market page so closing/reopening a card cannot lose an in-flight order. */
export class VeiledSubmissions {
 private states=new Map<string,SubmissionState>();
 private listeners=new Set<()=>void>();
 get=(key:string)=>this.states.get(key)??empty;
 subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
 private set(key:string,value:SubmissionState){this.states.set(key,value);this.listeners.forEach(listener=>listener());}
 async submit(key:string,create:()=>Promise<{data:unknown}>){
  const current=this.get(key);
  if(current.pending||current.receipt)return;
  this.set(key,{pending:true,receipt:'',error:''});
  try{
   const response=await create();
   const data=response.data;
   const id=data&&typeof data==='object'&&'id' in data?data.id:undefined;
   if(typeof id!=='string'||!id.trim())throw Error('未收到有效订单 ID，请先到市场我的订单核对，勿重复提交');
   this.set(key,{pending:false,receipt:id,error:''});
  }catch(error){this.set(key,{pending:false,receipt:'',error:String(error)});}
 }
}
export function veiledSubmissionKey(account:string,platform:string,slug:string){return JSON.stringify([account,platform,slug]);}

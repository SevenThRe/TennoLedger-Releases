export const GROUP_ALL_ORDER_ID='__group__:all';
export type OrderQueueContext={accountId:string;platform:string;sessionGeneration:number|null};
export type OrderMutationKind='update'|'update_group'|'close'|'delete'|'fix';
export type OrderMutationBody={platinum?:number;quantity?:number;visible?:boolean};
export type OrderMutationTask={
 id:string;
 orderId:string;
 label:string;
 kind:OrderMutationKind;
 body:OrderMutationBody;
 status:'queued'|'running';
 context:OrderQueueContext;
};
export type OrderQueueFailure={orderId:string;label:string;kind:OrderMutationKind;message:string};
export type OrderQueueState={
 tasks:OrderMutationTask[];
 completed:number;
 failed:OrderQueueFailure[];
 active:boolean;
 queuedCount:number;
 runningTask:OrderMutationTask|null;
};
export type OrderRowBase={id:string;platinum:number;quantity:number;visible?:boolean};
export type ProjectedOrder<T extends OrderRowBase>={
 row:T;
 deleting:boolean;
 pendingCount:number;
 runningKind:OrderMutationKind|null;
 queuedKind:OrderMutationKind|null;
 canUndoQueued:boolean;
};

export function sameOrderQueueContext(a:OrderQueueContext,b:OrderQueueContext):boolean{
 return !!a.accountId&&a.accountId===b.accountId&&a.platform===b.platform&&a.sessionGeneration===b.sessionGeneration;
}

export function isOrderSessionAbortError(error:unknown):boolean{
 const message=error instanceof Error?error.message:String(error??'');
 return /401|请先登录|登录已过期|会话已变化|账号或平台已变化|任务平台与请求平台不匹配|当前登录会话平台不匹配|Market account changed/.test(message);
}

export function projectOrderState<T extends OrderRowBase>(row:T,tasks:readonly OrderMutationTask[]):ProjectedOrder<T>{
 const projected={...row};
 let deleting=false,pendingCount=0,canUndoQueued=false;
 let runningKind:OrderMutationKind|null=null,queuedKind:OrderMutationKind|null=null;
 for(const task of tasks){
  const isGroupAll=task.kind==='update_group'&&task.orderId===GROUP_ALL_ORDER_ID;
  if(task.orderId!==row.id&&!isGroupAll)continue;
  pendingCount++;
  if(task.status==='running')runningKind=task.kind;
  else {
   queuedKind=task.kind;
   if(!isGroupAll)canUndoQueued=true;
  }
  if(task.kind==='update'){
   if(task.body.platinum!==undefined)projected.platinum=task.body.platinum;
   if(task.body.quantity!==undefined)projected.quantity=task.body.quantity;
   if(task.body.visible!==undefined)projected.visible=task.body.visible;
  }else if(isGroupAll){
   if(!deleting&&task.body.visible!==undefined)projected.visible=task.body.visible;
  }else if(task.kind==='close'){
   const next=projected.quantity-(task.body.quantity??1);
   if(next<=0){projected.quantity=0;deleting=true;}
   else projected.quantity=next;
  }else if(task.kind==='delete'){
   deleting=true;
  }else if(task.kind==='fix'){
   if(task.body.quantity===0)deleting=true;
   else if(task.body.quantity!==undefined)projected.quantity=task.body.quantity;
  }
 }
 return {row:projected,deleting,pendingCount,runningKind,queuedKind,canUndoQueued};
}

function validPositiveInt(value:unknown):value is number{
 return typeof value==='number'&&Number.isSafeInteger(value)&&value>0;
}

export function applyConfirmedOrderMutation<T extends OrderRowBase>(
 rows:readonly T[],
 task:OrderMutationTask,
 responseData?:unknown,
):T[]{
 const data=responseData&&typeof responseData==='object'?(responseData as Record<string,unknown>):null;
 if(task.kind==='delete'){
  return rows.filter(row=>row.id!==task.orderId);
 }
 if(task.kind==='fix'){
  if(responseData===null||task.body.quantity===0)return rows.filter(row=>row.id!==task.orderId);
  const nextQty=validPositiveInt(data?.quantity)?data.quantity:task.body.quantity;
  if(!validPositiveInt(nextQty))return [...rows];
  return rows.map(row=>row.id===task.orderId?{...row,quantity:nextQty}:row);
 }
 if(task.kind==='update_group'){
  if(typeof task.body.visible!=='boolean')return [...rows];
  const nextVisible=task.body.visible;
  return rows.map(row=>({...row,visible:nextVisible}));
 }
 if(task.kind==='update'){
  return rows.map(row=>{
   if(row.id!==task.orderId)return row;
   const next={...row};
   if(validPositiveInt(data?.platinum))next.platinum=data.platinum;
   else if(task.body.platinum!==undefined)next.platinum=task.body.platinum;
   if(validPositiveInt(data?.quantity))next.quantity=data.quantity;
   else if(task.body.quantity!==undefined)next.quantity=task.body.quantity;
   if(typeof data?.visible==='boolean')next.visible=data.visible;
   else if(task.body.visible!==undefined)next.visible=task.body.visible;
   return next;
  });
 }
 const out:T[]=[];
 for(const row of rows){
  if(row.id!==task.orderId){out.push(row);continue;}
  if(data&&typeof data.quantity==='number'&&Number.isSafeInteger(data.quantity)){
   if(data.quantity>0)out.push({...row,quantity:data.quantity});
   continue;
  }
  const nextQty=row.quantity-(task.body.quantity??1);
  if(nextQty>0)out.push({...row,quantity:nextQty});
 }
 return out;
}

export function reconcileSelection(
 selectedIds:ReadonlySet<string>,
 availableIds:ReadonlySet<string>,
 deletingIds:ReadonlySet<string>,
):Set<string>{
 const next=new Set<string>();
 for(const id of selectedIds){
  if(availableIds.has(id)&&!deletingIds.has(id))next.add(id);
 }
 return next;
}

export const emptyOrderQueueState=():OrderQueueState=>({
 tasks:[],
 completed:0,
 failed:[],
 active:false,
 queuedCount:0,
 runningTask:null,
});

export type OrderQueueIO={
 context:()=>OrderQueueContext;
 execute:(task:OrderMutationTask)=>Promise<unknown>;
 onConfirmed:(task:OrderMutationTask,responseData:unknown)=>void;
 onDrain:()=>Promise<void>|void;
 onChange:(state:OrderQueueState)=>void;
 nextId?:()=>string;
};

export class MarketOrderQueue{
 private io:OrderQueueIO;
 private tasks:OrderMutationTask[]=[];
 private failed:OrderQueueFailure[]=[];
 private completed=0;
 private draining=false;
 private seq=0;
 private generation=0;

 constructor(io:OrderQueueIO){
  this.io=io;
 }

 state():OrderQueueState{
  const runningTask=this.tasks.find(t=>t.status==='running')??null;
  const queuedCount=this.tasks.reduce((n,t)=>n+(t.status==='queued'?1:0),0);
  return {
   tasks:this.tasks.map(t=>({...t,body:{...t.body},context:{...t.context}})),
   completed:this.completed,
   failed:this.failed.map(f=>({...f})),
   active:this.tasks.length>0,
   queuedCount,
   runningTask:runningTask?{...runningTask,body:{...runningTask.body},context:{...runningTask.context}}:null,
  };
 }

 enqueue(spec:{orderId:string;label:string;kind:OrderMutationKind;body?:OrderMutationBody;context:OrderQueueContext}):string|null{
  if(!spec.orderId||!spec.context.accountId||!sameOrderQueueContext(spec.context,this.io.context()))return null;
  if(this.tasks.some(t=>t.orderId===spec.orderId&&t.kind==='delete'))return null;
  this.failed=this.failed.filter(f=>f.orderId!==spec.orderId);
  const body={...(spec.body??{})};
  if(spec.kind==='delete'){
   // Drop redundant unsent updates/fixes for this order; keep any in-flight HTTP call or prior close.
   this.tasks=this.tasks.filter(t=>!(t.orderId===spec.orderId&&t.status==='queued'&&(t.kind==='update'||t.kind==='fix')));
  }else if(spec.kind==='update'){
   for(let i=this.tasks.length-1;i>=0;i--){
    const existing=this.tasks[i];
    // Preserve strict FIFO ordering across group visibility barriers.
    if(existing.kind==='update_group'&&body.visible!==undefined)break;
    if(existing.orderId!==spec.orderId)continue;
    if(existing.status==='queued'&&existing.kind==='update'){
     existing.body={...existing.body,...body};
     existing.label=spec.label;
     this.emit();
     return existing.id;
    }
    break;
   }
  }else if(spec.kind==='update_group'){
   for(let i=this.tasks.length-1;i>=0;i--){
    const existing=this.tasks[i];
    if(existing.kind==='update'&&existing.body.visible!==undefined)break;
    if(existing.orderId!==spec.orderId)continue;
    if(existing.status==='queued'&&existing.kind==='update_group'){
     existing.body={...existing.body,...body};
     existing.label=spec.label;
     this.emit();
     return existing.id;
    }
    break;
   }
  }
  const id=this.io.nextId?this.io.nextId():`order-op-${++this.seq}`;
  this.tasks.push({
   id,
   orderId:spec.orderId,
   label:spec.label,
   kind:spec.kind,
   body,
   status:'queued',
   context:{...spec.context},
  });
  this.emit();
  if(!this.draining)void this.drain();
  return id;
 }

 enqueueBatchDelete(entries:readonly {orderId:string;label:string}[],context:OrderQueueContext):number{
  let queued=0;
  for(const entry of entries){
   if(this.enqueue({orderId:entry.orderId,label:entry.label,kind:'delete',context}))queued++;
  }
  return queued;
 }

 cancelOrder(orderId:string):void{
  const before=this.tasks.length;
  this.tasks=this.tasks.filter(t=>!(t.orderId===orderId&&t.status==='queued'));
  if(this.tasks.length!==before)this.emit();
 }

 cancelAllQueued():void{
  const before=this.tasks.length;
  this.tasks=this.tasks.filter(t=>t.status==='running');
  if(this.tasks.length!==before)this.emit();
 }

 dismissFailure(orderId?:string):void{
  const next=orderId===undefined?[]:this.failed.filter(f=>f.orderId!==orderId);
  if(next.length!==this.failed.length){
   this.failed=next;
   this.emit();
  }
 }

 reset():void{
  this.generation++;
  this.tasks=[];
  this.failed=[];
  this.completed=0;
  this.emit();
 }

 private emit(){
  this.io.onChange(this.state());
 }

 private async drain(){
  if(this.draining)return;
  this.draining=true;
  const runGeneration=this.generation;
  let settledInRun=0;
  let drainContext:OrderQueueContext|null=null;
  try{
   while(runGeneration===this.generation){
    const next=this.tasks.find(t=>t.status==='queued');
    if(!next)break;
    if(!sameOrderQueueContext(next.context,this.io.context())){
     this.tasks=this.tasks.filter(t=>t.status==='running');
     this.emit();
     break;
    }
    drainContext=next.context;
    next.status='running';
    this.emit();
    try{
     const responseData=await this.io.execute({
      ...next,
      body:{...next.body},
      context:{...next.context},
     });
     if(runGeneration!==this.generation)break;
     this.tasks=this.tasks.filter(t=>t.id!==next.id);
     if(sameOrderQueueContext(next.context,this.io.context())){
      this.completed++;
      settledInRun++;
      this.io.onConfirmed(next,responseData);
     }else{
      this.tasks=this.tasks.filter(t=>t.status==='running');
     }
     this.emit();
    }catch(error){
     if(runGeneration!==this.generation)break;
     this.tasks=this.tasks.filter(t=>t.id!==next.id);
     const message=error instanceof Error?error.message:String(error);
     if(isOrderSessionAbortError(error)||!sameOrderQueueContext(next.context,this.io.context())){
      this.tasks=[];
      if(isOrderSessionAbortError(error)){
       this.failed=[...this.failed.filter(f=>f.orderId!==next.orderId),{orderId:next.orderId,label:next.label,kind:next.kind,message}];
      }
      this.emit();
      break;
     }
     this.tasks=this.tasks.filter(t=>!(t.orderId===next.orderId&&t.status==='queued'));
     this.failed=[...this.failed.filter(f=>f.orderId!==next.orderId),{orderId:next.orderId,label:next.label,kind:next.kind,message}];
     this.emit();
    }
   }
  }finally{
   this.draining=false;
   this.emit();
  }
  if(runGeneration===this.generation&&this.tasks.length===0&&settledInRun>0&&drainContext&&sameOrderQueueContext(drainContext,this.io.context())){
   await this.io.onDrain();
  }
 }
}

/** Synchronous latch: React's busy state may not have rendered before the next click. */
export class MarketActionGate {
 private pending=false;
 async run(action:()=>Promise<void>){
  if(this.pending)return;
  this.pending=true;
  try{await action();}finally{this.pending=false;}
 }
}

export async function publishMarketOrder(create:()=>Promise<{data:unknown}>,refresh:()=>Promise<void>):Promise<string>{
 const response=await create();
 const data=response.data;
 const id=data&&typeof data==='object'&&'id' in data?data.id:undefined;
 if(typeof id!=='string'||!id.trim())throw Error('未收到有效订单 ID，请先刷新我的订单核对，勿重复提交');
 const success='上架成功 · '+id;
 try{await refresh();return success;}
 catch{return success+'；订单列表刷新失败，请手动刷新';}
}

export async function publishRivenAuction(
 send:()=>Promise<{data:unknown}>,
 receipt:(id:string)=>void,
 refresh:()=>Promise<void>,
):Promise<string>{
 const {data}=await send();
 const id=data&&typeof data==='object'&&'id' in data?data.id:undefined;
 if(typeof id!=='string'||!id.trim())throw Error('未收到有效挂售 ID，请先刷新我的挂售核对，勿重复提交');
 receipt(id);
 const success=`市场已返回成功回执：${id}`;
 try{await refresh();return success;}
 catch{return success+'；挂售列表刷新失败，请手动刷新';}
}

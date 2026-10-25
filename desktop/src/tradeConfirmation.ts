/** Database acknowledgement is authoritative; browser persistence is best effort afterwards. */
export class TradeConfirmation {
 private pending=false;
 private confirmed=new Set<string>();
 async run(id:string,save:()=>Promise<void>,receipt:()=>void,persist:()=>void):Promise<string|null>{
  if(this.pending||this.confirmed.has(id))return null;
  this.pending=true;
  try{
   await save();
   this.confirmed.add(id);
   receipt();
   try{persist();return '';}
   catch{return '成交已保存；本地确认标记保存失败，请勿重复记账。';}
  }finally{this.pending=false;}
 }
 has(id:string){return this.confirmed.has(id);}
}

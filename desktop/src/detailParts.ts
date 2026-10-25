/** Keep recipe slots visible, but never reuse inventory between identical slots. */
export function detailPartRows(parts:readonly {itemId:string;quantity:number}[],counts:Record<string,number>,complete:boolean){
 const consumed=new Map<string,number>();
 return parts.map((part,index)=>{
  const previous=consumed.get(part.itemId)??0;
  const known=counts[part.itemId]??(complete?0:null);
  const available=known===null?null:Math.max(0,known-previous);
  consumed.set(part.itemId,previous+Math.max(0,part.quantity));
  return {...part,key:`${part.itemId}:${index}`,available,sufficient:part.quantity>0&&available!==null&&available>=part.quantity};
 });
}

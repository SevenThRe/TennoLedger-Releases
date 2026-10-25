export type ShardSlot={color:string;upgradeType:string};
export type ShardFrame={itemId:string;instanceId:string;slots:(ShardSlot|null)[]|null};
export type ShardSnapshot={complete:boolean;counts:Record<string,number>;favorites?:string[];archonShardFrames?:ShardFrame[]|null};
export const stelaId='/Lotus/Types/Gameplay/EntratiLab/Resources/MurmurItem';
const prefix='/Lotus/Types/Gameplay/NarmerSorties/ArchonCrystal';
export const shardColors=[
 {key:'red',suffix:'Amar',code:'ACC_RED',name:'Crimson',zh:'深红',removal:'Oxides'},
 {key:'yellow',suffix:'Nira',code:'ACC_YELLOW',name:'Amber',zh:'琥珀',removal:'Bile'},
 {key:'blue',suffix:'Boreal',code:'ACC_BLUE',name:'Azure',zh:'蔚蓝',removal:'Synthetics'},
 {key:'green',suffix:'Green',code:'ACC_GREEN',name:'Emerald',zh:'翡翠',removal:'Biotics'},
 {key:'orange',suffix:'Orange',code:'ACC_ORANGE',name:'Topaz',zh:'黄玉',removal:'Pheromones'},
 {key:'purple',suffix:'Violet',code:'ACC_PURPLE',name:'Violet',zh:'紫晶',removal:'Calx'},
] as const;
export type ShardColor=typeof shardColors[number]['key'];
export const shardId=(color:ShardColor,tau=false)=>prefix+shardColors.find(c=>c.key===color)!.suffix+(tau?'Mythic':'');
export function describeShard(slot:ShardSlot|null){
 const installed=!!slot&&((!!slot.color.trim()&&slot.color!=='ACC_NONE')||!!slot.upgradeType.trim());
 const tau=installed&&!!slot?.color.endsWith('_MYTHIC');
 const definition=shardColors.find(c=>c.code===slot?.color.replace(/_MYTHIC$/,''));
 return {installed,tau,color:installed?definition?.key??'unknown':null,itemId:installed&&definition?shardId(definition.key,tau):null,effectId:slot?.upgradeType??'',removalResource:definition?.removal??null,removalPercent:installed?(tau?30:15):0};
}
export type ShardRecipe={id:string;kind:'ascent'|'coalescent';color:ShardColor;tau:boolean;output:string;stela:number;inputs:{id:string;quantity:number}[]};
export const shardRecipes:ShardRecipe[]=[
 ...shardColors.map(c=>({id:`ascent-${c.key}`,kind:'ascent' as const,color:c.key,tau:true,output:shardId(c.key,true),stela:100,inputs:[{id:shardId(c.key),quantity:3}]})),
 ...([['green','yellow','blue'],['orange','red','yellow'],['purple','red','blue']] as const).flatMap(([color,a,b])=>[false,true].map(tau=>({id:`coalescent-${color}${tau?'-tau':''}`,kind:'coalescent' as const,color,tau,output:shardId(color,tau),stela:50,inputs:[{id:shardId(a,tau),quantity:1},{id:shardId(b,tau),quantity:1}]}))),
];
export function shardStock(snapshot:ShardSnapshot|null,id:string):number|null{
 const value=snapshot?.counts[id];
 return value===undefined?(snapshot?.complete?0:null):Number.isSafeInteger(value)&&value>=0?value:null;
}
/** Each recipe is an independent capacity estimate, not a combined shopping plan. */
export function shardCapacity(snapshot:ShardSnapshot|null,recipe:ShardRecipe):number|null{
 const available=[{id:stelaId,quantity:recipe.stela},...recipe.inputs].map(input=>{const n=shardStock(snapshot,input.id);return n===null?null:Math.floor(n/input.quantity);});
 return available.some(n=>n===null)?null:Math.min(...available as number[]);
}
export function archonOverview(snapshot:ShardSnapshot|null){
 const captured=snapshot?.archonShardFrames;
 const copies=new Map<string,number>();
 const sorted=[...captured??[]].sort((a,b)=>a.itemId.localeCompare(b.itemId)||a.instanceId.localeCompare(b.instanceId));
 const frames=sorted.map(frame=>{
  const slots=frame.slots?.map(describeShard)??null,copy=(copies.get(frame.itemId)??0)+1;copies.set(frame.itemId,copy);
  return {...frame,slots,copy,favorite:!!snapshot?.favorites?.includes(frame.itemId),equipped:slots?.filter(s=>s.installed).length??null,tauforged:slots?.filter(s=>s.tau).length??null};
 }).map(frame=>({...frame,copies:copies.get(frame.itemId)!}));
 const rosterKnown=captured!=null&&frames.every(f=>f.slots!==null);
 const colors=shardColors.map(c=>{
  const slots=frames.flatMap(f=>f.slots??[]).filter(s=>s.installed&&s.color===c.key);
  return {...c,id:shardId(c.key),tauId:shardId(c.key,true),available:shardStock(snapshot,shardId(c.key)),availableTau:shardStock(snapshot,shardId(c.key,true)),equipped:rosterKnown?slots.filter(s=>!s.tau).length:null,equippedTau:rosterKnown?slots.filter(s=>s.tau).length:null};
 });
 return {frames,colors,rosterKnown,stela:shardStock(snapshot,stelaId),unknownEquipped:rosterKnown?frames.flatMap(f=>f.slots??[]).filter(s=>s.color==='unknown').length:null,recipes:shardRecipes.map(r=>({...r,capacity:shardCapacity(snapshot,r)}))};
}

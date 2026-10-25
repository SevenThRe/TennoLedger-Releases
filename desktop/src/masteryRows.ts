import type {Recommendation,Tally} from './masteryModel';
export type MasteryRow={kind:'equipment';value:Recommendation}|{kind:'intrinsic';id:string;name:string;tally:Tally;xp:number};
export function masteryRows(list:Recommendation[],mode:string,account?:{duviri?:Tally|null;railjack?:Tally|null}|null):MasteryRow[]{
 const rows:MasteryRow[]=list.map(value=>({kind:'equipment',value}));
 if(mode!=='normal')return rows;
 for(const [id,name,tally] of [['duviri','Duviri',account?.duviri],['railjack','Railjack',account?.railjack]] as const){
  if(tally&&tally.current>0&&tally.current<tally.max)rows.push({kind:'intrinsic',id:'intrinsic:'+id,name,tally,xp:1500});
 }
 const owned=(r:MasteryRow)=>r.kind==='intrinsic'||r.value.owned;
 const xp=(r:MasteryRow)=>r.kind==='intrinsic'?r.xp:r.value.xp;
 const remaining=(r:MasteryRow)=>r.kind==='intrinsic'?10:r.value.missing?.length??0;
 return rows.sort((a,b)=>Number(owned(b))-Number(owned(a))||(owned(a)?0:remaining(a)-remaining(b))||xp(b)-xp(a));
}

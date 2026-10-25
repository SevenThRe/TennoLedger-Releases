export const allState=(states:(boolean|null)[]):boolean|null=>states.some(x=>x===false)?false:states.some(x=>x===null)||!states.length?null:true;
export const accepts=(state:boolean|null,filter:string)=>filter==='all'||(filter==='yes'?state===true:state===false);
export function missingReward(count:number|null,parent:boolean|null):boolean|null {return (count??0)>0||parent===true?false:count===null||parent===null?null:count===0&&!parent;}
export function isFormaReward(id:string){return id==='/Lotus/Types/Recipes/Components/FormaBlueprint';}
export function allRewardState(rewards:ReadonlyArray<{id:string}>,state:(id:string)=>boolean|null){
 return allState(rewards.map(reward=>isFormaReward(reward.id)?true:state(reward.id)));
}

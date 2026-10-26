import type {ArbitrationRun} from './arbitrationRunModel.ts';
export type LiveAnchor={id:string;log:number;wall:number};
export function liveClock(run:ArbitrationRun,anchor:LiveAnchor,now:number){
 if(run.status!=='recording')return run.gameplayEnd??run.lastLogSeconds;
 return anchor.log+Math.max(0,now-anchor.wall)/1000;
}
export function livePhase(run:ArbitrationRun,clock:number){
 const interval=run.intervals.at(-1);
 if(run.gameplayStart===null)return {phase:'preparing',index:null,seconds:null,breakSeconds:null} as const;
 if(!interval)return {phase:'running',index:null,seconds:Math.max(0,clock-run.gameplayStart),breakSeconds:null} as const;
 return {phase:interval.complete?'intermission':'running',index:interval.index,seconds:Math.max(0,(interval.end??clock)-interval.start),breakSeconds:interval.complete&&interval.end!==null?Math.max(0,clock-interval.end):null} as const;
}

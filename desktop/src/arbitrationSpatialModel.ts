import type {SpawnPosition,AgentType} from './arbitrationRunModel.ts';
export function spatialPoints(points:readonly SpawnPosition[],from:number,to:number,kind='all'){
 return points.filter(p=>[p.x,p.y,p.z,p.seconds].every(Number.isFinite)&&(['enemy','drone','objective'].includes(p.kind))&&(p.kind==='objective'||p.seconds>=from&&p.seconds<=to&&(kind==='all'||p.kind===kind)));
}
export function spatialBounds(points:readonly SpawnPosition[],plane:string){
 const axes:('x'|'y'|'z')[]=plane==='xy'?['x','y']:plane==='yz'?['y','z']:['x','z'];
 let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
 for(const p of points){minX=Math.min(minX,p[axes[0]]);maxX=Math.max(maxX,p[axes[0]]);minY=Math.min(minY,p[axes[1]]);maxY=Math.max(maxY,p[axes[1]]);}
 return {axes,x:points.length?(minX+maxX)/2:0,y:points.length?(minY+maxY)/2:0,span:points.length?Math.max(1,maxX-minX,maxY-minY):1};
}
export function agentComposition(agents:readonly AgentType[]){return agents.filter(a=>typeof a.name==='string'&&Number.isSafeInteger(a.count)&&a.count>0).slice().sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name));}

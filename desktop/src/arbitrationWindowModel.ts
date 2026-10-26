export type WorkArea={x:number;y:number;width:number;height:number;scale:number};
export function restoreMiniPosition(saved:{x:number;y:number},areas:WorkArea[]){
 if(!Number.isFinite(saved.x)||!Number.isFinite(saved.y)||!areas.length)return null;
 const area=areas.find(a=>saved.x>=a.x&&saved.x<a.x+a.width&&saved.y>=a.y&&saved.y<a.y+a.height)??areas[0];
 return {x:Math.round(Math.max(area.x,Math.min(saved.x,area.x+Math.max(0,area.width-380*area.scale)))),y:Math.round(Math.max(area.y,Math.min(saved.y,area.y+Math.max(0,area.height-280*area.scale))))};
}

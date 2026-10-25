export type FissureMode='all'|'normal'|'hard'|'storm'|'any';
export const fissureModes:readonly FissureMode[]=['all','normal','hard','storm','any'];
export function matchesFissureMode(event:{steelPath:boolean;voidStorm?:boolean;nodeId:string},mode:FissureMode):boolean {
 // Older saved snapshots did not preserve the source array. CrewBattleNode is
 // the node family used by those Railjack entries; explicit source wins.
 const storm=event.voidStorm??event.nodeId.startsWith('CrewBattleNode');
 return mode==='any'||(mode==='storm'?storm:!storm&&(mode==='all'||event.steelPath===(mode==='hard')));
}
export function fissureModeLabel(mode:FissureMode,en:boolean):string {
 return ({all:['普通 + 钢铁之路','Normal + Steel Path'],normal:['普通','Normal'],hard:['钢铁之路','Steel Path'],storm:['虚空风暴','Void Storms'],any:['全部模式','All modes']} as const)[mode][en?1:0];
}

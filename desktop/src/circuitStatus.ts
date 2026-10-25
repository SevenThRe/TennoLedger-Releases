export function installedCircuitIncarnon(installed:string[]|null|undefined,name:string,items:{id:string;name:string}[]){
 const family=(s:string)=>s.toLowerCase().replace(/^(mk1-|kuva |tenet |prisma |sancti |vaykor |telos |synoid |rakta |secura )/,'').replace(/ (prime|wraith|vandal)$/,'').trim();
 return items.some(item=>family(item.name)===family(name)&&installed?.includes(item.id));
}
export function circuitWarframeStatus(snapshot:{ranks?:Record<string,number>;helminth?:string[]|null}|null,item:{id:string;maxRank:number}|undefined){
 const mastered=!!item&&item.maxRank>0&&(snapshot?.ranks?.[item.id]??-1)>=item.maxRank;
 const subsumed=!!item&&!!snapshot?.helminth?.includes(item.id);
 return {mastered,subsumed,complete:mastered||subsumed};
}

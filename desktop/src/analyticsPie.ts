// proAnalytics.js sorts the seven reference category names alphabetically
// before applying this palette. Preserve that identity for partial quotes too.
const colors:Record<string,string>={arcane:'#4b63cb',mod:'#4a9424',other:'#393d4a',prime:'#eba000',relic:'#c65373',riven:'#831a90',set:'#5295c6',unallocated:'#8991a6'};
export function analyticsPieData(rows:readonly {type:string;value:number;name:string}[]){
 return [...rows].sort((a,b)=>a.type.localeCompare(b.type)).map(row=>({
  name:row.name,value:Math.max(0,row.value),itemStyle:{color:colors[row.type]??colors.other},
 }));
}
// The reference chart area is 230px inside a 243px square, not 90%.
export const analyticsPieRadius=`${230/243*100}%`;

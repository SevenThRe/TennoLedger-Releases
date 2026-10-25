export type LocationData={nodes:Record<string,{name:string;zh:string;planet:string;planetZh:string}>;planets?:Record<string,string>};
/** Match complete planet/node pairs, never translate a same-named node on another planet. */
export function dropLocationTranslator(data:LocationData,en=false,missionZh:Record<string,string>={}){
 const nodes=new Map<string,Set<string>>(),planets=data.planets??{};
 for(const n of Object.values(data.nodes)){
  if(!n.zh||n.zh.includes('�'))continue;
  const key=n.planet+'/'+n.name,values=nodes.get(key)??new Set<string>();values.add(n.zh);nodes.set(key,values);
 }
 return (source:string)=>{
  if(en)return source;
  let value=source.replace(/^([^/()]+)\/([^(),]+)(.*)$/,(_,planet:string,node:string,tail:string)=>{
   const names=nodes.get(planet+'/'+node.trim());
   const zh=names?.size===1?[...names][0]:node.trim();
   return (planets[planet]??planet)+'/'+zh+(node.endsWith(' ')?' ':'')+tail;
  });
  // Mission labels are bounded by parentheses; unknown bounty/stage text stays intact.
  value=value.replace(/\(([^()]*)\)/g,(_,mission:string)=>'('+(missionZh[mission]??mission)+')');
  return value.replace(/, Rotation ([A-Z])\b/g,', 轮次 $1');
 };
}

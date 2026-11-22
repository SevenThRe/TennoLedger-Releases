export type UpstreamItem={id:string;name:string;zh?:string;category?:string;recipe?:{output:number;parts:{itemId:string;quantity:number;reusable?:boolean}[]}};
export type UpstreamEdge={itemId:string;quantity:number};
export type UpstreamNode={itemId:string;quantity:number;parents:UpstreamNode[];hiddenParents:number};
export type UpstreamTree={directCount:number;parents:UpstreamNode[];hiddenParents:number};
export type UpstreamSummary={count:number;preview:UpstreamEdge[];remaining:number};

export function buildParentIndex(items:Iterable<UpstreamItem>):Map<string,UpstreamEdge[]>{
 const names=new Map<string,string>();
 const grouped=new Map<string,UpstreamEdge[]>();
 for(const item of items){
  names.set(item.id,item.name);
  const parts=item.recipe?.parts;
  if(!parts?.length)continue;
  // Merge repeated parts on a single parent recipe (e.g. Akbolto requires 2x Bolto).
  const consumed=new Map<string,number>();
  for(const part of parts){
   if(!part.itemId||part.itemId===item.id||!Number.isFinite(part.quantity)||part.quantity<=0)continue;
   const previous=consumed.get(part.itemId)??0;
   consumed.set(part.itemId,part.reusable?Math.max(previous,part.quantity):previous+part.quantity);
  }
  for(const [partId,quantity] of consumed){
   const list=grouped.get(partId);
   const edge={itemId:item.id,quantity};
   if(list)list.push(edge);
   else grouped.set(partId,[edge]);
  }
 }
 const index=new Map<string,UpstreamEdge[]>();
 for(const [partId,edges] of grouped){
  edges.sort((a,b)=>(names.get(a.itemId)??a.itemId).localeCompare(names.get(b.itemId)??b.itemId)||a.itemId.localeCompare(b.itemId));
  index.set(partId,edges);
 }
 return index;
}

export function directUpstream(itemId:string,index:ReadonlyMap<string,readonly UpstreamEdge[]>,sortName?:(id:string)=>string):UpstreamEdge[]{
 const edges=index.get(itemId);
 if(!edges?.length)return [];
 const copy=edges.map(edge=>({...edge}));
 if(sortName)copy.sort((a,b)=>sortName(a.itemId).localeCompare(sortName(b.itemId))||a.itemId.localeCompare(b.itemId));
 return copy;
}

export function upstreamTree(
 itemId:string,
 index:ReadonlyMap<string,readonly UpstreamEdge[]>,
 options?:{maxDepth?:number;maxBranch?:number;maxNodes?:number;sortName?:(id:string)=>string},
):UpstreamTree{
 const maxDepth=Math.max(1,options?.maxDepth??4);
 const maxBranch=Math.max(1,options?.maxBranch??4);
 let remaining=Math.max(0,options?.maxNodes??16);
 const sortName=options?.sortName;

 function build(edges:readonly UpstreamEdge[],depth:number,path:ReadonlySet<string>):{nodes:UpstreamNode[];hidden:number}{
  if(depth>maxDepth||!edges.length||remaining<=0){
   return {nodes:[],hidden:edges.length};
  }
  const visible=edges.slice(0,Math.min(maxBranch,remaining));
  remaining-=visible.length;
  const hidden=edges.length-visible.length;
  // Cap high fan-out raw materials at direct parents so the canvas stays readable.
  if(depth===1&&edges.length>maxBranch){
   return {
    nodes:visible.map(edge=>({itemId:edge.itemId,quantity:edge.quantity,parents:[],hiddenParents:0})),
    hidden,
   };
  }
  const nextEntries=visible.map(edge=>{
   const nextPath=new Set(path);
   nextPath.add(edge.itemId);
   const candidates=directUpstream(edge.itemId,index,sortName).filter(parent=>!nextPath.has(parent.itemId));
   return {edge,nextPath,candidates};
  });
  const nodes=nextEntries.map(({edge,nextPath,candidates})=>{
   if(depth>=maxDepth){
    return {itemId:edge.itemId,quantity:edge.quantity,parents:[],hiddenParents:candidates.length};
   }
   const sub=build(candidates,depth+1,nextPath);
   return {itemId:edge.itemId,quantity:edge.quantity,parents:sub.nodes,hiddenParents:sub.hidden};
  });
  return {nodes,hidden};
 }

 const rootPath=new Set([itemId]);
 const rootEdges=directUpstream(itemId,index,sortName);
 const built=build(rootEdges,1,rootPath);
 return {directCount:rootEdges.length,parents:built.nodes,hiddenParents:built.hidden};
}

export function upstreamSummary(
 itemId:string,
 index:ReadonlyMap<string,readonly UpstreamEdge[]>,
 sortName?:(id:string)=>string,
 maxPreview=4,
):UpstreamSummary{
 const all=directUpstream(itemId,index,sortName);
 const preview=all.slice(0,Math.max(0,maxPreview));
 return {count:all.length,preview,remaining:all.length-preview.length};
}

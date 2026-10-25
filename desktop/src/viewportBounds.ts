/** A portal is fixed to the visible intersection, not the full scrollable document. */
export function visibleBounds(rect:{left:number;top:number;right:number;bottom:number},viewport:{width:number;height:number},content?:{left:number;top:number;right:number;bottom:number}){
 const left=Math.max(0,rect.left,content?.left??0),top=Math.max(0,rect.top,content?.top??0);
 const right=Math.min(viewport.width,rect.right,content?.right??viewport.width),bottom=Math.min(viewport.height,rect.bottom,content?.bottom??viewport.height);
 return {left,top,width:Math.max(0,right-left),height:Math.max(0,bottom-top)};
}

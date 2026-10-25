export type TreeNode={itemId:string;needed:number;owned:number|null;allocated:number|null;missing:number|null;status:string;children:TreeNode[]};
type Recipe={output:number;parts:{itemId:string;quantity:number;reusable?:boolean}[]};

// Display-only expansion of owned assemblies. Never turn covered materials into
// an inventory claim or feed them back into the authoritative cost calculation.
export function craftingDisplayTree(root:TreeNode,items:ReadonlyMap<string,{recipe?:Recipe}>,hide:boolean):TreeNode{
 if(hide)return root;
 function expand(n:TreeNode,path:ReadonlySet<string>):TreeNode{
  if(path.has(n.itemId)||path.size>32)return n;
  const next=new Set(path).add(n.itemId);
  let children=n.children;
  const recipe=items.get(n.itemId)?.recipe;
  if(!children.length&&(n.status==='owned'||n.status==='covered')&&recipe&&recipe.output>0){
   const parts=new Map<string,{quantity:number;reusable:boolean}>();
   const batches=Math.ceil(n.needed/recipe.output);
   for(const part of recipe.parts){
    const reusable=!!part.reusable,quantity=reusable?part.quantity:part.quantity*batches;
    const previous=parts.get(part.itemId);
    // Invalid catalog data must not generate misleading display quantities.
    if(!Number.isSafeInteger(quantity)||quantity<0||(previous&&previous.reusable!==reusable))return n;
    const total=previous?(reusable?Math.max(previous.quantity,quantity):previous.quantity+quantity):quantity;
    if(!Number.isSafeInteger(total))return n;
    parts.set(part.itemId,{quantity:total,reusable});
   }
   children=Array.from(parts,([itemId,p])=>({itemId,needed:p.quantity,owned:null,allocated:null,missing:null,status:'covered',children:[]}));
  }
  return children.length?{...n,children:children.map(c=>expand(c,next))}:n;
 }
 return expand(root,new Set());
}

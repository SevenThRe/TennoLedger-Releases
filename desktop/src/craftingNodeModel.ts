import type {TreeNode} from './craftingDisplay.ts';
export type CraftingItem={id:string;name:string;zh:string;image:string;imageUrl:string;recipe?:{output:number;credits?:number;seconds?:number;parts:{itemId:string;quantity:number;reusable?:boolean}[]}};
export const craftingState=(n:TreeNode)=>n.status==='owned'?'owned':n.status==='craft'||n.status==='craftable'?'craftable':n.status==='unknown'||n.status==='covered'?'unknown':'missing';
export function craftableQuantity(node:TreeNode,items:ReadonlyMap<string,CraftingItem>):number|null{
 if(node.missing===null||node.status==='covered')return null;
 if(node.missing===0)return 0;
 const recipe=items.get(node.itemId)?.recipe;
 if(!recipe||!node.children.length)return 0;
 if(node.children.some(c=>c.allocated===null))return null;
 const batches=Math.ceil(node.missing/recipe.output);
 const available=Math.min(...node.children.map(child=>{
  const ready=craftableQuantity(child,items);
  if(ready===null)return 0;
  const part=recipe.parts.find(p=>p.itemId===child.itemId);
  if(!part)return 0;
  return part.reusable?((child.allocated??0)+ready>=part.quantity?batches:0):Math.floor(((child.allocated??0)+ready)/(child.needed/batches));
 }));
 return Math.min(node.missing,available*recipe.output);
}
export const craftingDuration=(n:number|null|undefined)=>n==null?'—':n===0?'0':`${Math.floor(n/86400)?Math.floor(n/86400)+'d ':''}${Math.floor(n%86400/3600)?Math.floor(n%86400/3600)+'h ':''}${Math.ceil(n%3600/60)?Math.ceil(n%3600/60)+'m':''}`.trim();
export const craftingQuantity=(n:number|null)=>n===null?'—':n>=1000?new Intl.NumberFormat('en',{notation:'compact',maximumFractionDigits:1}).format(n):n.toLocaleString();

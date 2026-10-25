export type PlayerPopoverPosition={left:number;top:number;scale:number;width:number;maxHeight:number};
// DOM rects are in viewport pixels; the rail's offsetWidth is in CSS pixels.
export function playerPopoverPosition(anchor:{left:number;right:number;top:number;width:number;bottom?:number},cssWidth:number,viewport:{width:number;height:number}):PlayerPopoverPosition{
 const scale=cssWidth>0?anchor.width/cssWidth:1;
 const gutter=8,gap=10*scale,fullWidth=Math.min(340*scale,Math.max(1,viewport.width-2*gutter));
 const rightSpace=viewport.width-gutter-anchor.right-gap,leftSpace=anchor.left-gap-gutter;
 const right=rightSpace>=Math.min(280*scale,fullWidth),leftSide=!right&&leftSpace>=Math.min(280*scale,fullWidth);
 const width=right?Math.min(fullWidth,rightSpace):leftSide?Math.min(fullWidth,leftSpace):fullWidth;
 const left=right?anchor.right+gap:leftSide?anchor.left-gap-width:Math.max(gutter,Math.min(anchor.left,viewport.width-width-gutter));
 const height=326*scale,top=right||leftSide?Math.max(gutter,Math.min(anchor.top,viewport.height-height-gutter)):Math.max(gutter,Math.min((anchor.bottom??anchor.top+68*scale)+gap,viewport.height-gutter-80*scale));
 return {left,top,scale,width:width/scale,maxHeight:Math.max(1,(viewport.height-top-gutter)/scale)};
}

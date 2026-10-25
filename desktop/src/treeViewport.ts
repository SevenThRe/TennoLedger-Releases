export type TreeCamera={zoom:number;x:number;y:number};
export const initialTreeCamera:TreeCamera={zoom:1,x:0,y:0};
export function zoomTree(camera:TreeCamera,target:number,anchor={x:0,y:0}):TreeCamera{
 const zoom=Math.min(1.6,Math.max(.01,target));
 const ratio=zoom/camera.zoom;
 return {zoom,x:anchor.x-(anchor.x-camera.x)*ratio,y:anchor.y-(anchor.y-camera.y)*ratio};
}

type ViewportRect={left:number;top:number;width:number;height:number};
export function treePointer(client:{x:number;y:number},rect:ViewportRect,width:number,height:number){
 const sx=rect.width>0?width/rect.width:1,sy=rect.height>0?height/rect.height:1;
 return {x:(client.x-rect.left)*sx,y:(client.y-rect.top)*sy};
}

export function fitTreeCamera(view:{width:number;height:number},tree:{width:number;height:number},all=false):TreeCamera{
 const fitted=Math.min(1,(view.width-24)/Math.max(1,tree.width),(view.height-48)/Math.max(1,tree.height));
 const zoom=Math.max(all?.01:.85,fitted);
 return {zoom,x:(view.width-tree.width*zoom)/2,y:Math.max(12,(view.height-28-tree.height*zoom)/2)};
}
export function focusTreeCamera(camera:TreeCamera,view:{width:number;height:number},node:{x:number;y:number;width:number;height:number}):TreeCamera{
 const left=node.x*camera.zoom+camera.x,top=node.y*camera.zoom+camera.y;
 if(left>=12&&left+node.width*camera.zoom<=view.width-12&&top>=12&&top+node.height*camera.zoom<=view.height-35&&camera.zoom>=.7)return camera;
 const zoom=Math.max(.85,camera.zoom);
 return {zoom,x:view.width/2-(node.x+node.width/2)*zoom,y:view.height/2-(node.y+node.height/2)*zoom};
}
export function treeMovement(delta:{x:number;y:number},rect:ViewportRect,width:number,height:number){
 return {x:delta.x*(rect.width>0?width/rect.width:1),y:delta.y*(rect.height>0?height/rect.height:1)};
}

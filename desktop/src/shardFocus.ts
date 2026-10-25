import type {ShardFrame} from './archonModel.ts';
import {describeShard} from './archonModel.ts';
export type ShardFocus={itemId:string;instanceId?:string};
/** Match reference fallback: explicit instance, installed copy, then any copy. */
export function findShardFrame(frames:readonly ShardFrame[],target:ShardFocus){
 return frames.find(f=>!!target.instanceId&&f.instanceId===target.instanceId)
  ??frames.find(f=>f.itemId===target.itemId&&f.slots?.some(s=>describeShard(s).installed))
  ??frames.find(f=>f.itemId===target.itemId);
}

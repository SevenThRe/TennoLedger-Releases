export type ShardPreferences={page:'arsenal'|'fusion'|'guide';guideColor:string;color:string;tier:string;installation:string;favorites:boolean;order:string};
export const shardDefaults:ShardPreferences={page:'arsenal',guideColor:'red',color:'',tier:'',installation:'yes',favorites:false,order:'shards'};
export function parseShardPreferences(raw:string|null):ShardPreferences{
 const saved:unknown=raw?JSON.parse(raw):{};
 if(!saved||typeof saved!=='object'||Array.isArray(saved))throw Error('Invalid shard preferences');
 const result={...shardDefaults},values=saved as Record<string,unknown>;
 const choices={page:['arsenal','fusion','guide'],guideColor:['red','yellow','blue','green','orange','purple'],color:['','red','yellow','blue','green','orange','purple'],tier:['','regular','tau','fullTau'],installation:['','yes','empty','full'],favorites:[false,true],order:['shards','name','tau','upgrade']};
 for(const key of Object.keys(choices) as (keyof ShardPreferences)[])if((choices[key] as readonly unknown[]).includes(values[key]))Object.assign(result,{[key]:values[key]});
 return result;
}

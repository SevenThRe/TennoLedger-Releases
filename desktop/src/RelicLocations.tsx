import {useDropLocation} from './useDropLocation';
import {useState} from 'react';
import {searchText} from './searchText';
import type {Relic} from './relicModel';

export default function RelicLocations({relic,en}:{relic:Relic;en:boolean}){
 const locationName=useDropLocation(en);
 const L=(zh:string,english:string)=>en?english:zh;
 const [search,setSearch]=useState(''),rows=(relic.drops??[]).filter(row=>searchText(search,row.location,locationName(row.location)));
 return <section className="relicLocations" aria-label={L('遗物掉落地点','Relic drop locations')}><div className="relicSectionHeading"><h3>{L('获取地点','Where to find it')}</h3><span>{relic.drops?.length??0}</span></div>{(relic.drops?.length??0)>5&&<input aria-label={L('搜索遗物来源','Search relic locations')} value={search} placeholder={L('搜索','Search')} onChange={e=>setSearch(e.target.value)} onKeyDown={e=>{if(e.key==='Escape'&&search){e.stopPropagation();setSearch('');}}}/>}<div className="relicLocationsList">{rows.length?rows.map((drop,index)=><div key={index}><span>{locationName(drop.location)}</span><b>{+drop.chance.toFixed(2)}%</b></div>):<p>{search?L('没有匹配的获取地点','No matching drop locations.'):relic.drops===undefined?L('掉落资料未提供','Drop data unavailable'):relic.vaulted?L('该遗物已入库，仍可开启已拥有的遗物或向其他玩家购买。','This relic is vaulted. You can still open copies you own or buy more from other players.'):L('未列出该遗物的获取地点','No drop locations are listed for this relic.')}</p>}</div></section>;
}

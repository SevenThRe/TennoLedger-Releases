import {useDropLocation} from './useDropLocation';
import type {Relic} from './relicModel';

export default function RelicLocations({relic,en}:{relic:Relic;en:boolean}){
 const locationName=useDropLocation(en);
 const L=(zh:string,english:string)=>en?english:zh;
 return <section className="relicLocations" aria-label={L('遗物掉落地点','Relic drop locations')}><h3>{L('掉落地点','Drop locations')}</h3><div className="relicLocationsList">{relic.drops?.length?relic.drops.map((drop,index)=><div key={index}><span>{locationName(drop.location)}</span><b>{+drop.chance.toFixed(2)}%</b></div>):<p>{relic.drops===undefined?L('掉落资料未提供','Drop data unavailable'):relic.vaulted?L('该遗物已入库','This relic is vaulted'):L('未找到该遗物的掉落信息','No drop locations found for this relic')}</p>}</div></section>;
}

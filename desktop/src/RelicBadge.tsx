import {relicImage} from './relicImage';
import {refinementLabel} from './relicLabels';
import {useId} from 'react';
import type {RelicSource} from './ownedRelicRewards';
export default function RelicBadge({rows,name,en}:{rows:RelicSource[];name:string;en:boolean}){
 const id=useId();
 if(!rows.length)return null;
 return <><span className="relicAvailable" aria-label={en?'Owned relic can reward this part':'库存遗物可开出此配件'} aria-describedby={id}><img src="/reference/ui/fissure.webp" alt=""/></span><span className="partRelicTooltip" id={id} role="tooltip"><strong>{name}</strong>{rows.map(r=><span className="partRelicRow" key={r.id}><img src={relicImage(r.era,r.refinement)} alt=""/><span>{r.name}<small>{refinementLabel(r.refinement,en)}</small></span><b title={r.countComplete===false?(en?'At least this many owned; other aliases have not been collected':'至少拥有此数量，其他别名库存尚未采集'):undefined}>▣ {r.countComplete===false?'≥':'×'}{r.count}</b><b>{Number(r.chance.toFixed(2))}%</b></span>)}</span></>;
}

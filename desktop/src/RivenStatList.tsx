import {rivenAttributeName} from './rivenLocalization';
import {useTranslation} from 'react-i18next';
import type {Riven} from './rivenModel';
import {formatAttribute} from './rivenModel';
import {previewRivenAttributes,rivenLetterGrade} from './rivenQuality';

export default function RivenStatList({riven,rank,units}:{riven:Riven;rank:number;units:Record<string,string>}) {
 const {i18n}=useTranslation(),en=i18n.language.startsWith('en');
 return <div className="rivenDetailStats">{previewRivenAttributes(riven,rank).map(attribute=>{
  const name=rivenAttributeName(attribute.slug,attribute.name,i18n.language);
  const quality=attribute.rollQuality;
  const known=typeof quality==='number'&&Number.isFinite(quality)&&quality>=0&&quality<=1;
  const range=attribute.rangesByRank?.[rank];
  // Endpoints are already formatted numeric values from the source calculation;
  // preserve their signs, including negative recoil and faction multipliers.
  const endpoint=(value:number)=>units[attribute.slug]==='x'?`×${value}`:`${value>0?'+':''}${value}${units[attribute.slug]??''}`;
  return <div className={'rivenDetailStat '+(attribute.positive?'positive':'negative')} key={attribute.slug}>
   <span className="rivenDetailStatText" title={name}>{formatAttribute(attribute,units[attribute.slug])} {name}</span>
   <div className="rivenStatQuality"><b title={en?'Quality of the random stat value':'词条随机品质评级'}>{rivenLetterGrade(quality)}</b><span>{range?endpoint(range[0]):'—'}</span>
    <div className="rivenStatBar" role="progressbar" aria-label={name+(en?' random quality':' 随机品质')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={known?quality*100:undefined} aria-valuetext={known?(quality*100).toFixed(1)+'%':(en?'Unknown':'未知')}><i style={{width:known?`${quality*100}%`:'0%'}}/></div>
    <span>{range?endpoint(range[1]):'—'}</span></div>
  </div>;
 })}</div>;
}

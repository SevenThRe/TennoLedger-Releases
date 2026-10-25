import type {Riven,RivenCatalog} from './rivenModel.ts';

export type RivenGrade='Perfect'|'Good'|'HasPotential'|'Bad'|'Unknown';
export const gradeLabel:Record<RivenGrade,string>={Perfect:'完美',Good:'优秀',HasPotential:'有潜力',Bad:'较差',Unknown:'未知'};
type Weapon=RivenCatalog['weapons'][number];

export function rivenWeaponPreview(r:Riven,weaponId:string):Riven {
 const variant=r.weaponPreviews?.find(v=>v.weaponId===weaponId);
 return variant?{...r,attributes:variant.attributes}:r;
}

export function rivenLetterGrade(quality?:number|null):string {
 if(typeof quality!=='number'||!Number.isFinite(quality)||quality<0||quality>1)return '—';
 const deviation=quality*20-10;
 let threshold=-11.5;
 for(const grade of ['F','C-','C','C+','B-','B','B+','A-','A','A+','S']) {
  threshold+=grade==='B'?3:2;
  if(threshold>deviation)return grade;
 }
 return '—';
}

export function availableRivenRanks(r:Riven):number[] {
 if(!r.attributes.length||r.attributes.some(a=>!a.valuesByRank||a.valuesByRank.length!==r.maxRank+1||a.valuesByRank.some(v=>!Number.isFinite(v))))return [r.rank];
 return Array.from({length:r.maxRank+1},(_,rank)=>rank);
}

export function previewRivenAttributes(r:Riven,rank:number) {
 if(!availableRivenRanks(r).includes(rank)||rank===r.rank)return r.attributes;
 return r.attributes.map(a=>({...a,value:a.valuesByRank![rank]}));
}

// AlecaFrame's recommendation grade evaluates trait combinations, not roll magnitudes.
export function rivenGrade(r:Riven,weapon?:Weapon):RivenGrade {
 const rules=weapon?.goodRolls;
 if(r.veiled||!rules||!r.attributes.length)return 'Unknown';
 const positive=r.attributes.filter(a=>a.positive).map(a=>a.slug);
 const negative=r.attributes.filter(a=>!a.positive).map(a=>a.slug);
 const useful=(slug:string)=>rules.goodAttrs.some(rule=>[...rule.mandatory,...rule.optional].includes(slug));
 const count=positive.filter(useful).length;
 const matches=rules.goodAttrs.some(rule=>rule.mandatory.every(s=>positive.includes(s))&&
  [...rule.mandatory,...rule.optional].filter(s=>positive.includes(s)).length===positive.length);
 const bad=negative.some(s=>!rules.acceptedBadAttrs.includes(s)&&useful(s));
 const neutral=negative.some(s=>!rules.acceptedBadAttrs.includes(s)&&!useful(s));
 if(bad)return (matches&&count>=2)||count>=3?'HasPotential':'Bad';
 if(neutral)return matches||count>=2?'Good':count>=1?'HasPotential':'Bad';
 if(matches)return count>=2&&negative.length>0?'Perfect':'Good';
 return count>=2?'Good':count>=1?'HasPotential':'Bad';
}

export function rivenPerfectness(r:Riven):number|null {
 if(r.veiled||!r.attributes.length)return null;
 const rolls=r.attributes.map(a=>a.rollQuality);
 if(rolls.some(q=>typeof q!=='number'||!Number.isFinite(q)||q<0||q>1))return null;
 return (rolls as number[]).reduce((sum,q)=>sum+q,0)/rolls.length;
}

export function compareRivens(a:Riven,b:Riven,mode:string,descending:boolean,weapons:Map<string,Weapon>):number {
 const value=(r:Riven):number|null=>{
  const w=weapons.get(r.weaponSlug??'');
  if(mode==='rerolls')return r.rerolls;
  if(mode==='mastery')return r.masteryLevel;
  if(mode==='disposition')return w?.omegaAtt??null;
  if(mode==='perfectness')return rivenPerfectness(r);
  const grade=rivenGrade(r,w);
  return grade==='Unknown'?null:({Perfect:10,Good:9,HasPotential:8,Bad:7} as const)[grade];
 };
 const direction=descending?-1:1;
 if(mode==='name')return direction*(a.weaponName??a.name).localeCompare(b.weaponName??b.name);
 const av=value(a),bv=value(b);
 // Imported legacy cards without roll metadata remain unknown, at the end in either direction.
 if(av===null||bv===null)return av===bv?0:av===null?1:-1;
 return direction*(av-bv);
}

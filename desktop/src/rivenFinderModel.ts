import type {Wanted} from './rivenModel.ts';
export type FinderSlot={attribute:string;positive:boolean;required:boolean};
export function finderSlots(wanted:Wanted):FinderSlot[]{
 const seen=new Set<string>();const positives=[...wanted.required.map(attribute=>({attribute,positive:true,required:true})),...wanted.optional.map(attribute=>({attribute,positive:true,required:false}))].filter(s=>!seen.has(s.attribute)&&!!seen.add(s.attribute)).slice(0,3);
 while(positives.length<3)positives.push({attribute:'',positive:true,required:false});
 return [...positives,{attribute:seen.has(wanted.negative)?'':wanted.negative,positive:false,required:!!wanted.negative&&!wanted.negativeOptional}];
}
export function wantedFromFinderSlots(wanted:Wanted,slots:readonly FinderSlot[]):Wanted{
 const seen=new Set<string>();
 for(const slot of slots)if(slot.attribute){if(seen.has(slot.attribute))throw Error('Duplicate Riven attribute');seen.add(slot.attribute);}
 const negative=slots.find(s=>!s.positive);
 return {...wanted,required:slots.filter(s=>s.positive&&s.required&&s.attribute).map(s=>s.attribute),optional:slots.filter(s=>s.positive&&!s.required&&s.attribute).map(s=>s.attribute),negative:negative?.attribute??'',negativeOptional:!!negative?.attribute&&!negative.required};
}
export function wantedSlotIdentity(wanted:Wanted){return JSON.stringify([wanted.required,wanted.optional,wanted.negative,!!wanted.negativeOptional]);}

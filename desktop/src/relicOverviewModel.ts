import type {Relic} from './relicModel.ts';
export const refinementOrder=['Intact','Exceptional','Flawless','Radiant'];
export function relicRewardTiers(active:Relic,variants:Relic[]){
 // Radiant silver rewards (20%) exceed bronze rewards (16.67%): do not rank
 // rarity from the currently selected refinement's probability.
 const intact=variants.find(r=>r.base===active.base&&r.refinement==='Intact');
 const chances=new Map(intact?.rewards.map(r=>[r.id,r.chance])??[]);
 return active.rewards.map(r=>{const chance=chances.get(r.id);return {...r,tier:chance==null?-1:chance>=20?0:chance>=10?1:2};}).sort((a,b)=>a.tier-b.tier);
}
export function relicDucatValues(relic:Relic){return Object.fromEntries(relic.rewards.map(r=>[r.id,r.ducats??(r.id==='/Lotus/Types/Recipes/Components/FormaBlueprint'?0:null)]));}

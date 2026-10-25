import {pinyin} from 'pinyin-pro';
const normalize=(s:string)=>s.normalize('NFKC').toLowerCase().replace(/ü/g,'v').normalize('NFD').replace(/\p{M}/gu,'').replace(/[^\p{L}\p{N}]/gu,'');
const cache=new Map<string,{plain:string;units:string[][]}[]>(),readings=new Map<string,string[]>();
function index(fields:readonly string[]){
 const key=JSON.stringify(fields);const found=cache.get(key);if(found)return found;
 const value=fields.filter(Boolean).map(text=>{const plain=normalize(text);return {plain,units:[...plain].map(c=>{
  if(!/\p{Script=Han}/u.test(c))return [c];
  let values=readings.get(c);if(!values){values=[...new Set([c,...pinyin(c,{toneType:'none',type:'array',multiple:true,v:true})].map(normalize))];readings.set(c,values);}return values;
 })};});
 if(cache.size>=20000)cache.delete(cache.keys().next().value!);cache.set(key,value);return value;
}
// Contiguous syllables, each accepting Chinese, full pinyin, or its initial.
// A partial last syllable supports typing ahead, without arbitrary fuzzy gaps.
function phonetic(units:string[][],term:string){
 for(let start=0;start<units.length;start++){
  let positions=new Set([0]);
  for(let at=start;at<units.length&&positions.size;at++){
   const next=new Set<number>();
   for(const pos of positions)for(const spelling of units[at]){
    const rest=term.slice(pos);if(spelling.startsWith(rest))return true;
    for(const candidate of spelling.length>1?[spelling,spelling[0]]:[spelling])if(rest.startsWith(candidate)){const end=pos+candidate.length;if(end===term.length)return true;next.add(end);}
   }
   positions=next;
  }
 }
 return false;
}
export function searchText(query:string,...fields:string[]):boolean{
 if(!query.trim())return true;
 const alternatives=query.split('|').map(s=>s.trim()).filter(Boolean);if(!alternatives.length)return true;
 const data=index(fields);
 return alternatives.some(part=>part.split(/\s+/u).map(normalize).filter(Boolean).every(term=>data.some(entry=>entry.plain.includes(term)||phonetic(entry.units,term))));
}

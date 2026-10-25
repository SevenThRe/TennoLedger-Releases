/** Observed OCR only. Unknown metadata stays null; no inventory or quality inference. */
export type CaptureBounds = [number, number, number, number];
export type CaptureBlock = {text:string;x:number;y:number;w:number;h:number;confidence:number};
export type CaptureAttribute = {slug:string;name:string;nameZh:string|null;value:number;signedValue:number;printedSign:'+'|'-'|'×';unit:'%'|'x'|'m'|'s'|'';rawText:string;confidence:number};
export type CapturedRiven = {
  side:'left'|'right'|'single';weaponId:string;weaponName:string;weaponNameZh:string|null;rivenName:string|null;
  attributes:CaptureAttribute[];masteryLevel:number|null;rank:number|null;rerolls:number|null;
  bounds:CaptureBounds;confidence:number;warnings:string[];rawBlocks:CaptureBlock[];
};
export type RivenCapture = {schemaVersion:1;type:'riven-capture';mode:'single'|'comparison'|'unknown';comparisonEvidence:'explicit-hint'|'ui-anchors'|null;evidence:'ocr'|'synthetic-ocr';frameSize:[number,number];cards:CapturedRiven[];warnings:string[]};
type Obj = Record<string,unknown>;
const object = (v:unknown):v is Obj => !!v && typeof v==='object' && !Array.isArray(v);
const number = (v:unknown):v is number => typeof v==='number' && Number.isFinite(v);
const privateText = /https?:\/\/|www\.|\b(session|token|authorization|bearer|cookie|password|accountid|whisper|wts|wtb)\b|[\w.+-]+@[\w.-]+/i;
const text = (v:unknown):v is string => typeof v==='string' && v.length>0 && v.length<=180 && !/[\x00-\x1f]/.test(v) && !privateText.test(v);
const nullableText = (v:unknown):v is string|null => v===null || text(v);
const confidence = (v:unknown):v is number => number(v) && v>=.85 && v<=1;
const codes = (v:unknown):v is string[] => Array.isArray(v) && v.length<=64 && v.every(s=>typeof s==='string' && /^[a-zA-Z][a-zA-Z0-9-]{0,79}$/.test(s));
const nullableInt = (v:unknown,max:number):v is number|null => v===null || number(v)&&Number.isInteger(v)&&v>=0&&v<=max;
function bounds(v:unknown,w:number,h:number):v is CaptureBounds {
  return Array.isArray(v)&&v.length===4&&v.every(number)&&v[0]>=0&&v[1]>=0&&v[2]>0&&v[3]>0&&v[0]+v[2]<=w&&v[1]+v[3]<=h;
}
function attribute(v:unknown):CaptureAttribute|null {
  if (!object(v)||typeof v.slug!=='string'||!/^[a-z0-9_/-]{1,80}$/.test(v.slug)||!text(v.name)||!nullableText(v.nameZh)||!text(v.rawText)||!confidence(v.confidence)||!number(v.value)||v.value<0||!number(v.signedValue)||Math.abs(v.signedValue)!==v.value||!['+','-','×'].includes(String(v.printedSign))||!['%','x','m','s',''].includes(String(v.unit))) return null;
  if (v.printedSign==='-' ? v.signedValue>0 : v.signedValue<0) return null;
  if ((v.printedSign==='×') !== (v.unit==='x')) return null;
  return {slug:v.slug,name:v.name,nameZh:v.nameZh,value:v.value,signedValue:v.signedValue,printedSign:v.printedSign as CaptureAttribute['printedSign'],unit:v.unit as CaptureAttribute['unit'],rawText:v.rawText,confidence:v.confidence};
}
function card(v:unknown,w:number,h:number):CapturedRiven|null {
  if (!object(v)||!['left','right','single'].includes(String(v.side))||!text(v.weaponId)||!v.weaponId.startsWith('/Lotus/')||!text(v.weaponName)||!nullableText(v.weaponNameZh)||!nullableText(v.rivenName)||!nullableInt(v.masteryLevel,100)||!nullableInt(v.rank,8)||!nullableInt(v.rerolls,1000000)||!confidence(v.confidence)||!bounds(v.bounds,w,h)||v.bounds[2]>w*.48||v.bounds[3]>h*.72||!codes(v.warnings)||!Array.isArray(v.attributes)||v.attributes.length<2||v.attributes.length>4||!Array.isArray(v.rawBlocks)||v.rawBlocks.length<1||v.rawBlocks.length>32) return null;
  const attributes=v.attributes.map(attribute);
  if (attributes.some(a=>!a)||new Set(attributes.map(a=>a?.slug)).size!==attributes.length) return null;
  const rawBlocks:CaptureBlock[]=[];
  for (const b of v.rawBlocks) {
    if (!object(b)||!text(b.text)||!number(b.confidence)||b.confidence<.7||b.confidence>1||!bounds([b.x,b.y,b.w,b.h],w,h)) return null;
    const [x,y,bw,bh]=[b.x,b.y,b.w,b.h] as number[];
    if (x<v.bounds[0]||y<v.bounds[1]||x+bw>v.bounds[0]+v.bounds[2]||y+bh>v.bounds[1]+v.bounds[3]) return null;
    rawBlocks.push({text:b.text,x,y,w:bw,h:bh,confidence:b.confidence});
  }
  return {side:v.side as CapturedRiven['side'],weaponId:v.weaponId,weaponName:v.weaponName,weaponNameZh:v.weaponNameZh,rivenName:v.rivenName,masteryLevel:v.masteryLevel,rank:v.rank,rerolls:v.rerolls,bounds:[...v.bounds],confidence:v.confidence,warnings:[...v.warnings],attributes:attributes as CaptureAttribute[],rawBlocks};
}
/** Reject malformed envelopes; return a whitelist copy so extra/private fields cannot leak into UI. */
export function parseRivenCapture(v:unknown):RivenCapture|null {
  if (!object(v)||v.schemaVersion!==1||v.type!=='riven-capture'||!['single','comparison','unknown'].includes(String(v.mode))||!['ocr','synthetic-ocr'].includes(String(v.evidence))||!Array.isArray(v.frameSize)||v.frameSize.length!==2||!v.frameSize.every(n=>number(n)&&n>=100&&n<=16384)||!codes(v.warnings)||!Array.isArray(v.cards)) return null;
  const [w,h]=v.frameSize as [number,number];
  const cards=v.cards.map(c=>card(c,w,h));
  if (cards.some(c=>!c)) return null;
  if (v.mode==='comparison') {
    if (cards.length!==2||!['explicit-hint','ui-anchors'].includes(String(v.comparisonEvidence))) return null;
    const [left,right]=cards as CapturedRiven[];
    if(left.side!=='left'||right.side!=='right'||left.weaponId!==right.weaponId||left.bounds[0]+left.bounds[2]>right.bounds[0]||right.bounds[0]-left.bounds[0]<w*.12) return null;
  } else if(cards.length!==1||cards[0]?.side!=='single'||v.comparisonEvidence!==null) return null;
  return {schemaVersion:1,type:'riven-capture',mode:v.mode as RivenCapture['mode'],evidence:v.evidence as RivenCapture['evidence'],comparisonEvidence:v.comparisonEvidence as RivenCapture['comparisonEvidence'],frameSize:[w,h],cards:cards as CapturedRiven[],warnings:[...v.warnings]};
}
export function capturedWeaponName(card:CapturedRiven,language:string):string {
  return language.startsWith('zh') ? card.weaponNameZh||card.weaponName : card.weaponName;
}
/** Raw deltas only at explicitly equal ranks. This does not label a roll good/bad. */
export function captureComparisonRows(capture:RivenCapture) {
  if(capture.mode!=='comparison') return [];
  const [left,right]=capture.cards;
  return [...new Set([...left.attributes,...right.attributes].map(a=>a.slug))].map(slug=>{
    const before=left.attributes.find(a=>a.slug===slug)??null,after=right.attributes.find(a=>a.slug===slug)??null;
    return {slug,before,after,delta:before&&after&&before.unit===after.unit&&left.rank!==null&&left.rank===right.rank ? after.signedValue-before.signedValue : null};
  });
}

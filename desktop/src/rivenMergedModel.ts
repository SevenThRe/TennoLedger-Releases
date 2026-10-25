import type {Wanted} from './rivenModel.ts';
import type {RivenSource} from './rivenSourcesModel.ts';
// Explicit semantic contract checked against local rivensV2.rivenStats.
// Do not infer these tags from display names or WFM prefix/suffix pairs.
export const alecaRivenTags:Record<string,string>={ammo_maximum:'WeaponAmmoMaxMod','base_damage_/_melee_damage':'',cold_damage:'WeaponFreezeDamageMod',critical_chance:'WeaponCritChanceMod',critical_damage:'WeaponCritDamageMod',electric_damage:'WeaponElectricityDamageMod','fire_rate_/_attack_speed':'WeaponFireRateMod',heat_damage:'WeaponFireDamageMod',impact_damage:'WeaponImpactDamageMod',magazine_capacity:'WeaponClipMaxMod',multishot:'WeaponFireIterationsMod',projectile_speed:'WeaponProjectileSpeedMod',punch_through:'WeaponPunctureDepthMod',puncture_damage:'WeaponArmorPiercingDamageMod',range:'WeaponMeleeRangeIncMod',recoil:'WeaponRecoilReductionMod',reload_speed:'WeaponReloadSpeedMod',slash_damage:'WeaponSlashDamageMod',status_chance:'WeaponStunChanceMod',status_duration:'WeaponProcTimeMod',toxin_damage:'WeaponToxinDamageMod',zoom:'WeaponZoomFovMod',combo_duration:'ComboDurationMod',critical_chance_on_slide_attack:'SlideAttackCritChanceMod',finisher_damage:'WeaponMeleeFinisherDamageMod'};
export function alecaRivenTag(slug:string,melee:boolean){
 if(slug==='base_damage_/_melee_damage')return melee?'WeaponMeleeDamageMod':'WeaponDamageAmountMod';
 const factions:Record<string,string>={damage_vs_corpus:'Corpus',damage_vs_grineer:'Grineer',damage_vs_infested:'Infested'},faction=Object.hasOwn(factions,slug)?factions[slug]:undefined;
 return faction?(melee?'WeaponMeleeFactionDamage':'WeaponFactionDamage')+faction:Object.hasOwn(alecaRivenTags,slug)?alecaRivenTags[slug]||null:null;
}
export function mergedRivenRequest(wanted:Wanted,melee:boolean,platform:string){
 if(platform!=='pc')throw Error('原版合并接口没有平台参数，仅按PC来源展示；当前平台可使用直连来源');
 if(!/^[a-z0-9_]{1,100}$/.test(wanted.weaponSlug))throw Error('武器市场标识待核实');
 if(wanted.maxMastery!==null)throw Error('合并来源不提供MR字段，无法证实当前最高MR筛选；可使用直连来源');
 const attrs:{name:string;positive:boolean;required:boolean}[]=[],seen=new Set<string>();
 for(const [slugs,positive,required]of [[wanted.required,true,true],[wanted.optional,true,false],[wanted.negative?[wanted.negative]:[],false,!wanted.negativeOptional]] as const){for(const slug of slugs){const name=alecaRivenTag(slug,melee);if(!name)throw Error('原版词条标识待核实：'+slug);if(seen.has(name))throw Error('词条条件重复或正负冲突');seen.add(name);attrs.push({name,positive,required});}}
 if(attrs.length>4)throw Error('最多选择4个词条');
 for(const n of [wanted.minPrice,wanted.maxPrice,wanted.minRerolls,wanted.maxRerolls])if(n!=null&&(!Number.isSafeInteger(n)||n<0||n>10000000))throw Error('价格或洗练范围无效');
 const minSimilarity=wanted.minSimilarity??0;if(!Number.isSafeInteger(minSimilarity)||minSimilarity<0||minSimilarity>100)throw Error('匹配度范围无效');if((wanted.minPrice??0)>(wanted.maxPrice??10000000)||(wanted.minRerolls??0)>(wanted.maxRerolls??10000000))throw Error('最小值不能高于最大值');return {weaponSlug:wanted.weaponSlug,attrs,filters:{minPrice:wanted.minPrice??0,maxPrice:wanted.maxPrice??10000000,minSimilarity,minRerolls:wanted.minRerolls??0,maxRerolls:wanted.maxRerolls??10000000,negativeRequired:wanted.negativeRequired??(!!wanted.negative&&!wanted.negativeOptional)}};
}
export type MergedRiven={id:string;source:2|4;price:number;link:string;time:number;similarity:number;attributes:{tag:string;value:number|null;positive:boolean;matches:boolean}[]};
export function parseMergedRivens(value:unknown):MergedRiven[]{
 if(!Array.isArray(value)||value.length>1000)throw Error('原版合并来源数据结构变化');
 const rows:MergedRiven[]=[],seen=new Set<string>();
 for(const raw of value){if(!raw||typeof raw!=='object')continue;const r=raw as Record<string,unknown>;
  if(typeof r.id!=='string'||r.id.length>100||!r.id||r.source!==2&&r.source!==4||typeof r.price!=='number'||!Number.isSafeInteger(r.price)||r.price<=0||typeof r.percentEqual!=='number'||!Number.isFinite(r.percentEqual)||r.percentEqual<0||r.percentEqual>1||typeof r.ts!=='string'||!Number.isFinite(Date.parse(r.ts))||typeof r.link!=='string'||!Array.isArray(r.attrs)||!r.attrs.length||r.attrs.length>4)continue;
  let link:URL;try{link=new URL(r.link);if(link.protocol!=='https:'||link.username||link.password||link.port||link.hostname!==(r.source===2?'warframe.market':'riven.market')||!(r.source===2?link.pathname.startsWith('/auction/'):link.pathname.startsWith('/profile/')||link.pathname.startsWith('/list/')))continue;}catch{continue;}
  const attributes:MergedRiven['attributes']=[];let valid=true;for(const a of r.attrs){if(!a||typeof a.name!=='string'||typeof a.positive!=='boolean'||typeof a.matches!=='boolean'){valid=false;break;}attributes.push({tag:a.name,value:typeof a.val==='number'&&Number.isFinite(a.val)?a.val:null,positive:a.positive,matches:a.matches});}if(!valid)continue;
  const key=r.source+':'+r.id;if(seen.has(key))continue;seen.add(key);rows.push({id:r.id,source:r.source as 2|4,price:r.price,link:link.href,time:Date.parse(r.ts),similarity:r.percentEqual,attributes});
 }
 if(value.length&&!rows.length)throw Error('合并来源字段不完整，未生成推测挂牌');
 return rows.sort((a,b)=>b.similarity-a.similarity||a.price-b.price);
}
export function mergedRivenRows(rows:readonly MergedRiven[],source:RivenSource,wanted?:Wanted){return rows.filter(r=>(source==='all'||source==='wfm'&&r.source===2||source==='riven-market'&&r.source===4)&&r.similarity*100>=(wanted?.minSimilarity??0)&&r.price>=(wanted?.minPrice??0)&&r.price<=(wanted?.maxPrice??10000000)&&(!wanted?.negativeRequired||r.attributes.some(a=>!a.positive))).slice(0,25);}

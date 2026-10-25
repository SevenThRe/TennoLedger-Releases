export type ModUpgradeTarget={id:string;currentRank:number;targetRank:number;maximumRank:number;rarityMultiplier:number;owned:boolean;known:boolean;paused?:boolean};
export type ModUpgradeStatus='paused'|'complete'|'unknown'|'not_owned'|'saving'|'ready';
export type ModUpgradeRow=ModUpgradeTarget&{status:ModUpgradeStatus;endo:number|null;credits:number|null;allocatedEndo:number|null;allocatedCredits:number|null;missingEndo:number|null;missingCredits:number|null};
const rank=(n:number)=>Number.isSafeInteger(n)&&n>=0&&n<=20;
const balance=(n:number|null|undefined)=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0?n:null;
export function modUpgradeCost(current:number,target:number,multiplier:number){
 if(!rank(current)||!rank(target)||!Number.isInteger(multiplier)||multiplier<1||multiplier>4)return null;
 const delta=Math.max(0,2**target-2**current);
 return {endo:10*delta*multiplier,credits:483*delta*multiplier};
}
/** Allocate in caller order, including acquisition goals. Unknown balances remain unknown. */
export function modUpgradePlan(targets:readonly ModUpgradeTarget[],budget:{endo:number|null;credits:number|null;reservedEndo?:number;reservedCredits?:number},inventoryKnown:boolean){
 const reserve=(n:number|undefined,limit:number)=>Number.isFinite(n)?Math.min(limit,Math.max(0,Math.trunc(n!))):0;
 const endo=balance(budget.endo),credits=balance(budget.credits);
 const availableEndo=endo===null?null:Math.max(0,endo-reserve(budget.reservedEndo,1e9));
 const availableCredits=credits===null?null:Math.max(0,credits-reserve(budget.reservedCredits,1e12));
 let leftEndo=availableEndo,leftCredits=availableCredits;
 const goals:ModUpgradeRow[]=[],seen=new Set<string>();
 let totalEndo=0,totalCredits=0,missingEndo:number|null=0,missingCredits:number|null=0;
 for(const target of targets){
  if(!target.id||seen.has(target.id))continue;seen.add(target.id);
  const known=inventoryKnown&&target.known&&rank(target.maximumRank)&&rank(target.currentRank)&&rank(target.targetRank)&&target.currentRank<=target.maximumRank&&target.targetRank<=target.maximumRank;
  const row:ModUpgradeRow={...target,known,status:'unknown',endo:0,credits:0,allocatedEndo:0,allocatedCredits:0,missingEndo:0,missingCredits:0};goals.push(row);
  if(target.paused){row.status='paused';continue;}
  if(known&&target.owned&&target.currentRank>=target.targetRank){row.status='complete';continue;}
  const cost=known?modUpgradeCost(target.currentRank,target.targetRank,target.rarityMultiplier):null;
  if(!cost){row.known=false;row.endo=row.credits=row.allocatedEndo=row.allocatedCredits=row.missingEndo=row.missingCredits=null;continue;}
  row.endo=cost.endo;row.credits=cost.credits;
  row.allocatedEndo=leftEndo===null?null:Math.min(leftEndo,cost.endo);
  row.allocatedCredits=leftCredits===null?null:Math.min(leftCredits,cost.credits);
  row.missingEndo=row.allocatedEndo===null?null:cost.endo-row.allocatedEndo;
  row.missingCredits=row.allocatedCredits===null?null:cost.credits-row.allocatedCredits;
  if(leftEndo!==null)leftEndo-=row.allocatedEndo!;
  if(leftCredits!==null)leftCredits-=row.allocatedCredits!;
  totalEndo+=cost.endo;totalCredits+=cost.credits;
  missingEndo=missingEndo===null||row.missingEndo===null?null:missingEndo+row.missingEndo;
  missingCredits=missingCredits===null||row.missingCredits===null?null:missingCredits+row.missingCredits;
  row.status=!target.owned?'not_owned':row.missingEndo===null||row.missingCredits===null?'unknown':row.missingEndo+row.missingCredits>0?'saving':'ready';
 }
 return {goals,availableEndo,availableCredits,totalEndo,totalCredits,missingEndo,missingCredits,incomplete:goals.some(row=>!row.paused&&(!row.known||row.missingEndo===null||row.missingCredits===null)),ready:goals.filter(r=>r.status==='ready').length,completed:goals.filter(r=>r.status==='complete').length,unknown:goals.filter(r=>r.status==='unknown').length,notOwned:goals.filter(r=>r.status==='not_owned').length};
}

/** Absent whole rank inventory is unknown; absent item in a known inventory is unowned. */
export function modRankOwnership(ranks:Record<string,Record<string,number>|null>|null|undefined,id:string,maximumRank:number){
 const unknown={known:false,owned:null,highestRank:null,maxed:null};
 if(ranks==null||!rank(maximumRank)||ranks[id]===null)return unknown;
 let owned=0,highestRank=0,maxed=0;
 for(const [key,count] of Object.entries(ranks[id]??{})){
  const level=Number(key);
  if(!/^(0|[1-9]\d*)$/.test(key)||!rank(level)||level>maximumRank||!Number.isSafeInteger(count)||count<0)return unknown;
  if(!count)continue;
  owned+=count;if(!Number.isSafeInteger(owned))return unknown;
  highestRank=Math.max(highestRank,level);if(level===maximumRank)maxed+=count;
 }
 return {known:true,owned,highestRank,maxed};
}

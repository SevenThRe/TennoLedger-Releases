import type {FinishCandidate,FinishMatch} from './tradeFinishModel.ts';
export type AutoTradePhase='idle'|'counting'|'paused'|'cancelled'|'executing'|'done';
export type AutoTradeView={phase:AutoTradePhase;seconds:number};
type Clock={now:()=>number;set:(callback:()=>void,ms:number)=>unknown;clear:(timer:unknown)=>void};
type AutoIO={clock:Clock;eligible:()=>boolean;execute:(current:()=>boolean)=>Promise<void>;update:(view:AutoTradeView)=>void};
export function autoTradeIdentity(input:{ready:boolean;scope:string;profileName:string|null|undefined;marketName:string|null|undefined;verified:boolean;accountId:string;platform:string;sessionPlatform:string|undefined}){return input.ready&&input.scope!=='legacy-unassigned'&&!!input.scope&&!!input.profileName?.trim()&&!!input.marketName?.trim()&&input.profileName.trim().toLowerCase()===input.marketName.trim().toLowerCase()&&input.verified&&!!input.accountId&&!!input.sessionPlatform&&input.platform===input.sessionPlatform;}
export function autoTradeExact(candidate:FinishCandidate|null,match:FinishMatch|null){
 if(!candidate||candidate.identitiesComplete!==true||candidate.side==='exchange'||!match||match.status!=='matched'||!match.matches.length)return false;
 return match.matches.every(({market,order})=>{const ranked=market.maxRank!=null||market.tags?.some(tag=>tag==='mod'||tag.startsWith('arcane'));return !ranked||Number.isSafeInteger(market.maxRank)&&market.maxRank!>=0&&Number.isSafeInteger(order.rank)&&candidate.items.filter(i=>i.itemId===market.gameRef).length>0&&candidate.items.filter(i=>i.itemId===market.gameRef).every(i=>Number.isSafeInteger(i.rank)&&i.rank!>=0&&i.rank!<=market.maxRank!&&i.rank===order.rank);});
}
export function autoOverlayMatches(value:unknown,eventId:string,scope:string){const v=value as any;return !!v&&v.active===true&&v.visible===true&&v.preview===false&&v.kind==='trade-finished'&&v.preferences?.enabled===true&&v.preferences?.tradeFinished===true&&v.payload?.complete===true&&v.payload?.id===eventId&&v.payload?.accountScope===scope;}
export function autoCandidateFingerprint(c:FinishCandidate){return JSON.stringify([c.id,c.accountScope,c.occurredAt,c.side,c.partner,c.platinum,c.identitiesComplete??null,c.items.map(i=>[i.itemId,i.quantity,i.rank??null,i.subtype??null,i.charges??null,i.amberStars??null,i.cyanStars??null]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))]);}
/** One-shot countdown. Activity pauses; invalid identity/visibility or cancellation is terminal. */
export class TradeAutoCountdown{
 private phase:AutoTradePhase='idle';private timer:unknown=null;private left=8000;private deadline=0;
 private io:AutoIO;
 constructor(io:AutoIO){this.io=io;}
 private emit(){this.io.update({phase:this.phase,seconds:Math.max(0,Math.ceil((this.phase==='counting'?this.deadline-this.io.clock.now():this.left)/1000))});}
 private clear(){if(this.timer!==null){this.io.clock.clear(this.timer);this.timer=null;}}
 start(){if(this.phase!=='idle')return;if(!this.io.eligible()){this.cancel();return;}this.arm();}
 private arm(){this.phase='counting';this.deadline=this.io.clock.now()+this.left;this.emit();this.schedule();}
 private schedule(){this.timer=this.io.clock.set(()=>{this.timer=null;void this.tick();},Math.min(1000,Math.max(0,this.deadline-this.io.clock.now())));}
 private async tick(){if(this.phase!=='counting')return;if(!this.io.eligible()){this.cancel();return;}this.left=Math.max(0,this.deadline-this.io.clock.now());if(this.left>0){this.emit();this.schedule();return;}this.phase='executing';this.emit();const current=()=>this.phase==='executing'&&this.io.eligible();try{if(current())await this.io.execute(current);}catch{if(this.phase==='executing')this.phase='cancelled';this.emit();}finally{if(this.phase==='executing'){this.phase='done';this.emit();}}}
 pause(){if(this.phase==='executing'){this.cancel();return;}if(this.phase!=='counting')return;this.left=Math.max(0,this.deadline-this.io.clock.now());this.clear();this.phase='paused';this.emit();}
 resume(){if(this.phase!=='paused')return;if(!this.io.eligible()){this.cancel();return;}this.arm();}
 cancel(){this.clear();if(this.phase==='done'||this.phase==='cancelled')return;this.phase='cancelled';this.emit();}
}

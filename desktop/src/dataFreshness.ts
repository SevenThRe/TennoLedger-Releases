export function freshAccount(status:{enabled:boolean;accountCode:string;scanCode:string;lastReadAt:string|null},now:number,renderedAt=now){
 // A collector event can arrive between timer ticks. Compare it with this render's
 // clock, not only the previous tick, without accepting genuinely future dates.
 const age=Math.max(now,renderedAt)-Date.parse(status.lastReadAt??'');
 return status.enabled&&status.accountCode==='synced'&&['synced','helper-current','helper-fetching'].includes(status.scanCode)&&Number.isFinite(age)&&age>=0&&age<=180000;
}

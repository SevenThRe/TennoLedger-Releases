export type CompletionStatus='inflight'|'accepted'|'uncertain'|null;
export function parseCompletionStatus(value:unknown):CompletionStatus{if(value===null||value==='inflight'||value==='accepted'||value==='uncertain')return value;throw Error('成交回执格式变化');}
/** A receipt proves an operation, not that every item in the game trade was handled. */
export function completionReceiptState(rows:readonly CompletionStatus[]):'partial'|'review'|'none'{
 if(rows.some(r=>r==='inflight'||r==='uncertain'))return 'review';
 return rows.some(r=>r==='accepted')?'partial':'none';
}

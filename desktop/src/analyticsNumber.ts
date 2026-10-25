// Mirrors the shipped proAnalytics.js toSI thresholds and precision. Unknown
// remains distinct from a known zero; full values are available on hover.
export function analyticsNumber(value:number|null|undefined):string{
 if(value==null||!Number.isFinite(value))return '—';
 if(value>1_000_000)return (value/1_000_000).toFixed(2)+'M';
 if(value>1_000)return (value/1_000).toFixed(1)+'K';
 return value===0?'-':String(value);
}
export function analyticsNumberTitle(value:number|null|undefined,locale:string):string{
 return value==null||!Number.isFinite(value)?(locale.startsWith('zh')?'未知':'Unknown'):value.toLocaleString(locale);
}

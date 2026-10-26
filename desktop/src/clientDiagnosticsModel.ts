/** Classify without forwarding exception messages, URLs, stacks or user values. */
export function diagnosticFault(value:unknown):string{
 const name=value instanceof Error?value.name:'';
 const message=typeof value==='string'?value:value instanceof Error?value.message:'';
 if(name==='TypeError'||/Cannot read properties of (null|undefined)/.test(message))return 'type_error';
 if(name==='ReferenceError')return 'reference_error';
 if(name==='SyntaxError')return 'syntax_error';
 if(/Failed to fetch|NetworkError|Load failed/.test(message))return 'network_error';
 return 'other';
}

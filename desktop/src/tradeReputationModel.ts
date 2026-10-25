export function reputationRequest(partner:string,text:string){
 const key=partner.trim().toLowerCase();if(!/^[a-z0-9_.-]{1,64}$/.test(key)||key==='.'||key==='..')throw Error('交易对象的市场标识待核实');
 if([...text].length>500||text.includes('\0'))throw Error('评价内容不能超过 500 字');
 return {key,body:{review_type:1,text},receiptOrderId:'review:'+key};
}

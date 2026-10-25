/** Check both sides of a request; changing accounts does not cancel an accepted write. */
export async function inMarketContext<T>(current:()=>boolean,request:()=>Promise<T>):Promise<T>{
 const check=()=>{if(!current())throw Error('市场账号已切换，请重新操作');};
 check();
 try{const result=await request();check();return result;}
 catch(error){check();throw error;}
}

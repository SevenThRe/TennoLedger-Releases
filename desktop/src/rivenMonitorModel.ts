import {evaluate,fromAuction,type Auction,type Wanted} from './rivenModel.ts';
export type MonitorConfig={id:string;name:string;wanted:Wanted;enabled:boolean;intervalSeconds:number;createdAt:string;notifySystem?:boolean};
export type MonitorReceipt={id:string;configId:string;configName:string;listingId:string;weaponSlug:string;price:number|null;at:string;read:boolean;link:string;deliveryStatus?:'disabled'|'pending'|'accepted'|'failed';deliveryError?:string};
export type MonitorState={seen:string[];initialised:boolean;lastChecked:string|null;nextCheck:number;error:string};
export type MonitorData={configs:MonitorConfig[];receipts:MonitorReceipt[];states:Record<string,MonitorState>};
type Storage={getItem:(key:string)=>string|null;setItem:(key:string,value:string)=>void};
export function rivenMonitorScope(name:string|null|undefined,platform:string|undefined):string|null{
 return name?.trim()&&['pc','ps4','xbox','switch'].includes(platform??'')?JSON.stringify([platform,name.trim().toLowerCase()]):null;
}
export function validMonitorWanted(value:unknown):value is Wanted{
 if(!value||typeof value!=='object')return false;const w=value as Wanted;
 const attr=(v:unknown)=>typeof v==='string'&&v.length<=100&&/^[a-z0-9_ /.-]*$/.test(v);
 if([w.minPrice,w.minRerolls,w.minSimilarity].some(n=>n!=null&&(typeof n!=='number'||!Number.isSafeInteger(n)||n<0||n>10000000))||(w.minSimilarity??0)>100)return false;if([w.negativeRequired,w.negativeOptional].some(v=>v!==undefined&&typeof v!=='boolean'))return false;
 if((w.minPrice??0)>(w.maxPrice??10000000)||(w.minRerolls??0)>(w.maxRerolls??10000000))return false;
 return typeof w.weaponSlug==='string'&&/^[a-z0-9_]{1,100}$/.test(w.weaponSlug)&&Array.isArray(w.required)&&w.required.length<=4&&w.required.every(attr)&&Array.isArray(w.optional)&&w.optional.length<=4&&w.optional.every(attr)&&attr(w.negative)&&[w.maxPrice,w.maxRerolls,w.maxMastery].every(n=>n===null||typeof n==='number'&&Number.isSafeInteger(n)&&n>=0&&n<=10000000);
}
const empty=():MonitorData=>({configs:[],receipts:[],states:{}});
const initial=():MonitorState=>({seen:[],initialised:false,lastChecked:null,nextCheck:0,error:''});
function validAuction(a:Auction){return a&&typeof a.id==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(a.id)&&a.item?.type==='riven'&&typeof a.closed==='boolean'&&typeof a.visible==='boolean'&&(a.buyout_price===null||typeof a.buyout_price==='number'&&Number.isFinite(a.buyout_price)&&a.buyout_price>0)&&Number.isInteger(a.item.mod_rank)&&a.item.mod_rank>=0&&a.item.mod_rank<=8&&Number.isInteger(a.item.mastery_level)&&a.item.mastery_level>=0&&Number.isInteger(a.item.re_rolls)&&a.item.re_rolls>=0&&Array.isArray(a.item.attributes)&&a.item.attributes.length>0&&a.item.attributes.every(x=>typeof x.url_name==='string'&&typeof x.positive==='boolean'&&Number.isFinite(x.value));}
function validConfig(c:MonitorConfig){return c&&typeof c.id==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(c.id)&&typeof c.name==='string'&&c.name.trim().length>0&&c.name.length<=80&&typeof c.enabled==='boolean'&&(c.notifySystem===undefined||typeof c.notifySystem==='boolean')&&Number.isInteger(c.intervalSeconds)&&c.intervalSeconds>=60&&c.intervalSeconds<=86400&&validMonitorWanted(c.wanted)&&Number.isFinite(Date.parse(c.createdAt));}
export function parseMonitorData(input:string|null):MonitorData{
 if(!input)return empty();if(input.length>2*1024*1024)throw Error('监控配置文件过大');
 const value=JSON.parse(input) as MonitorData;
 if(!value||!Array.isArray(value.configs)||value.configs.length>20||!value.configs.every(validConfig)||new Set(value.configs.map(c=>c.id)).size!==value.configs.length||!Array.isArray(value.receipts)||value.receipts.length>200||!value.states||typeof value.states!=='object')throw Error('监控配置格式无效；原始配置保留');
 const data=empty();data.configs=value.configs;
 for(const c of data.configs){const s=value.states[c.id];if(s&&Array.isArray(s.seen)&&s.seen.length<=2000&&s.seen.every(x=>typeof x==='string'&&x.length<=180)&&typeof s.initialised==='boolean'&&Number.isFinite(s.nextCheck)&&(s.lastChecked===null||Number.isFinite(Date.parse(s.lastChecked)))&&typeof s.error==='string')data.states[c.id]=s;}
 data.receipts=value.receipts.filter(r=>r&&typeof r.id==='string'&&typeof r.configId==='string'&&typeof r.configName==='string'&&typeof r.listingId==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(r.listingId)&&r.link===`https://warframe.market/auction/${r.listingId}`&&typeof r.weaponSlug==='string'&&(r.price===null||Number.isFinite(r.price)&&r.price>0)&&Number.isFinite(Date.parse(r.at))&&typeof r.read==='boolean');
 return data;
}
export class RivenMonitorEngine{
 private scope:string|null=null;private data:MonitorData=empty();private generation=0;private running=false;private loadError='';
 private storage:Storage;private fetch:(weapon:string,platform:string)=>Promise<Auction[]>;private changed:()=>void;private now:()=>number;
 private delivery:((receipt:MonitorReceipt)=>Promise<{deliveryError?:string|null}>)|null=null;private deliveryGeneration=0;
 constructor(storage:Storage,fetch:(weapon:string,platform:string)=>Promise<Auction[]>,changed:()=>void,now=Date.now){this.storage=storage;this.fetch=fetch;this.changed=changed;this.now=now;}
 getSnapshot(){return {scope:this.scope,data:this.data,running:this.running,error:this.loadError};}
 setDelivery(delivery:((receipt:MonitorReceipt)=>Promise<{deliveryError?:string|null}>)|null){this.delivery=delivery;this.deliveryGeneration++;}
 setScope(scope:string|null){if(scope===this.scope)return;this.scope=scope;this.generation++;this.data=empty();this.loadError='';try{if(scope)this.data=parseMonitorData(this.storage.getItem('myframe.riven.monitor.v1:'+scope));}catch(e){this.loadError=String(e);}this.changed();}
 private persist(){if(!this.scope)throw Error('请先登录市场账号');if(this.loadError)throw Error(this.loadError);this.storage.setItem('myframe.riven.monitor.v1:'+this.scope,JSON.stringify(this.data));this.changed();}
 save(config:MonitorConfig){if(!validConfig(config))throw Error('名称、筛选或轮询间隔无效');if(!this.data.configs.some(c=>c.id===config.id)&&this.data.configs.length>=20)throw Error('最多保存20个查询');const old=this.data;const exists=this.data.configs.find(c=>c.id===config.id);this.data={...this.data,configs:[...this.data.configs.filter(c=>c.id!==config.id),structuredClone(config)],states:{...this.data.states}};if(exists&&JSON.stringify(exists.wanted)!==JSON.stringify(config.wanted))delete this.data.states[config.id];try{this.persist();}catch(e){this.data=old;throw e;}}
 toggle(id:string){const c=this.data.configs.find(c=>c.id===id);if(!c)return;this.save({...c,enabled:!c.enabled});}
 remove(id:string){const old=this.data;const states={...this.data.states};delete states[id];this.data={...this.data,configs:this.data.configs.filter(c=>c.id!==id),states};try{this.persist();}catch(e){this.data=old;throw e;}}
 markRead(id:string){const old=this.data;this.data={...this.data,receipts:this.data.receipts.map(r=>r.id===id?{...r,read:true}:r)};try{this.persist();}catch(e){this.data=old;throw e;}}
 async tick(){
  if(this.running||!this.scope||this.loadError)return;const scope=this.scope,generation=this.generation,deliveryGeneration=this.deliveryGeneration;const platform=JSON.parse(scope)[0] as string;
  this.running=true;this.changed();const books=new Map<string,Auction[]>();
  try{for(const config of [...this.data.configs]){
   if(generation!==this.generation)break;const current=this.data.configs.find(c=>c.id===config.id);const state=this.data.states[config.id]??initial();
   if(!current?.enabled||state.nextCheck>this.now())continue;
   try{
    let rows=books.get(config.wanted.weaponSlug);if(!rows){rows=await this.fetch(config.wanted.weaponSlug,platform);if(!Array.isArray(rows))throw Error('挂牌来源格式变化');books.set(config.wanted.weaponSlug,rows);}
    if(rows.length&&!rows.some(validAuction))throw Error('挂牌字段不完整，未建立推测基线');
    if(generation!==this.generation)break;const latest=this.data.configs.find(c=>c.id===config.id);if(!latest?.enabled||JSON.stringify(latest.wanted)!==JSON.stringify(config.wanted))continue;
    const seen=new Set(state.seen),receipts:MonitorReceipt[]=[];
    for(const auction of rows){
     if(!validAuction(auction)||auction.closed||!auction.visible)continue;
     const key=auction.id+':'+String(auction.buyout_price);if(seen.has(key))continue;seen.add(key);
     // The first successful sample establishes a baseline. Existing listings
     // are not retrospectively presented as newly listed alerts.
     if(!state.initialised||!evaluate(fromAuction(auction),config.wanted,auction.buyout_price).match)continue;
     receipts.push({id:config.id+':'+key,configId:config.id,configName:config.name,listingId:auction.id,weaponSlug:config.wanted.weaponSlug,price:auction.buyout_price,at:new Date(this.now()).toISOString(),read:false,link:`https://warframe.market/auction/${auction.id}`,deliveryStatus:config.notifySystem?'pending':'disabled'});
    }
    const previous=this.data;
    this.data={...this.data,receipts:[...receipts,...this.data.receipts].slice(0,200),states:{...this.data.states,[config.id]:{seen:[...seen].slice(-2000),initialised:true,lastChecked:new Date(this.now()).toISOString(),nextCheck:this.now()+config.intervalSeconds*1000,error:''}}};
    try{this.persist();}catch(error){this.data=previous;throw error;}
    if(config.notifySystem)for(const receipt of receipts){
     if(generation!==this.generation)break;
     const activeConfig=this.data.configs.find(c=>c.id===config.id),allowed=activeConfig?.enabled===true&&activeConfig.notifySystem===true;
     let deliveryError:string|undefined;
     try{if(deliveryGeneration!==this.deliveryGeneration||!this.delivery||!allowed)throw Error('账号作用域已变化或通知未就绪，未投递');const outcome=await this.delivery(receipt);deliveryError=outcome.deliveryError??undefined;}catch(error){deliveryError=String(error);}
     if(generation!==this.generation)break;
     this.data={...this.data,receipts:this.data.receipts.map(row=>row.id===receipt.id?{...row,deliveryStatus:deliveryError?'failed':'accepted',deliveryError}:row)};
     // Channel failures stay visible and never trigger automatic re-delivery.
     try{this.persist();}catch{}
    }
   }catch(error){if(generation!==this.generation)break;this.data={...this.data,states:{...this.data.states,[config.id]:{...state,error:String(error),nextCheck:this.now()+Math.max(60000,config.intervalSeconds*1000)}}};try{this.persist();}catch{} }
  }}finally{this.running=false;this.changed();}
 }
}


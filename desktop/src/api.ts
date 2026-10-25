import {invoke,isTauri} from '@tauri-apps/api/core';
export type Point={ts:string;[key:string]:string|number|null};
export type Trade={id:string;ts:string;itemId:string;name:string;side:'purchase'|'sale';quantity:number;platinum:number;partner:string;category:string};
export type ExchangeItem={itemId:string;quantity:number};
export type Exchange={id:string;ts:string;partner:string;kind:'sale'|'purchase'|'exchange';sent:ExchangeItem[];received:ExchangeItem[];referenceItem?:ExchangeItem};
export type Dataset={generalDataPoints:Point[];trades:Trade[];exchanges?:Exchange[]};
export type Analytics={revenue:number;expenses:number;netFlow:number;count:number;items:{itemId:string;name:string;bought:number;sold:number;spent:number;received:number}[]};
export const native=isTauri();
export const empty:Dataset={generalDataPoints:[],trades:[]};
export async function load():Promise<Dataset>{return native?invoke('load_data'):empty;}
export async function save(input:string,expectedScope?:string):Promise<Dataset>{if(!native)throw new Error('请在 MyFrame 桌面程序中导入数据 / Open the desktop app to import');return invoke('import_data',{input,expectedScope});}
export async function analyze():Promise<Analytics>{return native?invoke('analytics'):{revenue:0,expenses:0,netFlow:0,count:0,items:[]};}
export type Ledger={data:Dataset;stats:Analytics};
export const ledgerQA=import.meta.env.DEV&&!native&&new URLSearchParams(location.search).get('qa')==='ledger'||import.meta.env.DEV&&!native&&new URLSearchParams(location.search).get('qa')==='stats';
export async function loadLedger():Promise<Ledger>{
 if(ledgerQA){const response=await fetch(new URLSearchParams(location.search).get('qa')==='stats'?'/qa/stats-ledger.json':'/qa/ledger.json');if(!response.ok)throw Error('账目演示数据未加载');return response.json();}
 return native?invoke('load_ledger'):{data:empty,stats:{revenue:0,expenses:0,netFlow:0,count:0,items:[]}};
}

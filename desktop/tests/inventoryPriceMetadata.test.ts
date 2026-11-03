import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import * as jsx from 'react/jsx-runtime';
import vm from 'node:vm';
import ts from 'typescript';
import {readFileSync} from 'node:fs';
import {inventoryPriceMetadata,referencePriceTitle} from '../src/inventoryPriceMetadata.ts';
const id='/Lotus/Types/Recipes/Weapons/WeaponParts/SteflosPrimeBarrel';
const contexts:any={InventoryPriceContext:React.createContext({[id]:25}),InventoryPriceMetadataContext:React.createContext({}),InventoryDucatContext:React.createContext({}),InventoryTradeContext:React.createContext({}),InventorySaleSummary:()=>null};
const exports:any={};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/InventoryCard.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,{exports,require:(name:string)=>{
 if(name==='react')return React;if(name==='react/jsx-runtime')return jsx;if(name==='./InventorySale')return contexts;
 if(name==='./inventoryPriceMetadata')return {referencePriceTitle};if(name==='./inventoryMarketModel')return {inventoryDucatRatio:()=>null};
 if(name==='./Artwork')return {default:()=>null,__esModule:true};if(name==='./UpgradePrices')return {default:()=>React.createElement('span',null,'rank-specific'),__esModule:true};
 if(name.endsWith('.css'))return {};if(name==='./inventoryTrade')return {};throw Error(name);
}});
function render(meta:any,en:boolean,category='component',price:number|null=25){return renderToStaticMarkup(React.createElement(contexts.InventoryPriceContext.Provider,{value:{[id]:price}},React.createElement(contexts.InventoryPriceMetadataContext.Provider,{value:{[id]:meta}},React.createElement(exports.default,{item:{id,image:'',category},name:'Steflos Prime Barrel',count:1,en,onOpen:()=>{}}))));}
test('actual InventoryCard renders reference label and real row timestamp in both languages',()=>{
 const timestamp=new Date(Date.now()-60000).toISOString(),meta={algorithm:'median-online-sell-v1',priceFetchedAt:timestamp,error:''};
 for(const en of [false,true]){const html=render(meta,en);assert.ok(html.includes(en?'Reference each':'参考单价'));assert.ok(html.includes(timestamp));assert.ok(html.includes(en?'five distinct online sellers':'五名不同在线卖家'));assert.match(html,/>25 /);}
});
test('actual InventoryCard renders unknown time, empty price, stale/error and leaves upgraded pricing alone',()=>{
 for(const en of [false,true]){const unknown=render(undefined,en,'component',null);assert.ok(unknown.includes(en?'Collection time unknown':'采集时间未知'));assert.ok(unknown.includes('—'));
 const expired=render({algorithm:'median-online-sell-v1',priceFetchedAt:'2000-01-01T00:00:00Z',error:'IPC failure'},en,'component',null);assert.ok(expired.includes(en?'Expired':'已过期'));assert.ok(expired.includes(en?'Refresh failed':'刷新失败'));
 const upgraded=render(undefined,en,'mod');assert.ok(upgraded.includes('rank-specific'));assert.ok(!upgraded.includes(en?'Reference each':'参考单价'));}
});
test('metadata mapping preserves row timestamps and canonical identity without inventing snapshot time',()=>{
 const rows:any=[{slug:'steflos_prime_barrel',gameRef:id,algorithm:'median-online-sell-v1',priceFetchedAt:'2026-11-03T00:00:00Z'}];
 assert.equal(inventoryPriceMetadata([id],{},rows,'offline')[id].priceFetchedAt,rows[0].priceFetchedAt);
 assert.equal(inventoryPriceMetadata(['fallback'],{fallback:'steflos_prime_barrel'},rows,'').fallback.algorithm,'median-online-sell-v1');
 assert.equal(inventoryPriceMetadata(['missing'],{},rows,'').missing.priceFetchedAt,undefined);
});
for(const path of ['row','global','both','none'] as const)test(`mapped ${path} failure renders safely and preserves row time`,()=>{
 const timestamp=new Date(Date.now()-60000).toISOString();
 const rowError=path==='row'||path==='both'?'private-row-token=secret':'';
 const globalError=path==='global'||path==='both'?'private-ipc-token=secret':'';
 const rows:any=[{slug:'steflos_prime_barrel',gameRef:id,algorithm:'median-online-sell-v1',priceFetchedAt:timestamp,lastError:rowError}];
 const meta=inventoryPriceMetadata([id],{},rows,globalError)[id];
 assert.equal(meta.priceFetchedAt,timestamp);assert.equal(Boolean(meta.error),path!=='none');
 assert.ok(!JSON.stringify(meta).includes('secret'));
 for(const en of [false,true]){const html=render(meta,en);assert.ok(html.includes(timestamp));assert.equal(html.includes(en?'Refresh failed':'刷新失败'),path!=='none');assert.ok(!html.includes('secret'));}
});

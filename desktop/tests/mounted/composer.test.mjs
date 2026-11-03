import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
const require=createRequire(new URL('../../package.json',import.meta.url));const {build}=require('esbuild');
const built=await build({stdin:{contents:`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import C from './QuoteOrderComposer';function App(){const [target,setTarget]=useState(window.initialTarget);const [,update]=useState(0);window.changeTarget=setTarget;window.rerender=()=>update(x=>x+1);window.currentTarget=target;return <C key={target.slug} target={target} mode="sell" suggested={5} en={false} onPosted={()=>window.posted++} onVariant={patch=>{window.trace.push({type:'onVariant',patch});setTarget(v=>({...v,...patch}));}}/>}createRoot(document.getElementById('root')).render(<App/>);`,resolveDir:fileURLToPath(new URL('../../src/',import.meta.url)),loader:'tsx'},bundle:true,write:false,format:'iife',jsx:'automatic',plugins:[{name:'local-boundaries',setup(b){b.onResolve({filter:/^(\.\/MarketAccount|\.\/api|@tauri-apps\/api\/core)$/},a=>({path:a.path,namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},a=>({loader:'js',contents:a.path==='./api'?'export const native=true;':a.path==='./MarketAccount'?`export const useMarketSession=()=>window.session;export const sessionChanged=()=>{};`:`export const invoke=(...args)=>window.mockInvoke(...args);`}));}}]});
const tick=()=>new Promise(r=>setTimeout(r,40));
const catalog={data:[{id:'axi',slug:'axi_c12_relic',subtypes:['intact','exceptional','flawless','radiant'],bulkTradable:true}]};
async function mount({delay=false,create='ok'}={}){
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost',runScripts:'dangerously',pretendToBeVisual:true}),w=dom.window;
 w.trace=[];w.posted=0;w.session={connected:true,verified:true,accountId:'test',sessionGeneration:1,platform:'pc'};
 w.initialTarget={id:'axi',slug:'axi_c12_relic',name:'Axi C12',englishName:'Axi C12',subtype:'flawless'};
 const catalogs=[],creates=[];
 w.mockInvoke=(command,args)=>{w.trace.push({type:'invoke',command,args});if(args?.action==='items')return delay?new Promise(resolve=>catalogs.push({resolve,platform:args.platform})):Promise.resolve(catalog);if(args?.action==='create'){if(create==='uncertain')return Promise.reject(Error('network response lost'));if(create==='pending')return new Promise(resolve=>creates.push(resolve));return Promise.resolve({data:{id:'LOCAL-MOCK-ONLY'}});}throw Error('Unexpected mock command');};
 w.eval(built.outputFiles[0].text);await tick();await tick();
 const change=async patch=>{w.changeTarget({...w.currentTarget,...patch});await tick();};
 const edit=async(selector,value)=>{const el=w.document.querySelector(selector);Object.getOwnPropertyDescriptor(el.tagName==='SELECT'?w.HTMLSelectElement.prototype:w.HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new w.Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));await tick();};
 const submit=async()=>{w.document.querySelector('form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await tick();};
 return {dom,w,catalogs,creates,change,edit,submit};
}
for(const subtype of ['intact','radiant']){
 const h=await mount();await h.change({subtype});assert.equal(h.w.document.querySelector('select').value,subtype);await h.submit();assert.equal(h.w.trace.find(t=>t.args?.action==='create').args.body.subtype,subtype);h.dom.window.close();console.log('PASS same slug => '+subtype+' select/payload');
}
{
 const h=await mount({delay:true});await h.change({subtype:'intact'});h.catalogs[0].resolve(catalog);await tick();await tick();assert.equal(h.w.currentTarget.subtype,'intact');assert.equal(h.w.document.querySelector('select').value,'intact');await h.submit();assert.equal(h.w.trace.find(t=>t.args?.action==='create').args.body.subtype,'intact');h.dom.window.close();console.log('PASS delayed old catalog uses latest variant');
}
{
 const h=await mount({delay:true});await h.change({platform:'xbox',subtype:'radiant'});assert.equal(h.catalogs.length,2);assert.equal(h.catalogs[1].platform,'xbox');h.catalogs[0].resolve(catalog);await tick();assert.equal(h.w.document.querySelector('select'),null);h.catalogs[1].resolve(catalog);await tick();await tick();await h.submit();const body=h.w.trace.find(t=>t.args?.action==='create').args;assert.equal(body.platform,'xbox');assert.equal(body.body.subtype,'radiant');h.dom.window.close();console.log('PASS platform invalidates previous catalog');
}
{
 const h=await mount();await h.edit('[aria-label="订单数量"]','7');await h.edit('[aria-label="订单价格"]','27');await h.edit('select','radiant');await h.edit('[aria-label="订单价格"]','27');assert.equal(h.w.currentTarget.subtype,'radiant');assert.equal(h.w.document.querySelector('[aria-label="订单数量"]').value,'7');assert.equal(h.w.document.querySelector('[aria-label="订单价格"]').value,'27');assert.equal(h.w.trace.filter(t=>t.args?.action==='items').length,1);await h.submit();const payload=h.w.trace.find(t=>t.args?.action==='create').args.body;assert.equal(payload.quantity,7);assert.equal(payload.platinum,27);h.dom.window.close();console.log('PASS edits survive onVariant echo without catalog reload');
}
{
 const h=await mount({create:'pending'});await h.submit();assert.ok(h.w.document.querySelector('select').disabled);await h.submit();assert.equal(h.creates.length,1);await h.change({subtype:'intact'});assert.ok(h.w.document.querySelector('select').disabled);h.w.session={...h.w.session,accountId:'other',sessionGeneration:2};h.w.rerender();await tick();h.creates[0]({data:{id:'OLD-ACCOUNT'}});await tick();assert.equal(h.w.posted,0);h.dom.window.close();console.log('PASS busy dedup and stale account receipt isolation');
}
{
 const h=await mount({create:'uncertain'});await h.submit();assert.ok(h.w.document.querySelector('select').disabled);assert.match(h.w.document.body.textContent,/请核对订单/);await h.change({subtype:'intact'});assert.ok(h.w.document.querySelector('select').disabled);h.dom.window.close();console.log('PASS uncertain receipt stays blocked on variant switch');
}
console.log('PASS 7 mounted production composer scenarios; no real IPC/network');

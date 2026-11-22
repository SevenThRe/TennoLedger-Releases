import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import * as jsx from 'react/jsx-runtime';
import ts from 'typescript';
import {build} from 'esbuild';
import * as diagnostics from '../src/updateDiagnostics.ts';
import {runUpdate,type UpdateState} from '../src/updateFlow.ts';
const malicious='https://proxyuser:proxypass@evil.invalid/a?token=secret Authorization: Bearer private';
const diagnostic=(kind='timeout',stage='manifest')=>JSON.stringify({type:'update-diagnostic',schema:1,kind,stage,elapsedMs:15001,status:null,causes:['unknown','timeout']});
const exports:any={};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/UpdateFailureNotice.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require:(name:string)=>name==='react'?React:name==='react/jsx-runtime'?jsx:diagnostics});
test('actual update error component renders Chinese stages, safe diagnostics and fixed official recovery',()=>{
 for(const stage of ['manifest','signature','archive'])for(const kind of ['timeout','connect','tls','http','parse','signature','hash']){
  const html=renderToStaticMarkup(React.createElement(exports.default,{error:diagnostic(kind,stage),en:false}));
  assert.ok(html.includes('15001 ms'));assert.ok(html.includes('复制诊断'));assert.ok(html.includes(diagnostics.manualUpdateUrl));assert.ok(html.includes('0.1.8'));assert.ok(!html.includes('更新成功'));
 }
});
test('untrusted nested strings, URLs, headers and diagnostic fields cannot escape into UI or exported diagnostics',()=>{
 for(const error of [malicious,Error(malicious),JSON.stringify({type:'update-diagnostic',schema:1,stage:malicious,kind:malicious,elapsedMs:malicious,status:malicious,causes:[malicious,{cause:malicious}],url:malicious}),{cause:Error(malicious)}]){
  const safe=diagnostics.safeUpdateError(error);const html=renderToStaticMarkup(React.createElement(exports.default,{error,en:true}));
  for(const secret of ['proxyuser','proxypass','evil.invalid','token=','Authorization','private']){assert.ok(!safe.includes(secret));assert.ok(!html.includes(secret));}
  assert.ok(html.includes('cause unknown'));assert.ok(html.includes('Official full installer'));
 }
});
test('startup flow reports a safe failure and never installs after failed check/download',async()=>{
 for(const phase of ['check','download']){let installed=0;const states:UpdateState[]=[];
  await runUpdate({check:async()=>{if(phase==='check')throw Error(diagnostic());return {version:'1.0.0',download:async()=>{throw Error(malicious);},install:async()=>{installed++;},close:async()=>{}};},prepare:async()=>{},resume:async()=>{}},s=>states.push(s));
  assert.equal(installed,0);assert.equal(states.at(-1)?.phase,'error');assert.ok(!states.at(-1)?.error?.includes('secret'));
 }
});
test('actual applicationUpdate keeps null fallback but blocks every error and sanitizes full-updater failure',async()=>{
 const result=await build({entryPoints:[new URL('../src/applicationUpdate.ts',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')],bundle:true,write:false,format:'iife',globalName:'AppUpdate',plugins:[{name:'mock',setup(b){b.onResolve({filter:/^@tauri-apps\//},a=>({path:a.path,namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},a=>({loader:'js',contents:a.path.endsWith('/core')?'export const invoke=(...a)=>globalThis.invokeMock(...a);':a.path.endsWith('/event')?'export const listen=async()=>()=>{};':'export const check=(...a)=>globalThis.checkMock(...a);'}));}}]});
 for(const kind of [null,'timeout','connect','tls','http','parse','signature','validation','range','hash','unknown']){let fallback=0;const ctx:any={Error,invokeMock:async()=>{if(kind)throw Error(diagnostic(kind));return null;},checkMock:async()=>{fallback++;return null;}};vm.createContext(ctx);vm.runInContext(result.outputFiles[0].text,ctx);
  if(kind){await assert.rejects(ctx.AppUpdate.checkApplicationUpdate(),e=>JSON.parse((e as Error).message).kind===kind);assert.equal(fallback,0);}else{assert.equal(await ctx.AppUpdate.checkApplicationUpdate(),null);assert.equal(fallback,1);}
 }
 const ctx:any={Error,invokeMock:async()=>null,checkMock:async()=>{throw Error(malicious);}};vm.createContext(ctx);vm.runInContext(result.outputFiles[0].text,ctx);await assert.rejects(ctx.AppUpdate.checkApplicationUpdate(),e=>!String(e).includes('secret'));
});

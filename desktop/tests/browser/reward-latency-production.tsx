import '../../src/brand.css';
import '../../src/style.css';
import '../../src/collector.css';
import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
const g=window as any;g.isTauri=true;g.__calls=[];g.__TAURI_INTERNALS__={transformCallback:()=>1,invoke:async(c:string)=>{g.__calls.push(c);if(c==='market_request'||c==='market_analytics'||c==='market_price_quote'||c==='market_price_warm')return new Promise(()=>{});if(c==='load_collection')return null;if(c.startsWith('plugin:event|'))return 1;return null;}};
const {Rewards}=await import('../../src/GameOverlay');
const {startMarketPrices}=await import('../../src/useMarketPrices');
const {overlayDefaults}=await import('../../src/overlayModel');
const ids=['/Lotus/Types/Recipes/WarframeRecipes/StyanaxPrimeBlueprint','/Lotus/Types/Recipes/WarframeRecipes/CalibanPrimeChassisBlueprint','/Lotus/Types/Recipes/Components/FormaBlueprint','/Lotus/Types/Recipes/WarframeRecipes/CalibanPrimeChassisBlueprint'];
const second=['/Lotus/Types/Recipes/WarframeRecipes/GyrePrimeBlueprint','/Lotus/Types/Recipes/Weapons/WeaponParts/DualZorenPrimeHandle','/Lotus/Types/Recipes/WarframeRecipes/VorunaPrimeChassisBlueprint','/Lotus/Types/Recipes/Components/FormaBlueprint'];
function Test(){useEffect(startMarketPrices,[]);const [frame,setFrame]=useState(0);useEffect(()=>{const timer=setInterval(()=>setFrame(n=>n+1),500);return()=>clearInterval(timer);},[]);return <div className="gameOverlay relic-rewards"><p>价格首屏 {g.__readyMs?.toFixed(1)??"等待"} ms · OCR帧 {frame} · 网络持续挂起</p><Rewards data={{kind:'relic-rewards',preview:false,preferences:overlayDefaults,payload:{captureId:String(frame),cards:(location.search.includes('second')?second:ids).map(itemId=>({itemId,text:itemId.split('/').at(-1)}))}}} en={false}/></div>;}
const start=performance.now();new MutationObserver(()=>{const values=[...document.querySelectorAll('.overlayRewardPrices>span:first-child')].map(e=>e.textContent);if(values.length===4&&values.every(v=>v!==null&&(/\d/.test(v)||v==='不可交易'))){g.__readyMs??=performance.now()-start;g.__values=values;}}).observe(document.getElementById('root')!,{childList:true,subtree:true,characterData:true});
createRoot(document.getElementById('root')!).render(<Test/>);

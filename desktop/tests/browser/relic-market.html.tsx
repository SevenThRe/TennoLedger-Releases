import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import '../../src/i18n';
import i18n from '../../src/i18n';
import RelicOverview from '../../src/RelicOverview';
import TradeSidebar from '../../src/TradeSidebar';
import {inventoryTradeEvent,inventoryTradeTarget} from '../../src/inventoryTrade';
import {marketPrices} from '../../src/useMarketPrices';
import '../../src/brand.css';
import '../../src/market.css';
import '../../src/inventoryToolbar.css';
import '../../src/style.css';
import '../../src/foundry-visual.css';
import '../../src/workshop.css';
import '../../src/strictParity.css';
import '../../src/tradingParity.css';
import '../../src/layoutCorrections.css';
import '../../src/worldRail.css';
import '../../src/windowShell.css';
import '../../src/eventSidebar.css';
import '../../src/inventoryFamilyParity.css';
import '../../src/relicOverview.css';
const seed=await fetch('/wm-prices.json').then(r=>r.json());marketPrices.seed(seed);
const reward={id:'/Lotus/Types/Recipes/Weapons/WeaponParts/SteflosPrimeBarrel',name:'Steflos Prime Barrel',marketSlug:'steflos_prime_barrel',chance:25.33,ducats:15};
const variants=['Intact','Exceptional','Flawless','Radiant'].map(refinement=>({id:'fixture-axi-c12-'+refinement,base:'Axi C12',name:'Axi C12 '+refinement,era:'Axi',refinement,vaulted:false,marketSlug:'axi_c12_relic',drops:[{location:'Lua / Apollo (Disruption)',chance:14.29},{location:'Sedna / Berehynia (Interception)',chance:12.5}],rewards:[reward,{id:'fixture-untradeable',name:'不可交易奖励 / Untradeable reward',chance:25.33,ducats:null}]}));
function App(){const [en,setEn]=useState(false),[width,setWidth]=useState(1400),[scale,setScale]=useState(1),[events,setEvents]=useState<any[]>([]),[audit,setAudit]=useState(''),[open,setOpen]=useState(true);
 useEffect(()=>{const receive=(e:Event)=>{const target=inventoryTradeTarget((e as CustomEvent).detail);if(target)setEvents(old=>[...old,target]);};window.addEventListener(inventoryTradeEvent,receive);return()=>window.removeEventListener(inventoryTradeEvent,receive);},[]);
 function inspect(){const selectors=['.relicInfoPanel','.relicDetailColumns','.referenceRelicDialog','.fixtureNavigation','.collectionTradeSidebar'];setAudit(JSON.stringify({width,scale,events,rects:selectors.map(selector=>{const el=document.querySelector(selector)!;const r=el.getBoundingClientRect(),s=getComputedStyle(el);return {selector,width:r.width,height:r.height,x:r.x,y:r.y,position:s.position,display:s.display,overflowX:s.overflowX,scrollWidth:el.scrollWidth,clientWidth:el.clientWidth};})},null,2));}
 return <><div style={{height:90,background:'#182438',color:'white',position:'relative',zIndex:1000}}><button onClick={()=>{setEn(!en);void i18n.changeLanguage(en?'zh':'en');}}>中文 / English</button>{[1400,1220,1200,1000].map(w=><button key={w} onClick={()=>setWidth(w)}>宽度 {w}</button>)}{[1,1.25].map(s=><button key={s} onClick={()=>setScale(s)}>缩放 {s}</button>)}<button onClick={inspect}>记录布局</button><button onClick={()=>setEvents([])}>清空事件</button><button onClick={()=>setOpen(true)}>打开详情</button><output>事件 {events.length} {JSON.stringify(events.at(-1)??null)}</output></div>
 <div className="windowShell" style={{width,height:760,'--ui-scale':scale} as React.CSSProperties}><div className="windowTitlebar">TennoLedger · 本地生产组件fixture（无下单）</div><div className="windowContent"><div className="app"><aside className="fixtureNavigation"><nav><button>库存</button><button>遗物</button></nav></aside><main style={{display:'flex'}}><div className="resourceWorkspace" style={{position:'relative',flex:1,minWidth:0,height:'100%'}}>{open&&<RelicOverview relic={variants[0]} variants={variants} counts={{[reward.id]:3}} complete en={en} onClose={()=>setOpen(false)}/>}</div><div className="unifiedWorldRail" style={{width:300,flexShrink:0}}><TradeSidebar><p>未连接真实账号</p></TradeSidebar></div></main></div></div></div><pre style={{position:'absolute',top:860,color:'white',background:'#111',whiteSpace:'pre-wrap'}}>{audit}</pre></>;
}
createRoot(document.getElementById('root')!).render(<App/>);

import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import i18n from 'i18next';
import {initReactI18next} from 'react-i18next';
import {LiveRateChart} from '../../src/ArbitrationRuns';
import ArbitrationMini from '../../src/ArbitrationMini';
import type {ArbitrationRun} from '../../src/arbitrationRunModel';
import {MINI_WIDTH} from '../../src/arbitrationWindowModel';

const style=document.createElement('style');
style.textContent=`:root{font:13px Arial;color:#eef2ff;background:#0e1420;--color-bg-1:#0e1420;--color-bg-2:#191f30;--color-bg-3:#242c44;--color-card-active:#343b58;--ui-line:#343b4e;--ui-line-strong:#4d5776;--color-tab-active:#5923cb;--color-tab-lighter:#b89afa;--color-navigation-hover:#d5dff5}*{box-sizing:border-box}body{margin:0;padding:16px;display:flex;flex-direction:column;align-items:flex-start;gap:12px}.arbPreviewFrame{width:${MINI_WIDTH}px;max-width:100%;transition:height 140ms ease}.arbPreviewBar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 10px;border:1px solid var(--ui-line);border-radius:8px;background:var(--color-bg-2);font-size:12px}.arbPreviewBar button{border:1px solid var(--ui-line-strong);border-radius:6px;background:var(--color-bg-3);color:var(--color-text,#eef2ff);padding:4px 9px;font:inherit;font-size:12px;cursor:pointer}.arbPreviewBar button.selected{background:var(--color-tab-active);border-color:var(--color-tab-lighter)}`;
document.head.append(style);
void i18n.use(initReactI18next).init({lng:'zh',resources:{zh:{translation:{}}},initImmediate:false});

const activeRun={
 id:'demo',
 node:'Hyf',
 nodeId:'SolNode707',
 isHost:true,
 status:'recording',
 startLogSeconds:0,
 missionType:'Defense',
 wavesCompleted:2,
 samples:[],
 timeline:[],
 gameplayStart:0,
 gameplayEnd:null,
 lastLogSeconds:131,
 droneTelemetry:true,
 droneSpawns:3,
 droneTimes:[20,50,110],
 rewardCycles:2,
 intervals:[
  {index:1,kind:'wave',start:0,end:60,complete:true,drones:2},
  {index:2,kind:'wave',start:70,end:120,complete:true,drones:1},
 ],
} as ArbitrationRun;

const endedRun={...activeRun,status:'completed',gameplayEnd:135} as ArbitrationRun;

function Preview(){
 const [mode,setMode]=useState<'live'|'idle'|'ended'|'graphs'>(location.search.includes('graphs')?'graphs':'live');
 const [hidden,setHidden]=useState(false);
 const currentRun=mode==='live'?activeRun:mode==='ended'?endedRun:null;
 if(mode==='graphs'){
  return (
   <>
    <div className="arbPreviewBar">
     <button type="button" onClick={()=>setMode('live')}>返回小窗</button>
    </div>
    <LiveRateChart run={activeRun}/>
   </>
  );
 }
 return (
  <>
   <div className="arbPreviewBar">
    <button type="button" className={mode==='live'?'selected':''} onClick={()=>{setMode('live');setHidden(false);}}>录制中</button>
    <button type="button" className={mode==='idle'?'selected':''} onClick={()=>{setMode('idle');setHidden(false);}}>监听中</button>
    <button type="button" className={mode==='ended'?'selected':''} onClick={()=>{setMode('ended');setHidden(false);}}>已结束</button>
    <button type="button" onClick={()=>setMode('graphs')}>完整图表</button>
    {hidden?(
     <button type="button" className="selected" onClick={()=>setHidden(false)}>唤醒置顶小窗</button>
    ):(
     <button type="button" onClick={()=>setHidden(true)}>模拟关闭</button>
    )}
   </div>
   {hidden?(
    <div className="arbPreviewBar" role="status">
     <span>置顶小窗已隐藏</span>
     <button type="button" className="selected" onClick={()=>setHidden(false)}>立即唤醒 ↗</button>
    </div>
   ):(
    <div className="arbPreviewFrame">
     <ArbitrationMini
      run={currentRun}
      clock={135}
      en={false}
      error=""
      captureCode="watching"
      previewMode
      onHide={()=>setHidden(true)}
      onExpandFull={()=>setMode('graphs')}
     />
    </div>
   )}
  </>
 );
}

createRoot(document.getElementById('root')!).render(<Preview/>);

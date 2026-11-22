import type {DeliverySettings,WorldNotice} from './worldModel.ts';

const SUPPRESSED_SYSTEM_STATES=new Set([
 'foreground-suppressed',
 'in-app-only',
 'busy',
 'quiet-time',
 'd3d-fullscreen',
 'presentation',
 'not-present',
]);

export function shouldPlayInAppSound(
 notice:Pick<WorldNotice,'kind'|'deliveryError'|'systemState'>,
 delivery:Pick<DeliverySettings,'soundEnabled'|'windowsEnabled'>,
 bountySoundEnabled:boolean,
 isNative:boolean,
):boolean{
 if(!delivery.soundEnabled)return false;
 if(notice.kind==='bounty')return bountySoundEnabled;
 if(!isNative||!delivery.windowsEnabled||Boolean(notice.deliveryError))return true;
 return Boolean(notice.systemState&&SUPPRESSED_SYSTEM_STATES.has(notice.systemState));
}

type AudioContextConstructor=typeof AudioContext;

interface GlobalWithAudio{
 AudioContext?:AudioContextConstructor;
 webkitAudioContext?:AudioContextConstructor;
}

let sharedAudioContext:AudioContext|null=null;
let audioUnlockInstalled=false;

function resolveAudioContext():AudioContext|null{
 if(typeof globalThis==='undefined')return null;
 const host=globalThis as GlobalWithAudio;
 const Ctor=host.AudioContext??host.webkitAudioContext;
 if(typeof Ctor!=='function')return null;
 if(!sharedAudioContext||sharedAudioContext.state==='closed'){
  try{
   sharedAudioContext=new Ctor();
  }catch{
   return null;
  }
 }
 return sharedAudioContext;
}

export function unlockNotificationAudio():void{
 const ctx=resolveAudioContext();
 if(ctx&&ctx.state==='suspended'){
  void ctx.resume().catch(()=>{});
 }
}

export function installNotificationAudioUnlock():()=>void{
 if(audioUnlockInstalled||typeof window==='undefined')return()=>{};
 audioUnlockInstalled=true;
 const wake=()=>{unlockNotificationAudio();};
 window.addEventListener('pointerdown',wake,{passive:true});
 window.addEventListener('keydown',wake,{passive:true});
 return()=>{
  audioUnlockInstalled=false;
  window.removeEventListener('pointerdown',wake);
  window.removeEventListener('keydown',wake);
 };
}

export async function playNotificationChime(kind:'bounty'|'world'='bounty'):Promise<boolean>{
 const ctx=resolveAudioContext();
 if(!ctx)return false;
 try{
  if(ctx.state==='suspended')await ctx.resume();
  const base=ctx.currentTime+0.02;
  // Crisp Warframe-inspired harmonic chord progression (C5/E5 -> G5/B5 for bounty, A4 -> E5 for general).
  const notes=kind==='bounty'
   ?[
     {freq:523.25,start:0,duration:0.18,peak:0.12},
     {freq:659.25,start:0.06,duration:0.22,peak:0.10},
     {freq:783.99,start:0.14,duration:0.32,peak:0.14},
     {freq:987.77,start:0.22,duration:0.42,peak:0.09},
    ]
   :[
     {freq:440.0,start:0,duration:0.16,peak:0.10},
     {freq:659.25,start:0.1,duration:0.28,peak:0.11},
    ];
  for(const note of notes){
   const osc=ctx.createOscillator();
   const gain=ctx.createGain();
   osc.type='triangle';
   osc.frequency.setValueAtTime(note.freq,base+note.start);
   gain.gain.setValueAtTime(0.0001,base+note.start);
   gain.gain.linearRampToValueAtTime(note.peak,base+note.start+0.015);
   gain.gain.exponentialRampToValueAtTime(0.0001,base+note.start+note.duration);
   osc.connect(gain);
   gain.connect(ctx.destination);
   osc.start(base+note.start);
   osc.stop(base+note.start+note.duration+0.02);
  }
  return true;
 }catch{
  return false;
 }
}

import test from 'node:test';
import assert from 'node:assert/strict';
import {shouldPlayInAppSound} from '../src/notificationSound.ts';

test('shouldPlayInAppSound respects global and bounty sound toggles and triggers on foreground/suppressed/preview states',()=>{
 const bountyNotice={kind:'bounty',deliveryError:null,systemState:'accepts-notifications'};
 const fissureNotice={kind:'fissure',deliveryError:null,systemState:'accepts-notifications'};

 // Global sound disabled suppresses everything
 assert.equal(shouldPlayInAppSound(bountyNotice,{soundEnabled:false,windowsEnabled:true},true,true),false);
 assert.equal(shouldPlayInAppSound(fissureNotice,{soundEnabled:false,windowsEnabled:true},true,false),false);

 // Bounty sound toggle specifically controls bounty alerts
 assert.equal(shouldPlayInAppSound(bountyNotice,{soundEnabled:true,windowsEnabled:true},false,true),false);
 assert.equal(shouldPlayInAppSound(bountyNotice,{soundEnabled:true,windowsEnabled:true},true,true),true);
 assert.equal(shouldPlayInAppSound(bountyNotice,{soundEnabled:true,windowsEnabled:false},true,false),true);

 // Non-bounty alerts: silent when native Windows Toast succeeded normally
 assert.equal(shouldPlayInAppSound(fissureNotice,{soundEnabled:true,windowsEnabled:true},true,true),false);

 // Non-bounty alerts: play WebAudio fallback when Windows suppressed, disabled, errored, or in browser preview
 assert.equal(shouldPlayInAppSound(fissureNotice,{soundEnabled:true,windowsEnabled:true},true,false),true);
 assert.equal(shouldPlayInAppSound(fissureNotice,{soundEnabled:true,windowsEnabled:false},true,true),true);
 assert.equal(shouldPlayInAppSound({...fissureNotice,deliveryError:'toast failed'},{soundEnabled:true,windowsEnabled:true},true,true),true);

 for(const state of ['foreground-suppressed','in-app-only','busy','quiet-time','d3d-fullscreen','presentation','not-present']){
  assert.equal(shouldPlayInAppSound({...fissureNotice,systemState:state},{soundEnabled:true,windowsEnabled:true},true,true),true);
 }
});

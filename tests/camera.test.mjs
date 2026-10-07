import test from 'node:test';
import assert from 'node:assert/strict';
import {createCamera} from '../dist/lib/camera.js';
function deferred(){let resolve;return {promise:new Promise(r=>resolve=r),resolve:v=>resolve(v)};}
function setup(getUserMedia){
  Object.defineProperty(globalThis,'navigator',{value:{mediaDevices:{getUserMedia}},configurable:true});globalThis.document={hidden:false};
  const events=[],track={stops:0,stop(){this.stops++;},getSettings(){return {facingMode:'environment'};},addEventListener(){}},stream={getTracks:()=>[track],getVideoTracks:()=>[track]},video={srcObject:null,videoWidth:1920,videoHeight:1080,play:async()=>{}};
  const camera=createCamera(video,{onReady:v=>events.push(['ready',v]),onStatus:(t,e)=>events.push(['status',e]),onStopped:()=>events.push(['stopped'])});
  return {camera,video,events,stream,track};
}
test('camera requests rear preference without audio and stops all tracks',async()=>{
  let constraints;let s;s=setup(async c=>{constraints=c;return s.stream;});await s.camera.start();
  assert.equal(constraints.audio,false);assert.equal(constraints.video.facingMode.ideal,'environment');assert.equal(s.camera.active,true);assert.equal(s.events.filter(e=>e[0]==='ready').length,1);s.camera.stop();assert.equal(s.track.stops,1);assert.equal(s.video.srcObject,null);
});
test('permission resolving after suspension does not restart the camera',async()=>{
  const d=deferred(),s=setup(()=>d.promise),pending=s.camera.start();s.camera.stop();d.resolve(s.stream);await pending;
  assert.equal(s.track.stops,1);assert.equal(s.events.filter(e=>e[0]==='ready').length,0);assert.equal(s.camera.active,false);
});
test('permission denial releases busy state and reports a recoverable error',async()=>{
  const s=setup(async()=>{const e=new Error('Denied');e.name='NotAllowedError';throw e;});await s.camera.start();assert.equal(s.camera.starting,false);assert.ok(s.events.some(e=>e[0]==='status'&&e[1]===true));
});
test('portrait drawing viewport requests a portrait camera preference',async()=>{
 let constraints;const s=setup(async c=>{constraints=c;return s.stream;});
 const camera=createCamera(s.video,{onReady(){},onStatus(){},onStopped(){},getViewport:()=>({width:390,height:650})});
 await camera.start();assert.equal(constraints.video.width.ideal,1080);assert.equal(constraints.video.height.ideal,1920);assert.equal(constraints.video.aspectRatio.ideal,9/16);camera.stop();
});

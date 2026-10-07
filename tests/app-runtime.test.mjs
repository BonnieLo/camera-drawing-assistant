// A lightweight DOM stub exercises application wiring; this is not browser/Safari QA.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeSession,exportSession} from '../dist/lib/sessions.js';
import {homography,project,toDisplay} from '../dist/lib/homography.js';

test('app boots, calibrates, edits, locks and re-registers without losing paper transform',async()=>{
  const ids=[...readFileSync(new URL('../dist/index.html',import.meta.url),'utf8').matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  const context=new Proxy({},{get:()=>()=>{}});
  function element(){const listeners={},attrs={};return {options:[],append(node){this.options.push(node);},replaceChildren(){this.options=[];},style:{},classList:{toggle(){}},value:'',hidden:false,disabled:false,checked:false,src:'',readyState:0,
    addEventListener:(name,fn)=>{(listeners[name]??=[]).push(fn);},fire(name,event={}){listeners[name]?.forEach(fn=>fn(event));},
    setAttribute:(k,v)=>{attrs[k]=v;},getAttribute:k=>attrs[k],removeAttribute(k){delete attrs[k];},
    getContext:()=>context,getBoundingClientRect:()=>({left:0,top:0,width:600,height:450}),setPointerCapture(){}};}
  const nodes=Object.fromEntries(ids.map(id=>[id,element()]));nodes.paper.value='210,297';nodes.paper.options=[{value:'210,297'},{value:'297,210'},{value:'1,1'}];nodes['project-name'].value='Test drawing';nodes.grid.checked=true;nodes['reference-grid'].checked=true;
  const classes=new Set();globalThis.document={hidden:false,createElement:element,getElementById:id=>nodes[id],addEventListener(){},documentElement:{},body:{classList:{toggle:k=>classes.has(k)?classes.delete(k):classes.add(k),contains:k=>classes.has(k),remove:k=>classes.delete(k)}}};
  globalThis.window={addEventListener(){},confirm:()=>true};globalThis.location={href:'https://example.test/'};globalThis.devicePixelRatio=2;
  globalThis.requestAnimationFrame=()=>{};globalThis.ResizeObserver=class {observe(){}};
  Object.defineProperty(globalThis,'navigator',{value:{mediaDevices:{}},configurable:true});
  await import('../dist/app.js?runtime-test');
  assert.equal(nodes['reference-layer'].hidden,true);
  const q0=[[.5-.32*210/297-.04,.5-.39+.04],[.5+.32*210/297-.025,.5-.39-.02],[.5+.32*210/297+.055,.5+.39-.015],[.5-.32*210/297-.035,.5+.39+.035]];
  const q1=[[.5-.32*210/297+.065,.5-.39-.02],[.5+.32*210/297+.08,.5-.39+.13],[.5+.32*210/297-.035,.5+.39+.06],[.5-.32*210/297-.075,.5+.39-.09]];
  function register(q){nodes.select.onclick();q.forEach(([x,y],i)=>nodes.canvas.fire('pointerdown',{pointerId:i+1,isPrimary:true,clientX:x*600,clientY:y*450}));assert.equal(nodes.confirm.disabled,false);nodes.confirm.onclick();}
  register(q0);nodes['sample-image'].onclick();assert.equal(nodes['reference-layer'].hidden,false);
  nodes.width.value='57';nodes.width.oninput();assert.equal(nodes['width-value'].value,'57%');
  nodes.rotation.value='32';nodes.rotation.oninput();assert.equal(nodes['rotation-value'].value,'32°');
  const before=nodes['reference-image'].style.transform;nodes.lock.onclick();assert.equal(nodes.width.disabled,true);
  const center=toDisplay(project(homography(q0),[.5,.5]),{x:0,y:0,width:600,height:450});
  nodes.canvas.fire('pointerdown',{pointerId:90,clientX:center[0],clientY:center[1],preventDefault(){}});
  nodes.canvas.fire('pointermove',{pointerId:90,clientX:center[0]+20,clientY:center[1],preventDefault(){}});
  assert.equal(nodes['reference-image'].style.transform,before);
  nodes.opacity.value='30';nodes.opacity.oninput();assert.equal(nodes['reference-image'].style.opacity,'0.3');
  nodes['quick-hide'].onclick();assert.equal(nodes['reference-layer'].hidden,true);nodes['quick-hide'].onclick();assert.equal(nodes['reference-layer'].hidden,false);
  nodes['demo-angle'].onclick();assert.equal(nodes['reference-layer'].hidden,true);register(q1);
  assert.equal(nodes['reference-layer'].hidden,false);assert.equal(nodes['width-value'].value,'57%');assert.equal(nodes['rotation-value'].value,'32°');assert.equal(nodes.lock.getAttribute('aria-pressed'),'true');
  assert.notEqual(nodes['reference-image'].style.transform,before);
  nodes['quick-lock'].onclick();assert.equal(nodes.width.disabled,false);nodes['remove-image'].onclick();assert.equal(nodes['reference-layer'].hidden,true);assert.equal(nodes['reference-card'].hidden,true);
  const record=makeSession({id:'resume-vase',name:'Resume me',paper:{width:210,height:297},asset:{kind:'sample-vase',name:'Vase'},transform:{centerU:.31,centerV:.22,widthU:.57,rotationRad:32*Math.PI/180,opacity:.3,locked:true},lastRegistration:{corners:q0,homography:homography(q0),cameraFrame:{width:1000,height:750},source:'demo',capturedAt:new Date().toISOString(),diagnosticOnly:true}});
  nodes['session-file'].files=[await exportSession(record)];await nodes['session-file'].onchange();
  assert.equal(nodes['reference-layer'].hidden,true,'resume must not reuse the old homography');
  assert.equal(nodes.confirm.disabled,true,'fresh corner selection is required');
  assert.equal(nodes['width-value'].value,'57%');register(q1);
  assert.equal(nodes['reference-layer'].hidden,false);assert.equal(nodes.lock.getAttribute('aria-pressed'),'true');
  assert.equal(nodes['rotation-value'].value,'32°');assert.equal(nodes['reference-image'].style.opacity,'0.3');
  await nodes.focus.onclick();assert.equal(document.body.classList.contains('focus'),true);
  nodes['focus-tools'].onclick();assert.equal(document.body.classList.contains('tools'),true);
  await nodes.focus.onclick();assert.equal(document.body.classList.contains('focus'),false);
});

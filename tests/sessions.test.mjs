import test from 'node:test';
import assert from 'node:assert/strict';
import {makeSession,validateSession,exportSession,importSession,createSessionStore,storageMessage} from '../dist/lib/sessions.js';
import {homography,project} from '../dist/lib/homography.js';
import {referenceMatrix,multiply} from '../dist/lib/reference.js';
const photo=()=>({kind:'photo',name:'portrait.jpg',width:900,height:1200,blob:new Blob([new Uint8Array([255,216,255,217])],{type:'image/jpeg'})});
const transform={centerU:.31,centerV:.22,widthU:.46,rotationRad:.34,opacity:.37,locked:true};
const record=()=>makeSession({id:'test-1',name:'Portrait',paper:{width:210,height:297},asset:photo(),transform,hidden:true,now:'2026-10-07T08:00:00Z'});

test('portable photo backup round-trips Blob bytes, paper transform, lock and opacity',async()=>{
 const original=record(),file=await exportSession(original),restored=await importSession(file);
 assert.deepEqual(restored.transform,transform);assert.deepEqual(restored.paper,original.paper);assert.equal(restored.hidden,true);
 assert.equal(restored.image.blob.type,'image/jpeg');assert.deepEqual(await restored.image.blob.arrayBuffer(),await original.image.blob.arrayBuffer());
 assert.equal('url' in restored.image,false);
});
test('bundled sample backup works offline without a Blob URL',async()=>{
 const s=makeSession({id:'sample',name:'Vase',paper:{width:210,height:297},asset:{kind:'sample-vase',name:'Vase'},transform});
 assert.deepEqual((await importSession(await exportSession(s))).image,s.image);
});
test('resume under another camera pose preserves paper-local reference geometry',async()=>{
 const s=await importSession(await exportSession(record()));
 const oldH=homography([[.1,.1],[.9,.12],[.85,.9],[.12,.95]]),newH=homography([[.2,.05],[.85,.25],[.7,.9],[.05,.75]]);
 const oldPaper=referenceMatrix(transform,s.paper,s.image),newPaper=referenceMatrix(s.transform,s.paper,s.image);
 assert.deepEqual(newPaper,oldPaper);
 assert.notDeepEqual(project(multiply(oldH,oldPaper),[450,600]),project(multiply(newH,newPaper),[450,600]));
 assert.equal(s.lastRegistration,null); // It is never a live registration.
});
test('reject unsupported versions, non-finite transforms, invalid ratios and unsafe image kinds',async()=>{
 for(const change of [s=>s.schemaVersion=99,s=>s.transform.centerU=NaN,s=>s.paper.width=0,s=>s.transform.opacity=2,s=>s.image.kind='remote-url',s=>s.lastRegistration={diagnosticOnly:false}]){
  const s=record();change(s);assert.throws(()=>validateSession(s));
 }
 await assert.rejects(importSession(new Blob(['not json'])));
 const s=record();const envelope=JSON.parse(await (await exportSession(s)).text());envelope.session.image.mimeType='image/svg+xml';
 await assert.rejects(importSession(new Blob([JSON.stringify(envelope)])));
});
// Deterministic IDB adapter: request success can occur before commit OR before abort.
function idbHarness(){
 const rows=new Map();let failure=null;
 const db={objectStoreNames:{contains:()=>true},close(){},transaction(){
  let op,req;const tx={error:null,abort(){tx.error=new Error('Abort');queueMicrotask(()=>tx.onabort());},objectStore(){return {
   put(value){req={};op=()=>rows.set(value.id,structuredClone(value));queueMicrotask(()=>{req.result=value.id;req.onsuccess();finish();});return req;},
   get(id){req={};queueMicrotask(()=>{req.result=structuredClone(rows.get(id));req.onsuccess();finish();});return req;},
   getAll(){req={};queueMicrotask(()=>{req.result=[...rows.values()].map(x=>structuredClone(x));req.onsuccess();finish();});return req;},
   delete(id){req={};op=()=>rows.delete(id);queueMicrotask(()=>{req.onsuccess();finish();});return req;}
  };}};
  function finish(){queueMicrotask(()=>{if(failure){tx.error=failure;failure=null;tx.onabort();}else{op?.();tx.oncomplete();}});}
  return tx;
 }};
 return {open(){const r={};queueMicrotask(()=>{r.result=db;r.onsuccess();});return r;},failNext(e){failure=e;},rows};
}
test('atomic persistence resolves only at commit; failed replacement keeps old image and metadata',async()=>{
 const idb=idbHarness(),store=createSessionStore(idb),s=record();await store.save(s);
 const newer=record();newer.name='New name';newer.image.blob=new Blob(['new'],{type:'image/png'});
 idb.failNext(new DOMException('Full','QuotaExceededError'));
 await assert.rejects(store.save(newer),{name:'QuotaExceededError'});
 const old=await store.get(s.id);assert.equal(old.name,'Portrait');assert.equal(old.image.blob.type,'image/jpeg');
 const reopened=createSessionStore(idb);assert.deepEqual((await reopened.get(s.id)).transform,transform);
 assert.equal((await reopened.list()).length,1);await reopened.delete(s.id);assert.equal((await store.list()).length,0);
});
test('unavailable storage and quota failures are explicit',async()=>{
 await assert.rejects(createSessionStore(null).save(record()));
 assert.match(storageMessage({name:'QuotaExceededError'}),/沒有保存/);
});

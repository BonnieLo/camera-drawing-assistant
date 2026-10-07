import test from 'node:test';
import assert from 'node:assert/strict';
import {createSessionUI} from '../dist/lib/session-ui.js';
import {makeSession,exportSession} from '../dist/lib/sessions.js';
const transform={centerU:.31,centerV:.22,widthU:.46,rotationRad:.3,opacity:.35,locked:true};
function setup(){
 const elements={};const element=()=>({value:'',textContent:'',disabled:false,append(){},replaceChildren(){},click(){}});
 const $=id=>elements[id]??=element();$('project-name').value='Vase';
 globalThis.document={getElementById:$,createElement:element};globalThis.window={addEventListener(){},confirm:()=>true};
 Object.defineProperty(globalThis,'navigator',{value:{},configurable:true});
 let state={paper:{width:210,height:297},transform:{...transform},asset:{kind:'sample-vase',name:'Vase'},hidden:false,lastRegistration:null};
 const rows=new Map(),errors=[];let fail=false,hold=null;
 const store={async list(){return [...rows.values()];},async save(s){if(hold)await hold;if(fail)throw new DOMException('Full','QuotaExceededError');rows.set(s.id,structuredClone(s));},async get(id){return structuredClone(rows.get(id));},async delete(id){rows.delete(id);}};
 const ui=createSessionUI({getState:()=>state,applySession:(s,a)=>{state={...s,asset:a};},resetDrawing:()=>{state.asset=null;},notify:(m,e)=>errors.push({m,e}),store,restore:async s=>({...s.image,url:'sample',release(){}})});
 return {ui,$,rows,errors,get state(){return state;},set fail(v){fail=v;},set hold(v){hold=v;}};
}
test('save, new drawing, resume and import-as-copy preserve transform',async()=>{
 const a=setup();a.ui.changed();assert.equal(await a.ui.save(),true);const originalId=a.ui.current.id;
 a.$('session-list').value=originalId;
 await a.$('new-session').onclick();assert.equal(a.state.asset,null);
 a.$('session-list').value=originalId;await a.$('resume-session').onclick();assert.deepEqual(a.state.transform,transform);assert.equal(a.ui.dirty,false);
 const backup=await exportSession(a.rows.get(originalId));await a.ui.importBackup(backup);
 assert.equal(a.rows.size,2);assert.notEqual(a.ui.current.id,originalId);assert.deepEqual(a.state.transform,transform);
});
test('quota failure is visible and keeps dirty changes and last saved session intact',async()=>{
 const a=setup();a.ui.changed();await a.ui.save();const id=a.ui.current.id;
 a.state.transform.centerU=.8;a.ui.changed();a.fail=true;
 assert.equal(await a.ui.save(),false);assert.equal(a.ui.dirty,true);assert.equal(a.rows.get(id).transform.centerU,.31);
 assert.ok(a.errors.some(x=>x.e&&/沒有保存/.test(x.m)));
});
test('editing during a pending save is not marked saved; a second save persists latest state',async()=>{
 const a=setup();let release;a.hold=new Promise(r=>release=r);a.ui.changed();const pending=a.ui.save();
 a.state.transform.widthU=.8;a.ui.changed();release();await pending;
 assert.equal(a.ui.dirty,true);assert.equal(a.rows.get(a.ui.current.id).transform.widthU,.46);
 a.hold=null;await a.ui.save();assert.equal(a.ui.dirty,false);assert.equal(a.rows.get(a.ui.current.id).transform.widthU,.8);
});
test('cancelled switch keeps unsaved drawing, and invalid backup cannot replace it',async()=>{
 const a=setup();a.ui.changed();window.confirm=()=>false;await a.$('new-session').onclick();assert.ok(a.state.asset);
 window.confirm=()=>true;const before={...a.state.transform};await a.ui.importBackup(new Blob(['broken']));assert.deepEqual(a.state.transform,before);assert.equal(a.rows.size,0);
});

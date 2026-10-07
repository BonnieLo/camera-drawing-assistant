import test from 'node:test';
import assert from 'node:assert/strict';
import {homography,project,contain,toDisplay} from '../dist/lib/homography.js';
import {referenceMatrix,displayMatrix,cssMatrix3d,displayToPaperMetric,fitReference,canProjectReference} from '../dist/lib/reference.js';
import {PaperGestures} from '../dist/lib/gestures.js';
import {renderReference} from '../dist/lib/renderer.js';
const paper={width:210,height:297},image={width:1600,height:1200};
const near=(a,b)=>a.forEach((v,i)=>assert.ok(Math.abs(v-b[i])<1e-7,`${a} ≠ ${b}`));
const toMetric=p=>[p[0]*paper.width,p[1]*paper.height];
test('A4 reference rotation preserves physical image aspect and dimensions',()=>{
  const t={...fitReference(paper,image),widthU:.46,centerU:.31,centerV:.22,rotationRad:Math.PI/2};
  const m=referenceMatrix(t,paper,image),a=toMetric(project(m,[0,0])),b=toMetric(project(m,[1600,0])),c=toMetric(project(m,[1600,1200]));
  near(project(m,[800,600]),[.31,.22]);
  assert.ok(Math.abs(Math.hypot(b[0]-a[0],b[1]-a[1])-210*.46)<1e-7);
  assert.ok(Math.abs(Math.hypot(c[0]-b[0],c[1]-b[1])-210*.46*.75)<1e-7);
});
test('portrait and landscape images fit within a non-square paper',()=>{
  for(const img of [{width:100,height:2000},{width:2000,height:100}]){
    const t=fitReference(paper,img);assert.ok(t.widthU<=.72);
    assert.ok(t.widthU*paper.width*img.height/img.width<=paper.height*.72+1e-7);
  }
});
test('CSS matrix3d projects reference center and four corners exactly like the full mapping chain',()=>{
  const h=homography([[.2,.1],[.8,.2],[.9,.85],[.05,.9]]),rect=contain(1920,1080,390,530),t={...fitReference(paper,image),rotationRad:.67};
  const m=displayMatrix(h,rect,t,paper,image),css=cssMatrix3d(m);
  for(const p of [[0,0],[1600,0],[1600,1200],[0,1200],[800,600]]){
    const [x,y]=p,w=css[3]*x+css[7]*y+css[15];
    near([(css[0]*x+css[4]*y+css[12])/w,(css[1]*x+css[5]*y+css[13])/w],toDisplay(project(h,project(referenceMatrix(t,paper,image),p)),rect));
  }
});
test('same paper gesture in different camera poses gives the same paper displacement',()=>{
  const poses=[[[.1,.1],[.9,.1],[.9,.9],[.1,.9]],[[.2,.07],[.8,.2],[.95,.85],[.05,.94]]];
  for(const q of poses){const h=homography(q),rect=contain(1920,1080,390,530),a=toDisplay(project(h,[.31,.22]),rect),b=toDisplay(project(h,[.41,.42]),rect);
    near(displayToPaperMetric(a,h,rect,paper),[.31*210,.22*297]);near(displayToPaperMetric(b,h,rect,paper),[.41*210,.42*297]);}
});
function setup(){let t={...fitReference(paper,image),centerU:.5,centerV:.5,widthU:.4};const g=new PaperGestures({getTransform:()=>t,setTransform:v=>{t=v;},getPaper:()=>paper});return {g,get:()=>t,set:v=>{t=v;}};}
test('one-finger move changes normalized paper position',()=>{
  const s=setup();s.g.begin(1,[100,100]);s.g.move(1,[121,129.7]);near([s.get().centerU,s.get().centerV],[.6,.6]);
});
test('pinch scale and rotation use paper metric and preserve the gesture anchor',()=>{
  const s=setup();s.g.begin(1,[85,148.5]);s.g.begin(2,[125,148.5]);
  s.g.move(1,[105,108.5]);s.g.move(2,[105,188.5]);
  near([s.get().centerU,s.get().centerV,s.get().widthU,s.get().rotationRad],[.5,.5,.8,Math.PI/2]);
});
test('lifting one finger rebases without a jump, then single-finger movement continues',()=>{
  const s=setup();s.g.begin(1,[80,140]);s.g.begin(2,[120,140]);s.g.move(2,[130,150]);const before={...s.get()};
  s.g.end(2);s.g.move(1,[80,140]);assert.deepEqual(s.get(),before);s.g.move(1,[101,140]);near([s.get().centerU,s.get().centerV],[before.centerU+.1,before.centerV]);
});
test('lock rejects input, reset prevents stale pointers from moving a re-registered reference',()=>{
  const s=setup();s.set({...s.get(),locked:true});assert.equal(s.g.begin(1,[100,100]),false);s.set({...s.get(),locked:false});s.g.begin(1,[100,100]);s.g.reset();const t={...s.get()};assert.equal(s.g.move(1,[120,120]),false);assert.deepEqual(s.get(),t);
});
test('lock during a gesture clears pointers without changing the transform',()=>{
  const s=setup();s.g.begin(1,[100,100]);s.set({...s.get(),locked:true});const before={...s.get()};assert.equal(s.g.move(1,[130,130]),false);assert.equal(s.g.points.size,0);assert.deepEqual(s.get(),before);
});
test('changing registration changes display position but never alters the reference transform',()=>{
  const t={...fitReference(paper,image),centerU:.31,centerV:.22,rotationRad:.3},saved=structuredClone(t),rect=contain(1000,750,600,450);
  const h1=homography([[.1,.1],[.9,.1],[.9,.9],[.1,.9]]),h2=homography([[.2,.07],[.8,.2],[.95,.85],[.05,.94]]);
  assert.notDeepEqual(project(displayMatrix(h1,rect,t,paper,image),[800,600]),project(displayMatrix(h2,rect,t,paper,image),[800,600]));assert.deepEqual(t,saved);
});
test('image behind a perspective horizon is rejected',()=>{
  const h=homography([[.2,.1],[.8,.1],[.6,.8],[.4,.8]]);
  assert.equal(canProjectReference(h,fitReference(paper,image),paper,image),true);
  assert.equal(canProjectReference(h,{...fitReference(paper,image),widthU:3,centerV:0},paper,{width:10,height:500}),false);
});
test('renderer hides stale registration and clips to the paper polygon',()=>{
  const layer={style:{}},img={style:{}},corners=[[.1,.1],[.9,.1],[.9,.9],[.1,.9]],params={h:homography(corners),corners,rect:contain(1000,750,600,450),transform:fitReference(paper,image),paper,asset:image,visible:false};
  renderReference(layer,img,params);assert.equal(layer.hidden,true);
  renderReference(layer,img,{...params,visible:true});assert.equal(layer.hidden,false);assert.match(layer.style.clipPath,/polygon/);assert.match(img.style.transform,/^matrix3d\(/);assert.equal(img.style.opacity,'0.45');
});

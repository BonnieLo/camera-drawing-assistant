import test from 'node:test';
import assert from 'node:assert/strict';
import {UNIT_CORNERS,homography,project,inverse,contain,toDisplay,fromDisplay,validateQuad} from '../dist/lib/homography.js';
function near(a,b){a.forEach((v,i)=>assert.ok(Math.abs(v-b[i])<1e-8,`${a} ≠ ${b}`));}
test('perspective corners and paper center round-trip',()=>{
  const q=[[.18,.12],[.82,.26],[.7,.91],[.1,.78]],h=homography(q),inv=inverse(h);
  UNIT_CORNERS.forEach((p,i)=>near(project(h,p),q[i]));
  for(const p of [[.31,.22],[.5,.5],[.94,.08]])near(project(inv,project(h,p)),p);
});
test('identity and translated rectangle',()=>{
  const identity=homography(UNIT_CORNERS);near(project(identity,[.31,.22]),[.31,.22]);
  const h=homography([[.2,.1],[.8,.1],[.8,.9],[.2,.9]]);near(project(h,[.5,.5]),[.5,.5]);
});
test('resume with a different camera pose preserves paper point',()=>{
  const p=[.31,.22],h1=homography([[.1,.1],[.9,.1],[.9,.9],[.1,.9]]),h2=homography([[.2,.07],[.8,.2],[.95,.85],[.05,.94]]);
  assert.notDeepEqual(project(h1,p),project(h2,p));near(project(inverse(h1),project(h1,p)),p);near(project(inverse(h2),project(h2,p)),p);
});
test('invalid selection order, collapsed corners, non-finite and tiny region rejected',()=>{
  for(const q of [[[0,0],[1,1],[1,0],[0,1]],[[0,0],[0,0],[1,1],[0,1]],[[0,0],[NaN,0],[1,1],[0,1]],[[.1,.1],[.11,.1],[.11,.11],[.1,.11]],[[0,0],[1,0],[.5,0],[0,1]],[[0,0],[2,0],[1,1],[0,1]]])assert.throws(()=>validateQuad(q));
});
test('contain mapping aligns letterbox touch and rendering in portrait and landscape',()=>{
  for(const dimensions of [[1920,1080,390,510],[1080,1920,1024,600]]){
    const r=contain(...dimensions);near(fromDisplay(toDisplay([.31,.22],r),r),[.31,.22]);assert.ok(r.x>=0&&r.y>=0);assert.ok(r.width<=dimensions[2]+1e-8&&r.height<=dimensions[3]+1e-8);
  }
});
test('projective grid lines remain straight under a tilted camera',()=>{
  const h=homography([[.2,.1],[.8,.2],[.9,.85],[.05,.9]]),a=project(h,[.25,0]),b=project(h,[.25,.5]),c=project(h,[.25,1]);
  assert.ok(Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))<1e-9);
});

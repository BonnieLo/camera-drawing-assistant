import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createWakeLock} from '../dist/lib/pwa.js';
const worker=readFileSync(new URL('../dist/sw.js',import.meta.url),'utf8');
function harness(){
 const listeners={},buckets=new Map();let networkFailure=false,login=false,skips=0,claims=0;
 const caches={async open(name){if(!buckets.has(name))buckets.set(name,new Map());const bucket=buckets.get(name);return {async put(k,r){bucket.set(typeof k==='string'?k:k.url,r.clone());},async match(k){return bucket.get(typeof k==='string'?k:k.url)?.clone();}};},async keys(){return [...buckets.keys()];},async delete(k){return buckets.delete(k);}};
 const self={location:{href:'https://example.test/sw.js'},clients:{async claim(){claims++;}},async skipWaiting(){skips++;},addEventListener:(n,f)=>listeners[n]=f};
 async function fetch(request){if(networkFailure)throw new TypeError('Offline');const url=typeof request==='string'?request:request.url,path=new URL(url).pathname.slice(1)||'index.html';
  if(login&&path==='index.html')return new Response('<html>Sign in</html>',{headers:{'Content-Type':'text/html'}});
  const mime=path.endsWith('.html')?'text/html':path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':path.endsWith('.png')?'image/png':path.endsWith('.svg')?'image/svg+xml':'application/manifest+json';
  return new Response(readFileSync(new URL('../dist/'+path,import.meta.url)),{headers:{'Content-Type':mime}});
 }
 vm.runInNewContext(worker,{self,caches,fetch,URL,Response});
 function navigation(){let result;listeners.fetch({request:{url:'https://example.test/',method:'GET',mode:'navigate'},respondWith:p=>result=p});return result;}
 return {listeners,buckets,navigation,get skips(){return skips;},get claims(){return claims;},set offline(v){networkFailure=v;},set login(v){login=v;},async install(){let p;listeners.install({waitUntil:x=>p=x});await p;},async activate(){let p;listeners.activate({waitUntil:x=>p=x});await p;}};
}
test('offline shell includes every file; offline navigation restores the same app version',async()=>{
 const h=harness();await h.install();assert.equal([...h.buckets.values()][0].size,16);await h.activate();assert.equal(h.claims,1);
 h.offline=true;const response=await h.navigation();assert.match(await response.text(),/paper-mvp-v1/);
});
test('install refuses sign-in HTML and never caches it as the application',async()=>{
 const h=harness();h.login=true;await assert.rejects(h.install(),/non-app HTML/);assert.equal(h.buckets.size,0);
});
test('live sign-in response is not replaced by cached app; API/POST/cross-origin ignored',async()=>{
 const h=harness();await h.install();h.login=true;assert.match(await (await h.navigation()).text(),/Sign in/);
 for(const request of [{url:'https://example.test/auth/login',method:'GET',mode:'navigate'},{url:'https://example.test/api/sessions',method:'GET'},{url:'https://example.test/app.js',method:'POST'},{url:'https://other.test/index.html',method:'GET'}]){
  let handled=false;h.listeners.fetch({request,respondWith(){handled=true;}});assert.equal(handled,false);
 }
});
test('only explicit update skips waiting; activation retains unrelated caches',async()=>{
 const h=harness();await h.install();h.buckets.set('paper-shell-old',new Map());h.buckets.set('another-app',new Map());
 assert.equal(h.skips,0);let p;h.listeners.message({data:{type:'ACTIVATE_UPDATE'},waitUntil:x=>p=x});await p;assert.equal(h.skips,1);
 await h.activate();assert.equal(h.buckets.has('paper-shell-old'),false);assert.equal(h.buckets.has('another-app'),true);
});
test('wake lock acquired after a background transition is immediately released',async()=>{
 globalThis.document={hidden:false,addEventListener(){}};globalThis.window={addEventListener(){}};
 let resolve,releaseCount=0;Object.defineProperty(globalThis,'navigator',{configurable:true,value:{wakeLock:{request:()=>new Promise(r=>resolve=r)}}});
 const wake=createWakeLock({shouldHold:()=>true});const pending=wake.update();document.hidden=true;await wake.release();
 resolve({async release(){releaseCount++;},addEventListener(){}});await pending;assert.equal(releaseCount,1);
});

// Version all app files together. No photos, sessions, API or sign-in responses are cached.
const VERSION='paper-shell-mvp-20261007-1';
const PREFIX='paper-shell-';
const SHELL=['index.html','style.css','app.js','manifest.webmanifest','assets/vase.svg','assets/icon-192.png','assets/icon-512.png','assets/apple-touch-icon.png','lib/homography.js','lib/reference.js','lib/gestures.js','lib/renderer.js','lib/camera.js','lib/sessions.js','lib/session-ui.js','lib/pwa.js'];
const base=new URL('./',self.location.href),urls=SHELL.map(p=>new URL(p,base).href);
const indexURL=new URL('index.html',base).href;
async function isShell(response){return response.ok&&!response.redirected&&response.headers.get('Content-Type')?.includes('text/html')&&(await response.clone().text()).includes('name="paper-shell" content="paper-mvp-v1"');}
async function cacheInstall(){
  const responses=await Promise.all(urls.map(async url=>{
    const response=await fetch(url,{cache:'reload',credentials:'same-origin',redirect:'error'});
    if(!response.ok||response.redirected||new URL(response.url||url).origin!==base.origin)throw new Error('App shell unavailable');
    const contentType=response.headers.get('Content-Type')||'';
    if(url===indexURL){if(!await isShell(response))throw new Error('Refusing non-app HTML');}
    else if(url.endsWith('.js')&&!/(java|ecma)script/.test(contentType))throw new Error('Invalid script');
    else if(url.endsWith('.css')&&!contentType.includes('text/css'))throw new Error('Invalid stylesheet');
    else if(url.endsWith('.png')&&!contentType.includes('image/png'))throw new Error('Invalid icon');
    else if(url.endsWith('.webmanifest')){if((await response.clone().json()).name!=='Paper Drawing Assistant')throw new Error('Invalid manifest');}
    else if(url.endsWith('.svg')&&!contentType.includes('image/svg+xml'))throw new Error('Invalid sample');
    return [url,response];
  }));
  const cache=await caches.open(VERSION);
  try{await Promise.all(responses.map(([url,response])=>cache.put(url,response)));}catch(e){await caches.delete(VERSION);throw e;}
}
self.addEventListener('install',event=>event.waitUntil(cacheInstall()));
self.addEventListener('message',event=>{if(event.data?.type==='ACTIVATE_UPDATE')event.waitUntil(self.skipWaiting());});
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  for(const key of await caches.keys())if(key.startsWith(PREFIX)&&key!==VERSION)await caches.delete(key);
  await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==base.origin||url.search)return;
  const navigation=event.request.mode==='navigate'&&(url.href===base.href||url.href===indexURL);
  if(!navigation&&!urls.includes(url.href))return;
  event.respondWith((async()=>{
    const cache=await caches.open(VERSION);
    if(navigation){
      // Let live sign-in/denial responses pass through. Only an actual network failure
      // falls back offline. Serve our cached version after a successful auth check,
      // avoiding a new HTML / old JS mismatch before an explicit update.
      try{const live=await fetch(event.request);if(!await isShell(live))return live;return await cache.match(indexURL)||live;}
      catch{const offline=await cache.match(indexURL);if(offline)return offline;return new Response('請先連線開啟 Paper，完成離線準備。',{status:503,headers:{'Content-Type':'text/plain;charset=utf-8'}});}
    }
    return await cache.match(url.href)||fetch(event.request);
  })());
});

export async function setupPWA({hasUnsaved=()=>false,notify=()=>{}}={}){
  const $=id=>document.getElementById(id);
  if(!('serviceWorker' in navigator)){ $('pwa-status').textContent='此瀏覽器不支援離線快取；可繼續線上使用。';return; }
  let requested=false;
  navigator.serviceWorker.addEventListener('controllerchange',()=>{if(requested)location.reload();});
  try{
    const registration=await navigator.serviceWorker.register(new URL('../sw.js',import.meta.url),{scope:new URL('../',import.meta.url).pathname,updateViaCache:'none'});
    function showUpdate(){if(registration.waiting){$('pwa-update').hidden=false;$('pwa-status').textContent='新版本已準備好。保存作品後可更新。';}}
    function watchInstall(){const worker=registration.installing;worker?.addEventListener('statechange',()=>{showUpdate();if(worker.state==='redundant'&&!registration.active)$('pwa-status').textContent='離線準備失敗，請保持連線並重新登入後再試。';});}
    showUpdate();watchInstall();registration.addEventListener('updatefound',watchInstall);
    $('pwa-update').onclick=()=>{
      if(hasUnsaved()){notify('請先保存目前的構圖，再更新 App。',true);return;}
      if(registration.waiting){requested=true;registration.waiting.postMessage({type:'ACTIVATE_UPDATE'});}
    };
    const ready=await navigator.serviceWorker.ready;
    if(ready.active&&!registration.waiting)$('pwa-status').textContent='離線 App 已準備好 · 主畫面開啟仍需實機確認。';
  }catch{$('pwa-status').textContent='離線尚未就緒，請保持連線重開；私密站點可能需要重新登入。';}
}
export function createWakeLock({shouldHold,onStatus=()=>{}}){
  let lock=null,request=0;
  async function release(){++request;const old=lock;lock=null;try{await old?.release();}catch{}}
  async function update(){
    if(document.hidden||!shouldHold()){await release();return;}
    if(lock&&!lock.released)return;
    if(!navigator.wakeLock){onStatus('此裝置不支援保持螢幕亮起');return;}
    const id=++request;
    try{const next=await navigator.wakeLock.request('screen');
      if(id!==request||document.hidden||!shouldHold()){await next.release();return;}
      lock=next;next.addEventListener('release',()=>{if(lock===next){lock=null;onStatus('螢幕亮起已解除');}});onStatus('描圖中保持螢幕亮起');
    }catch{onStatus('無法保持螢幕亮起，請留意休眠');}
  }
  document.addEventListener('visibilitychange',()=>{void update();});window.addEventListener('pagehide',()=>{void release();});
  return {update,release};
}

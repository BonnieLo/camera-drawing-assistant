import {homography,project,contain,toDisplay,fromDisplay} from './lib/homography.js';
import {fitReference,constrainTransform,importReference,displayToPaperMetric,canProjectReference} from './lib/reference.js';
import {PaperGestures} from './lib/gestures.js';
import {renderReference} from './lib/renderer.js';
import {createCamera} from './lib/camera.js';
import {createSessionUI} from './lib/session-ui.js';
import {setupPWA,createWakeLock} from './lib/pwa.js';
const $=id=>document.getElementById(id);
const canvas=$('canvas'),ctx=canvas.getContext('2d'),video=$('video'),stage=$('stage');
let source='demo',selecting=false,corners=[],H=null,confirmed=false,drag=null,angle=0;
let sw=1000,sh=750,vw=1,vh=1,rect=contain(sw,sh,vw,vh);
let asset=null,transform=null,hidden=false,importing=false,importId=0;
let sessionUI=null,lastRegistration=null;
const changed=()=>sessionUI?.changed();
const letters=['A','B','C','D'];
const paper=()=>{const [width,height]=$('paper').value.split(',').map(Number);return {width,height};};
function message(t,error=false){$('status').textContent=t;$('status').classList.toggle('error',error);$('camera-feedback').textContent=t||'';$('camera-feedback').hidden=!error;$('camera-feedback').classList.toggle('error',error);}
function tab(name){$('tool-title').textContent={paper:'紙張與對位',reference:'調整參考圖片',sessions:'我的作品'}[name];for(const key of ['paper','reference','sessions']){$(`${key}-panel`).hidden=key!==name;$(`tab-${key}`).setAttribute('aria-pressed',String(key===name));}for(const key of ['paper','reference','sessions'])$(`nav-${key}`).setAttribute('aria-pressed',String(key===name));}
function openTools(name){if(name)tab(name);document.body.classList.add('tools');$('focus-tools').setAttribute('aria-pressed','true');}
function closeTools(){document.body.classList.remove('tools');$('focus-tools').setAttribute('aria-pressed','false');}
function cancelGesture(){gestures.reset();drag=null;$('corner-loupe').hidden=true;}
function invalidate(t){corners=[];H=null;confirmed=false;selecting=false;cancelGesture();if(t)message(t);sync();}
function render(){renderReference($('reference-layer'),$('reference-image'),{h:H,corners,rect,transform,paper:paper(),asset,visible:confirmed&&!hidden});}
function sync(){
  sessionUI?.sync();
  $('calibration-actions').hidden=confirmed;
  $('stage-camera').hidden=selecting; $('stage-camera').disabled=camera.starting; $('stage-camera').textContent=camera.starting?'等待權限…':source==='camera'?'重新開相機':'開啟相機';
  $('stage-select').hidden=selecting;$('stage-select').disabled=camera.starting;
  $('stage-undo').hidden=!selecting;$('stage-undo').disabled=!corners.length;
  $('stage-confirm').hidden=!selecting;$('stage-confirm').disabled=!H||confirmed;
  $('stage-image').hidden=!confirmed||Boolean(asset);
  $('undo').disabled=!corners.length||confirmed;$('confirm').disabled=!H||confirmed;$('select').disabled=camera.starting;
  $('select').textContent=selecting?'重新選角':confirmed?'重新校準':'開始選角';$('paper').disabled=selecting||confirmed;
  $('registration-label').textContent=confirmed?'✓ 紙張座標已建立':corners.length===4?'等待確認':selecting?`選角 ${corners.length} / 4`:'尚未校準';
  $('corner-prompt').textContent=confirmed?(asset?(hidden?'參考圖已隱藏':transform.locked?'參考圖已鎖定 · 固定手機後描輪廓':'單指移動 · 雙指縮放與旋轉'):'校準完成 · 接著選擇參考圖片'):selecting?(corners.length<4?`點選 ${letters[corners.length]} 角 · ${['左上','右上','右下','左下'][corners.length]}`:'拖動四角微調，再確認校準'):'先固定裝置，完成紙張校準';
  $('source-label').textContent=source==='camera'?'● LIVE CAMERA':'● DEMO STUDIO';$('scene-note').textContent=source==='camera'?'固定裝置 · 手動校準不會自動追蹤':'模擬畫紙 · 可先試操作';
  $('demo').hidden=source==='demo';$('demo-angle').hidden=source==='camera';
  $('camera').disabled=camera.starting;$('camera').innerHTML=camera.starting?'等待相機權限…':source==='camera'?'重新啟動相機 <span>↻</span>':'開啟後鏡頭 <span>↗</span>';
  $('import-image').disabled=importing||Boolean(sessionUI?.busy);$('sample-image').disabled=importing||Boolean(sessionUI?.busy);$('import-image').innerHTML=importing?'正在處理圖片…':asset?'更換參考圖片 <span>＋</span>':'從照片選擇圖片 <span>＋</span>';
  $('reference-card').hidden=!asset;$('reference-controls').disabled=!asset||!confirmed||importing;$('remove-image').disabled=importing;
  $('alignment-notice').hidden=confirmed;$('alignment-notice').textContent=asset?'圖片已準備好。先完成紙張校準，構圖才會疊到紙上。':'先完成紙張校準，圖片才會疊在紙上。';
  $('quicktools').hidden=!asset||!confirmed;
  if(asset){
    $('reference-name').textContent=asset.name;$('reference-size').textContent=`${asset.width} × ${asset.height} · 紙張座標構圖`;
    $('opacity').value=String(Math.round(transform.opacity*100));$('opacity-value').value=`${Math.round(transform.opacity*100)}%`;
    $('width').value=String(Math.round(transform.widthU*100));$('width-value').value=`${Math.round(transform.widthU*100)}%`;
    const degrees=Math.round(transform.rotationRad*180/Math.PI);$('rotation').value=String(degrees);$('rotation-value').value=`${degrees}°`;
    for(const id of ['width','rotation','left','right','up','down','fit-image'])$(id).disabled=transform.locked;
    for(const id of ['lock','quick-lock']){$(id).textContent=transform.locked?'解鎖並調整':'鎖定參考圖';$(id).setAttribute('aria-pressed',String(transform.locked));}
    for(const id of ['hide-image','quick-hide']){$(id).textContent=hidden?'顯示參考圖':'暫時隱藏';$(id).setAttribute('aria-pressed',String(hidden));}
  }
  render();
}
function setTransform(t){
  if(!asset||!confirmed||transform.locked||sessionUI?.busy)return;
  const next=constrainTransform(t);
  if(!canProjectReference(H,next,paper(),asset)){message('此角度下圖片超出有效投影範圍，請縮小圖片或重新校準。',true);return;}
  transform=next;changed();sync();
}
const gestures=new PaperGestures({getTransform:()=>transform,setTransform,getPaper:paper});
function updateH(){H=null;confirmed=false;if(corners.length===4){try{H=homography(corners);message('四角已選好。檢查網格是否貼合紙面，拖動角落可微調。');}catch(e){message(e.message,true);}}sync();}
function size(){
  const r=stage.getBoundingClientRect();vw=Math.max(1,r.width);vh=Math.max(1,r.height);const dpr=Math.min(devicePixelRatio||1,2);
  canvas.width=Math.round(vw*dpr);canvas.height=Math.round(vh*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);rect=contain(sw,sh,vw,vh);
  cancelGesture();render();
}
// Viewport resize alone preserves registration in normalized camera coordinates.
new ResizeObserver(size).observe(stage);

function demoQuad(){
  const ratio=paper().width/paper().height;
  const halfw=Math.min(.30,.32*ratio), halfh=Math.min(.39,.30/ratio);
  return angle===0?[[.5-halfw-.04,.5-halfh+.04],[.5+halfw-.025,.5-halfh-.02],[.5+halfw+.055,.5+halfh-.015],[.5-halfw-.035,.5+halfh+.035]]:
    [[.5-halfw+.065,.5-halfh-.02],[.5+halfw+.08,.5-halfh+.13],[.5+halfw-.035,.5+halfh+.06],[.5-halfw-.075,.5+halfh-.09]];
}
function path(points){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.closePath();}
function drawDemo(){
  ctx.fillStyle='#536453';ctx.fillRect(rect.x,rect.y,rect.width,rect.height);
  ctx.strokeStyle='#ffffff05';ctx.lineWidth=1;
  for(let i=0;i<16;i++){const x=rect.x+i*rect.width/15;ctx.beginPath();ctx.moveTo(x,rect.y);ctx.lineTo(x-rect.width*.12,rect.y+rect.height);ctx.stroke();}
  const q=demoQuad(), h=homography(q),points=q.map(p=>toDisplay(p,rect));
  ctx.save();ctx.shadowColor='#0b150955';ctx.shadowBlur=22;ctx.shadowOffsetY=12;path(points);ctx.fillStyle='#f6f3e9';ctx.fill();ctx.restore();
  ctx.strokeStyle='#dcded2';ctx.lineWidth=1;path(points);ctx.stroke();
  // Sparse pencil studies keep the demo tied to the creative purpose.
  const shape=[[.39,.67],[.33,.44],[.36,.35],[.64,.35],[.67,.44],[.61,.67]];
  ctx.strokeStyle='#929b7a99';ctx.lineWidth=1.5;path(shape.map(p=>toDisplay(project(h,p),rect)));ctx.stroke();
  ctx.beginPath();[[.48,.35],[.44,.27],[.56,.22],[.56,.17]].forEach((p,i)=>i?ctx.lineTo(...toDisplay(project(h,p),rect)):ctx.moveTo(...toDisplay(project(h,p),rect)));ctx.stroke();
  ctx.fillStyle='#748164';ctx.font='10px sans-serif';ctx.textAlign='center';ctx.fillText('YOUR PAPER, YOUR CANVAS',...toDisplay(project(h,[.5,.83]),rect));
}
function drawGrid(){
  if(!H||!$('grid').checked)return;
  ctx.strokeStyle=confirmed?'#96bc89dd':'#b87550dd';ctx.lineWidth=1;
  for(let i=0;i<=4;i++){
    for(const ends of [[[i/4,0],[i/4,1]],[[0,i/4],[1,i/4]]]){ctx.beginPath();ctx.moveTo(...toDisplay(project(H,ends[0]),rect));ctx.lineTo(...toDisplay(project(H,ends[1]),rect));ctx.stroke();}
  }
  ctx.save();ctx.setLineDash([5,7]);ctx.strokeStyle='#b8755066';
  for(const ends of [[[0,0],[1,1]],[[1,0],[0,1]]]){ctx.beginPath();ctx.moveTo(...toDisplay(project(H,ends[0]),rect));ctx.lineTo(...toDisplay(project(H,ends[1]),rect));ctx.stroke();}ctx.restore();
  const center=toDisplay(project(H,[.5,.5]),rect);ctx.beginPath();ctx.arc(...center,3,0,Math.PI*2);ctx.fillStyle='#b87550';ctx.fill();
}


function draw(){
  ctx.fillStyle='#141a16';ctx.fillRect(0,0,vw,vh);
  if(source==='camera'&&video.readyState>=2){
    if(video.videoWidth!==sw||video.videoHeight!==sh){sw=video.videoWidth;sh=video.videoHeight;rect=contain(sw,sh,vw,vh);invalidate('相機影像尺寸改變，請重新校準。');tab('paper');}
    ctx.drawImage(video,rect.x,rect.y,rect.width,rect.height);
  }else if(source==='demo')drawDemo();
  drawGrid();
  if(corners.length>1&&!H){ctx.strokeStyle='#d6956c';ctx.lineWidth=1.5;ctx.beginPath();corners.forEach((p,i)=>i?ctx.lineTo(...toDisplay(p,rect)):ctx.moveTo(...toDisplay(p,rect)));ctx.stroke();}
  drawLoupe();
  corners.forEach((p,i)=>{const [x,y]=toDisplay(p,rect);ctx.beginPath();ctx.arc(x,y,13,0,Math.PI*2);ctx.fillStyle=confirmed?'#42664a':'#af6748';ctx.fill();ctx.strokeStyle='#fff8df';ctx.lineWidth=1.5;ctx.stroke();ctx.fillStyle='#fff8df';ctx.font='600 11px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(letters[i],x,y);});
  requestAnimationFrame(draw);
}
function drawLoupe(){
  const loupe=$('corner-loupe');if(!drag||!selecting||confirmed){loupe.hidden=true;return;}
  const [x,y]=toDisplay(corners[drag.index],rect),radius=80,zoom=3,dpr=canvas.width/vw;
  loupe.hidden=false;loupe.style.right=x>vw/2?'auto':'14px';loupe.style.left=x>vw/2?'14px':'auto';
  const lctx=loupe.getContext('2d');lctx.fillStyle='#101712';lctx.fillRect(0,0,160,160);
  lctx.drawImage(canvas,(x-radius/zoom)*dpr,(y-radius/zoom)*dpr,160/zoom*dpr,160/zoom*dpr,0,0,160,160);
  lctx.strokeStyle='#ffffff';lctx.lineWidth=1.5;lctx.beginPath();lctx.moveTo(64,80);lctx.lineTo(96,80);lctx.moveTo(80,64);lctx.lineTo(80,96);lctx.stroke();
  lctx.strokeStyle='#cf935f';lctx.beginPath();lctx.arc(80,80,4,0,Math.PI*2);lctx.stroke();
}
function point(e){const r=canvas.getBoundingClientRect();return [e.clientX-r.left,e.clientY-r.top];}
canvas.addEventListener('pointerdown',e=>{
  if(camera.starting||importing||sessionUI?.busy)return;
  const p=point(e),n=fromDisplay(p,rect);
  if(selecting&&!confirmed){
    if(!e.isPrimary)return;
    if(n.some(v=>v<0||v>1)){message('請在影像內選角，不要點黑色留白。',true);return;}
    const hit=corners.findIndex(c=>Math.hypot(...toDisplay(c,rect).map((v,i)=>v-p[i]))<28);
    if(hit>=0){drag={id:e.pointerId,index:hit};canvas.setPointerCapture(e.pointerId);}else if(corners.length<4){corners.push(n);drag={id:e.pointerId,index:corners.length-1};canvas.setPointerCapture(e.pointerId);updateH();}
  }else if(confirmed&&asset&&!transform.locked&&!hidden){
    const metric=displayToPaperMetric(p,H,rect,paper()),config=paper();
    if(metric[0]<0||metric[0]>config.width||metric[1]<0||metric[1]>config.height)return;
    if(gestures.begin(e.pointerId,metric)){canvas.setPointerCapture(e.pointerId);e.preventDefault();}
  }
});
canvas.addEventListener('pointermove',e=>{
  if(drag?.id===e.pointerId){corners[drag.index]=fromDisplay(point(e),rect).map(v=>Math.max(0,Math.min(1,v)));updateH();}
  else if(confirmed&&asset&&!hidden&&gestures.points.has(e.pointerId)){gestures.move(e.pointerId,displayToPaperMetric(point(e),H,rect,paper()));e.preventDefault();}
});
function endPointer(e){if(drag?.id===e.pointerId){drag=null;$('corner-loupe').hidden=true;}gestures.end(e.pointerId);}
for(const name of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(name,endPointer);
function startSelection(){if(sessionUI?.busy)return;closeTools();invalidate();selecting=true;tab('paper');message('固定手機，依 A 左上 → B 右上 → C 右下 → D 左下點選。原有參考構圖會保留。');sync();}
$('select').onclick=startSelection;$('quick-align').onclick=startSelection;
$('undo').onclick=()=>{corners.pop();updateH();};
$('confirm').onclick=()=>{
  if(!H)return;confirmed=true;selecting=false;cancelGesture();
  lastRegistration={corners:structuredClone(corners),homography:[...H],cameraFrame:{width:sw,height:sh},source,capturedAt:new Date().toISOString(),diagnosticOnly:true};if(asset)changed();
  if(asset&&!canProjectReference(H,transform,paper(),asset)){message('校準已完成，但原構圖超出新角度的投影範圍。請解鎖後按「置中適合紙面」。',true);}else message(asset?'校準完成。圖片已回到原有紙上構圖，可以調整或鎖定。':'校準完成。接著選擇一張參考圖片。');
  tab('reference');closeTools();sync();
};
$('paper').onchange=()=>{lastRegistration=null;invalidate('紙張設定已更新，請重新選角。');if(asset)changed();};
$('demo-angle').onclick=()=>{angle=1-angle;invalidate('模擬角度已改變。重新選四角後，參考圖會回到原有構圖。');tab('paper');};
function useDemo(t){camera.stop();source='demo';sw=1000;sh=750;rect=contain(sw,sh,vw,vh);invalidate(t);tab('paper');}
const camera=createCamera(video,{
  getViewport:()=>stage.getBoundingClientRect(),
  onStatus:(t,error=false)=>{message(t,error);sync();},
  onReady:({width,height,facing})=>{source='camera';sw=width;sh=height;rect=contain(sw,sh,vw,vh);invalidate(facing==='user'?'目前使用前鏡頭。請改用有後鏡頭的裝置。':'相機已開啟。固定裝置，完整露出紙張四角，再開始校準。');tab('paper');},
  onStopped:t=>useDemo(t)
});
$('camera').onclick=()=>{if(sessionUI?.busy)return;closeTools();invalidate();tab('paper');camera.start();};
$('demo').onclick=()=>useDemo('已返回模擬畫紙；參考圖與構圖保留，請重新校準。');
function suspend(){void sessionUI?.flush();cancelGesture();if(source==='camera'||camera.active)useDemo('相機因離開畫面而停止。參考構圖保留在本次頁面，請重新開啟相機並校準。');}
document.addEventListener('visibilitychange',()=>{if(document.hidden)suspend();});window.addEventListener('pagehide',suspend);
window.addEventListener('pageshow',e=>{if(e.persisted)suspend();});
window.addEventListener('orientationchange',()=>{cancelGesture();if(source==='camera'){invalidate('裝置方向改變，請重新校準四角；參考構圖保留。');tab('paper');}});
const wake=createWakeLock({shouldHold:()=>document.body.classList.contains('focus'),onStatus:t=>{$('wake-status').textContent=t;}});
$('focus').onclick=async()=>{
  document.body.classList.toggle('focus');const focused=document.body.classList.contains('focus');
  document.body.classList.remove('tools');$('focus-tools').setAttribute('aria-pressed','false');
  $('focus').textContent=focused?'離開專注 ↙':'專注畫面 ↗';
  void wake.update();
  try{if(focused&&document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();else if(!focused&&document.fullscreenElement)await document.exitFullscreen();}catch{/* Standalone / viewport focus works without Fullscreen API. */}
};
$('focus-tools').onclick=()=>document.body.classList.contains('tools')?closeTools():openTools();
$('close-tools').onclick=closeTools;
for(const name of ['paper','reference','sessions'])$(`nav-${name}`).onclick=()=>{openTools(name);if(name==='sessions')void sessionUI.refresh();};
$('stage-camera').onclick=()=>$('camera').onclick();$('stage-select').onclick=startSelection;
$('stage-undo').onclick=()=>$('undo').onclick();$('stage-confirm').onclick=()=>$('confirm').onclick();
$('stage-image').onclick=()=>{openTools('reference');$('import-image').onclick();};

$('tab-paper').onclick=()=>tab('paper');$('tab-reference').onclick=()=>tab('reference');$('tab-sessions').onclick=()=>{tab('sessions');void sessionUI.refresh();};
for(const id of ['grid','reference-grid'])$(id).onchange=()=>{$(id==='grid'?'reference-grid':'grid').checked=$(id).checked;};

function acceptAsset(next){
  if(sessionUI?.busy){next.release();return;}
  asset?.release();asset=next;transform=fitReference(paper(),asset);hidden=false;cancelGesture();
  $('reference-image').src=asset.url;$('thumbnail').src=asset.url;
  message(confirmed?'參考圖已載入。單指移動、雙指縮放與旋轉；也可使用下方微調工具。':'參考圖已載入。接著開啟相機並校準紙張四角。');tab('reference');closeTools();changed();sync();
}
$('import-image').onclick=()=>{if(sessionUI?.busy)return;cancelGesture();$('image-file').click();};
$('image-file').onchange=async()=>{
  const file=$('image-file').files?.[0];if(!file)return;
  const id=++importId;importing=true;sync();
  try{const next=await importReference(file);if(id!==importId){next.release();return;}acceptAsset(next);}catch(e){message(e.message||'無法讀取圖片，請改用 JPEG 或 PNG。',true);}finally{if(id===importId){importing=false;$('image-file').value='';sync();}}
};
$('sample-image').onclick=()=>acceptAsset({kind:'sample-vase',url:new URL('assets/vase.svg',location.href).href,width:800,height:1000,name:'花瓶輪廓 · 內建範例',release:()=>{}});
$('remove-image').onclick=()=>{if(importing||sessionUI?.busy)return;++importId;asset?.release();asset=null;transform=null;hidden=false;cancelGesture();$('reference-image').removeAttribute('src');$('thumbnail').removeAttribute('src');changed();message('參考圖已移除，已保存的作品不會因此刪除。');sync();};
for(const [id,key,factor] of [['opacity','opacity',.01],['width','widthU',.01],['rotation','rotationRad',Math.PI/180]])$(id).oninput=()=>{
  if(!asset||!confirmed||sessionUI?.busy)return;cancelGesture();
  if(key==='opacity'){transform={...transform,opacity:Number($(id).value)*factor};changed();sync();}else setTransform({...transform,[key]:Number($(id).value)*factor});
};
for(const [id,u,v] of [['left',-.01,0],['right',.01,0],['up',0,-.01],['down',0,.01]])$(id).onclick=()=>{cancelGesture();setTransform({...transform,centerU:transform.centerU+u,centerV:transform.centerV+v});};
function lock(){if(!asset||!confirmed||sessionUI?.busy)return;cancelGesture();transform={...transform,locked:!transform.locked};changed();message(transform.locked?'圖片在紙上的構圖已鎖定。固定手機後描主要輪廓；手機移動後請重新對位。':'參考圖已解鎖，可以調整構圖。');sync();}
$('lock').onclick=lock;$('quick-lock').onclick=lock;
function hide(){if(!asset||sessionUI?.busy)return;cancelGesture();hidden=!hidden;changed();sync();}
$('hide-image').onclick=hide;$('quick-hide').onclick=hide;
$('fit-image').onclick=()=>{cancelGesture();setTransform(fitReference(paper(),asset));message('參考圖已置中，並適合紙面。');};
sessionUI=createSessionUI({
  getState:()=>({paper:paper(),asset,transform,hidden,lastRegistration}),
  notify:message,
  applySession:(record,next)=>{
    ++importId;importing=false;$('image-file').value='';camera.stop();source='demo';sw=1000;sh=750;asset?.release();asset=next;transform={...record.transform};hidden=record.hidden;lastRegistration=record.lastRegistration;
    const value=`${record.paper.width},${record.paper.height}`;
    if(!Array.from($('paper').options).some(o=>o.value===value)){const o=document.createElement('option');o.value=value;o.textContent=`保存的紙張 · ${record.paper.width} × ${record.paper.height}`;$('paper').append(o);}
    $('paper').value=value;rect=contain(sw,sh,vw,vh);$('reference-image').src=asset.url;$('thumbnail').src=asset.url;invalidate();tab('paper');
  },
  resetDrawing:()=>{camera.stop();source='demo';sw=1000;sh=750;asset?.release();asset=null;transform=null;hidden=false;lastRegistration=null;++importId;importing=false;$('image-file').value='';rect=contain(sw,sh,vw,vh);$('reference-image').removeAttribute('src');$('thumbnail').removeAttribute('src');invalidate();tab('reference');}
});
$('quick-save').onclick=()=>{if(!sessionUI.current){openTools('sessions');message('請先命名並保存作品。');}else void sessionUI.save().then(ok=>{if(ok){$('camera-feedback').textContent='作品已保存';$('camera-feedback').classList.remove('error');$('camera-feedback').hidden=false;}});};
void setupPWA({hasUnsaved:()=>sessionUI.dirty,notify:message});
size();sync();draw();

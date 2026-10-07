export function createCamera(video,{onReady,onStatus,onStopped}){
  let stream=null,request=0,starting=false;
  function stop(){++request;starting=false;stream?.getTracks().forEach(t=>t.stop());stream=null;video.srcObject=null;}
  async function start(){
    if(starting)return;
    if(!navigator.mediaDevices?.getUserMedia){onStatus('此環境無法使用相機。請在 iPhone / iPad Safari 直接開啟 HTTPS 網址。',true);return;}
    stop();const id=++request;starting=true;onStatus('等待相機權限…');
    try{
      const acquired=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080}}});
      if(id!==request||document.hidden){acquired.getTracks().forEach(t=>t.stop());return;}
      stream=acquired;video.srcObject=stream;await video.play();
      if(id!==request||document.hidden){acquired.getTracks().forEach(t=>t.stop());return;}
      starting=false;
      stream.getVideoTracks()[0].addEventListener('ended',()=>{if(id===request){stop();onStopped('相機已中斷。請重新開啟並校準。');}});
      onReady({width:video.videoWidth||1920,height:video.videoHeight||1080,facing:stream.getVideoTracks()[0].getSettings().facingMode});
    }catch(e){
      if(id!==request)return;
      stop();onStopped();
      onStatus(e.name==='NotAllowedError'?'相機權限未開啟。請檢查 Safari 網站相機權限後再試。':e.name==='NotFoundError'?'找不到相機。你仍可用模擬畫紙測試。':'相機無法啟動。請關閉其他使用相機的 App，再試一次。',true);
    }
  }
  return {start,stop,get active(){return Boolean(stream)||starting;},get starting(){return starting;}};
}

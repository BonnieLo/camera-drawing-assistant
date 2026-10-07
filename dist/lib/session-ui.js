import {createSessionStore,makeSession,exportSession,importSession,restoreAsset,storageMessage} from './sessions.js';

export function createSessionUI({getState,applySession,resetDrawing,notify,store=createSessionStore(),restore=restoreAsset}){
  const $=id=>document.getElementById(id);
  let current=null,revision=0,savedRevision=0,dirty=false,saving=null,switching=false,timer=null;
  const uuid=()=>crypto.randomUUID();
  function status(t){$('save-status').textContent=t;}
  function sync(){
    const exists=Boolean(getState().asset),busy=Boolean(saving)||switching;
    const badge=$('save-badge');if(badge)badge.textContent=!exists?'':saving?'保存中':dirty?'未保存':current?'已保存':'未保存';
    $('save-session').disabled=!exists||busy;
    $('save-copy').disabled=!exists||busy;
    $('export-session').disabled=!exists||busy;
    for(const id of ['resume-session','delete-session'])$(id).disabled=busy||!$('session-list').value;
    $('new-session').disabled=busy;$('import-session').disabled=busy;
    $('save-session').textContent=saving?'正在保存…':'保存 Session';
    if(!saving)status(dirty?current?'有變更，等待保存…':'尚未保存 · 請先命名並保存':current?`已保存 · ${new Date(current.updatedAt).toLocaleString('zh-TW')}`:'先選擇參考圖片，再保存構圖。');
  }
  async function refresh(){
    try{const rows=await store.list(),selected=current?.id||$('session-list').value;
      $('session-list').replaceChildren();
      const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent=rows.length?'選擇已保存的 Session':'還沒有保存的 Session';$('session-list').append(placeholder);
      for(const row of rows){const option=document.createElement('option');option.value=row.id;option.textContent=`${row.name} · ${new Date(row.updatedAt).toLocaleDateString('zh-TW')}`;$('session-list').append(option);}
      $('session-list').value=rows.some(r=>r.id===selected)?selected:'';sync();
    }catch(e){sync();status(storageMessage(e));}
  }
  function snapshot(meta=current){
    const state=getState();if(!state.asset)throw new Error('請先選擇參考圖片。');
    const name=$('project-name').value.trim();if(!name)throw new Error('請先輸入專案名稱。');
    return makeSession({...state,id:meta?.id||uuid(),name,createdAt:meta?.createdAt});
  }
  async function save(copy=false){
    clearTimeout(timer);
    if(saving){await saving.catch(()=>{});return !dirty;}
    let record;try{record=snapshot(copy?null:current);}catch(e){status(e.message);return false;}
    const atRevision=revision;let succeeded=false;
    saving=store.save(record);sync();
    try{
      await saving;succeeded=true;current=record;savedRevision=atRevision;dirty=revision!==savedRevision;
      navigator.storage?.persist?.().catch(()=>{});
      return true;
    }catch(e){dirty=true;notify(storageMessage(e),true);return false;}
    finally{saving=null;sync();if(dirty){status('尚有未保存變更 · 請按保存重試');}await refresh();if(dirty){status('尚有未保存變更 · 請按保存重試');if(succeeded&&getState().asset&&!switching)timer=setTimeout(()=>{void save();},750);}}
  }
  function changed(){
    revision++;dirty=true;sync();clearTimeout(timer);
    if(current&&getState().asset&&!switching)timer=setTimeout(()=>{void save();},750);
  }
  async function canLeave(){
    clearTimeout(timer);if(saving)await saving.catch(()=>{});
    if(dirty&&current)await save();
    return !dirty||window.confirm('目前有尚未保存的變更。確定放棄並切換？');
  }
  async function resume(){
    const id=$('session-list').value;if(!id||switching)return;
    switching=true;sync();
    try{
      if(!await canLeave())return;
      const record=await store.get(id),next=await restore(record);
      applySession(record,next);current=record;dirty=false;revision++;savedRevision=revision;$('project-name').value=record.name;
      notify('Session 已恢復。請開啟相機，按相同實體 A–D 四角重新校準；原構圖會保留。');
    }catch(e){notify(e.message||storageMessage(e),true);}
    finally{switching=false;sync();}
  }
  async function download(){
    try{
      const record=snapshot(),blob=await exportSession(record);
      const name=record.name.replace(/[^\p{L}\p{N}_-]/gu,'_').slice(0,50)||'drawing';
      const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`${name}.paper.json`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
      notify('已開始下載 Session 備份。請確認 Safari「下載項目」或「檔案」內有 .paper.json 檔案。');
    }catch(e){notify(e.message,true);}
  }
  async function importBackup(file){
    if(!file||switching)return;switching=true;sync();
    try{
      if(!await canLeave())return;
      const record=await importSession(file),next=await restore(record);
      // Always import as a new project, never overwrite a same-ID local drawing.
      record.id=uuid();record.createdAt=record.updatedAt=new Date().toISOString();
      applySession(record,next);current=null;dirty=true;revision++;$('project-name').value=record.name;
      switching=false;
      if(await save())notify('備份已匯入並保存為新 Session。請重新校準紙張四角。');
    }catch(e){notify(e.message||'無法匯入備份，請選擇 .paper.json 檔案。',true);}
    finally{switching=false;$('session-file').value='';sync();}
  }
  $('save-session').onclick=()=>save();$('save-copy').onclick=()=>save(true);
  $('project-name').oninput=changed;
  $('session-list').onchange=sync;$('resume-session').onclick=resume;
  $('new-session').onclick=async()=>{
    if(switching)return;switching=true;sync();
    try{if(!await canLeave())return;resetDrawing();current=null;dirty=false;revision++;savedRevision=revision;$('project-name').value='未命名作品';notify('已開始新作品。選擇圖片並校準紙張。');}finally{switching=false;sync();}
  };
  $('delete-session').onclick=async()=>{
    const id=$('session-list').value;if(!id||!window.confirm('刪除這個本機 Session？如需保留，請先恢復並匯出備份。'))return;
    switching=true;sync();
    try{await store.delete(id);if(current?.id===id){current=null;dirty=Boolean(getState().asset);clearTimeout(timer);}notify('已刪除本機 Session；目前畫面中的構圖保留。');await refresh();}catch(e){notify(storageMessage(e),true);}finally{switching=false;sync();}
  };
  $('export-session').onclick=download;$('import-session').onclick=()=>$('session-file').click();
  $('session-file').onchange=()=>importBackup($('session-file').files?.[0]);
  window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
  sync();void refresh();
  return {changed,sync,save,refresh,importBackup,get dirty(){return dirty;},get busy(){return switching;},get current(){return current;},flush(){if(current&&dirty&&!saving)return save();return saving?.catch(()=>{})||Promise.resolve();}};
}

// A whole session (metadata + Blob) is one IndexedDB value and one atomic write.
export const SCHEMA_VERSION=1;
const MAX_IMAGE=16*1024*1024,MAX_BACKUP=24*1024*1024;
const bad=()=>{throw new Error('Session 格式無效或版本不相容，請使用本 App 匯出的備份。');};
export function validateSession(s){
  if(!s||s.schemaVersion!==SCHEMA_VERSION||typeof s.id!=='string'||!s.id||s.id.length>100||typeof s.name!=='string'||!s.name.trim()||s.name.length>80)bad();
  for(const key of ['createdAt','updatedAt'])if(typeof s[key]!=='string'||!Number.isFinite(Date.parse(s[key])))bad();
  const p=s.paper,t=s.transform,i=s.image;
  if(!p||![p.width,p.height].every(v=>Number.isFinite(v)&&v>0&&v<=5000)||p.width/p.height<.1||p.width/p.height>10||p.orientationAnchor!=='A')bad();
  if(!t||![t.centerU,t.centerV,t.widthU,t.rotationRad,t.opacity].every(Number.isFinite)||t.centerU<0||t.centerU>1||t.centerV<0||t.centerV>1||t.widthU<.02||t.widthU>3||Math.abs(t.rotationRad)>Math.PI+1e-10||t.opacity<0||t.opacity>1||typeof t.locked!=='boolean')bad();
  if(!i||typeof i.name!=='string'||i.name.length>255||![i.width,i.height].every(v=>Number.isInteger(v)&&v>0&&v<=2048))bad();
  if(i.kind==='sample-vase'){if(i.width!==800||i.height!==1000||i.blob)bad();}
  else if(i.kind==='photo'){
    if(!(i.blob instanceof Blob)||!['image/png','image/jpeg','image/webp'].includes(i.blob.type)||!i.blob.size||i.blob.size>MAX_IMAGE)bad();
  }else bad();
  if(typeof s.hidden!=='boolean')bad();
  if(s.lastRegistration!==null){const r=s.lastRegistration;
    if(!r||r.diagnosticOnly!==true||!Array.isArray(r.corners)||r.corners.length!==4||!r.corners.every(c=>Array.isArray(c)&&c.length===2&&c.every(v=>Number.isFinite(v)&&v>=0&&v<=1))||!Array.isArray(r.homography)||r.homography.length!==9||!r.homography.every(Number.isFinite)||!r.cameraFrame||![r.cameraFrame.width,r.cameraFrame.height].every(v=>Number.isFinite(v)&&v>0)||!['camera','demo'].includes(r.source)||!Number.isFinite(Date.parse(r.capturedAt)))bad();
  }
  return s;
}
export function makeSession({id,name,createdAt,paper,transform,asset,hidden=false,lastRegistration=null,now=new Date().toISOString()}){
  return validateSession({schemaVersion:SCHEMA_VERSION,id,name:name.trim(),createdAt:createdAt||now,updatedAt:now,paper:{...paper,unit:'mm',orientationAnchor:'A'},transform:{...transform},hidden,
    image:asset.kind==='sample-vase'?{kind:'sample-vase',name:asset.name,width:800,height:1000}:{kind:'photo',name:asset.name.slice(0,255),width:asset.width,height:asset.height,blob:asset.blob},lastRegistration:lastRegistration?structuredClone(lastRegistration):null});
}
export function storageMessage(e){
  if(e?.name==='QuotaExceededError')return '儲存空間不足，這次沒有保存。請先匯出備份，再清理舊 Session。';
  if(e?.name==='VersionError')return 'Session 資料庫版本較新，請更新 App 後再試。';
  return e?.message?.startsWith('Session 格式')?e.message:'無法使用本機儲存，這次沒有保存。請匯出備份，並確認不是私密瀏覽。';
}
export function createSessionStore(indexedDB=globalThis.indexedDB){
  let connection=null;
  async function open(){
    if(!indexedDB)throw new Error('IndexedDB unavailable');
    if(!connection)connection=new Promise((resolve,reject)=>{
      const request=indexedDB.open('paper-drawing-assistant',SCHEMA_VERSION);let settled=false;
      request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('sessions'))request.result.createObjectStore('sessions',{keyPath:'id'});};
      request.onerror=()=>{settled=true;connection=null;reject(request.error);};
      request.onblocked=()=>{settled=true;connection=null;reject(new Error('請關閉其他 Paper 分頁後再試。'));};
      request.onsuccess=()=>{const db=request.result;if(settled){db.close();return;}db.onversionchange=()=>{db.close();connection=null;};db.onclose=()=>{connection=null;};resolve(db);};
    });
    return connection;
  }
  async function run(mode,operation){
    const db=await open();
    return new Promise((resolve,reject)=>{
      let result;const tx=db.transaction('sessions',mode);
      // Never report success on request.onsuccess: the transaction can still abort.
      tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(tx.error||new Error('保存已中止。'));tx.onerror=()=>{};
      try{const req=operation(tx.objectStore('sessions'));req.onsuccess=()=>{result=req.result;};}catch(e){tx.abort();reject(e);}
    });
  }
  return {
    async save(record){validateSession(record);await run('readwrite',store=>store.put(record));return record;},
    async get(id){const s=await run('readonly',store=>store.get(id));if(!s)throw new Error('找不到這個 Session，可能已在其他分頁刪除。');return validateSession(s);},
    async list(){const rows=await run('readonly',store=>store.getAll());return rows.map(({id,name,updatedAt})=>({id,name,updatedAt})).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));},
    async delete(id){await run('readwrite',store=>store.delete(id));}
  };
}
function bytesToBase64(bytes){let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(binary);}
export async function exportSession(record){
  validateSession(record);const {blob,...image}=record.image;
  if(blob){image.data=bytesToBase64(new Uint8Array(await blob.arrayBuffer()));image.mimeType=blob.type;}
  return new Blob([JSON.stringify({format:'paper-drawing-session',session:{...record,image}})],{type:'application/json'});
}
export async function importSession(file){
  if(file.size>MAX_BACKUP)throw new Error('備份超過 24 MB，請選擇較小的 Session 備份。');
  let envelope;try{envelope=JSON.parse(await file.text());}catch{bad();}
  if(envelope?.format!=='paper-drawing-session'||!envelope.session?.image)bad();
  const s=envelope.session,i=s.image;
  if(i.kind==='photo'){
    if(typeof i.data!=='string'||i.data.length>Math.ceil(MAX_IMAGE/3)*4||!['image/png','image/jpeg','image/webp'].includes(i.mimeType))bad();
    let binary;try{binary=atob(i.data);}catch{bad();}
    const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
    i.blob=new Blob([bytes],{type:i.mimeType});delete i.data;delete i.mimeType;
  }
  return validateSession(s);
}
export async function restoreAsset(s){
  validateSession(s);
  if(s.image.kind==='sample-vase')return {...s.image,url:new URL('../assets/vase.svg',import.meta.url).href,release:()=>{}};
  const url=URL.createObjectURL(s.image.blob),image=new Image();
  try{await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error('備份圖片無法解碼，原 Session 未更動。'));image.src=url;});
    if(image.naturalWidth!==s.image.width||image.naturalHeight!==s.image.height)throw new Error('備份圖片尺寸不符，原 Session 未更動。');
    return {...s.image,url,release:()=>URL.revokeObjectURL(url)};
  }catch(e){URL.revokeObjectURL(url);throw e;}
}

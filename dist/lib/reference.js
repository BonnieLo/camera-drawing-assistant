import {project,inverse} from './homography.js';

export function multiply(a,b){
  const out=Array(9).fill(0);
  for(let row=0;row<3;row++)for(let col=0;col<3;col++)for(let k=0;k<3;k++)out[row*3+col]+=a[row*3+k]*b[k*3+col];
  return out;
}
export function fitReference(paper,image){
  const widthU=Math.min(.72,.72*(paper.height/paper.width)*(image.width/image.height));
  return {centerU:.5,centerV:.5,widthU,rotationRad:0,opacity:.45,locked:false};
}
export function constrainTransform(t){
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  return {...t,centerU:clamp(t.centerU,0,1),centerV:clamp(t.centerV,0,1),widthU:clamp(t.widthU,.02,3),rotationRad:Math.atan2(Math.sin(t.rotationRad),Math.cos(t.rotationRad)),opacity:clamp(t.opacity,0,1)};
}
// Rotate in physical paper metric before normalizing back to u/v.
export function referenceMatrix(t,paper,image){
  const scale=t.widthU*paper.width/image.width,c=Math.cos(t.rotationRad),s=Math.sin(t.rotationRad);
  return [
    scale*c/paper.width,-scale*s/paper.width,t.centerU-scale*(c*image.width-s*image.height)/(2*paper.width),
    scale*s/paper.height,scale*c/paper.height,t.centerV-scale*(s*image.width+c*image.height)/(2*paper.height),
    0,0,1
  ];
}
export function displayMatrix(h,rect,t,paper,image){
  const viewport=[rect.width,0,rect.x,0,rect.height,rect.y,0,0,1];
  return multiply(viewport,multiply(h,referenceMatrix(t,paper,image)));
}
export function cssMatrix3d(h){
  return [h[0],h[3],0,h[6],h[1],h[4],0,h[7],0,0,1,0,h[2],h[5],0,h[8]];
}
export function canProjectReference(h,t,paper,image){
  const m=multiply(h,referenceMatrix(t,paper,image));
  return [[0,0],[image.width,0],[image.width,image.height],[0,image.height]].every(([x,y])=>m[6]*x+m[7]*y+m[8]>1e-5);
}
export function displayToPaperMetric(p,h,rect,paper){
  const [u,v]=project(inverse(h),[(p[0]-rect.x)/rect.width,(p[1]-rect.y)/rect.height]);
  return [u*paper.width,v*paper.height];
}

export async function importReference(file){
  if(!file || (!file.type.startsWith('image/')&&!/\.(heic|heif|jpe?g|png|webp)$/i.test(file.name)) || /svg/i.test(file.type)||/\.svg$/i.test(file.name))throw new Error('請選擇照片或 PNG、JPEG、WebP 圖片。');
  if(file.size>40*1024*1024)throw new Error('這張圖片超過 40 MB，請先輸出較小的圖片。');
  let decoded,cleanup;
  try{
    if(typeof createImageBitmap==='function'){
      try{decoded=await createImageBitmap(file,{imageOrientation:'from-image'});cleanup=()=>decoded.close();}catch{/* Safari image decode fallback below. */}
    }
    if(!decoded){
      const url=URL.createObjectURL(file),image=new Image();
      try{await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error('Safari 無法讀取這個格式，請改用 JPEG 或 PNG。'));image.src=url;});}finally{URL.revokeObjectURL(url);}
      decoded=image;cleanup=()=>{};
    }
    const w=decoded.width||decoded.naturalWidth,h=decoded.height||decoded.naturalHeight;
    if(!w||!h||w*h>60_000_000)throw new Error('圖片尺寸過大或無效，請先輸出較小的圖片。');
    const ratio=Math.min(1,2048/Math.max(w,h)),canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(w*ratio));canvas.height=Math.max(1,Math.round(h*ratio));
    const ctx=canvas.getContext('2d');if(!ctx)throw new Error('無法處理圖片，請重新開啟頁面。');
    ctx.drawImage(decoded,0,0,canvas.width,canvas.height);
    const mime=/png|gif|webp/i.test(file.type)?'image/png':'image/jpeg';
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,mime,.9));
    if(!blob)throw new Error('圖片處理失敗，請試較小的 JPEG 或 PNG。');
    const asset={blob,width:canvas.width,height:canvas.height,name:file.name,url:URL.createObjectURL(blob)};
    asset.release=()=>URL.revokeObjectURL(asset.url);
    canvas.width=1;canvas.height=1;
    return asset;
  }finally{cleanup?.();}
}

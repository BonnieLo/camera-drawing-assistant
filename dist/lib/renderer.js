import {toDisplay} from './homography.js';
import {displayMatrix,cssMatrix3d,canProjectReference} from './reference.js';

export function renderReference(layer,img,{h,corners,rect,transform,paper,asset,visible}){
  if(!visible||!h||!asset||!canProjectReference(h,transform,paper,asset)){layer.hidden=true;return;}
  layer.hidden=false;
  layer.style.clipPath=`polygon(${corners.map(p=>toDisplay(p,rect).map(v=>`${v}px`).join(' ')).join(',')})`;
  img.style.width=`${asset.width}px`;img.style.height=`${asset.height}px`;
  img.style.opacity=String(transform.opacity);
  img.style.transform=`matrix3d(${cssMatrix3d(displayMatrix(h,rect,transform,paper,asset)).join(',')})`;
}

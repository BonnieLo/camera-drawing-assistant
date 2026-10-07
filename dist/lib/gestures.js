import {constrainTransform} from './reference.js';
const midpoint=(a,b)=>[(a[0]+b[0])/2,(a[1]+b[1])/2];
const distance=(a,b)=>Math.hypot(b[0]-a[0],b[1]-a[1]);
const angle=(a,b)=>Math.atan2(b[1]-a[1],b[0]-a[0]);

// Every point is in physical paper units. No viewport-pixel deltas are persisted.
export class PaperGestures {
  constructor({getTransform,setTransform,getPaper}){this.getTransform=getTransform;this.setTransform=setTransform;this.getPaper=getPaper;this.points=new Map();this.baseline=null;}
  reset(){this.points.clear();this.baseline=null;}
  rebase(){this.baseline=this.points.size?{points:[...this.points.values()].map(p=>[...p]),transform:{...this.getTransform()}}:null;}
  begin(id,p){if(this.getTransform()?.locked||this.points.size>=2)return false;this.points.set(id,p);this.rebase();return true;}
  move(id,p){
    if(!this.points.has(id)||!this.baseline)return false;
    if(this.getTransform()?.locked){this.reset();return false;}
    this.points.set(id,p);const now=[...this.points.values()],start=this.baseline.points,t=this.baseline.transform,paper=this.getPaper();
    let center=[t.centerU*paper.width,t.centerV*paper.height],width=t.widthU,rotation=t.rotationRad;
    if(now.length===1){center=center.map((v,i)=>v+now[0][i]-start[0][i]);}
    else{
      const initialDistance=distance(...start);if(initialDistance<1e-6){this.rebase();return false;}
      const k=distance(...now)/initialDistance,delta=angle(...now)-angle(...start),a=midpoint(...start),b=midpoint(...now),c=Math.cos(delta),s=Math.sin(delta),offset=[center[0]-a[0],center[1]-a[1]];
      center=[b[0]+k*(c*offset[0]-s*offset[1]),b[1]+k*(s*offset[0]+c*offset[1])];width*=k;rotation+=delta;
    }
    this.setTransform(constrainTransform({...t,centerU:center[0]/paper.width,centerV:center[1]/paper.height,widthU:width,rotationRad:rotation}));return true;
  }
  end(id){if(!this.points.delete(id))return;this.rebase();}
}

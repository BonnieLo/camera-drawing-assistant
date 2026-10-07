// All input/output points use normalized camera-image coordinates, not CSS pixels.
export const UNIT_CORNERS = [[0,0],[1,0],[1,1],[0,1]];

export function validateQuad(q) {
  if (!Array.isArray(q) || q.length !== 4 || q.some(p => !Array.isArray(p) || p.length !== 2 || p.some(v=>!Number.isFinite(v)))) throw new Error('請完成四個角。');
  if (q.some(p=>p.some(v=>v<0 || v>1))) throw new Error('四角必須位於相機畫面內。');
  let area = 0;
  for (let i=0;i<4;i++) {
    const a=q[i], b=q[(i+1)%4], c=q[(i+2)%4];
    const cross=(b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]);
    if (cross <= 1e-5) throw new Error('請依 A → B → C → D 順時針選角，避免交叉或幾乎重疊。');
    area += a[0]*b[1]-a[1]*b[0];
    if (Math.hypot(b[0]-a[0],b[1]-a[1])<0.02) throw new Error('角落太接近，請讓紙張更清楚地進入畫面。');
  }
  if (area/2<0.015) throw new Error('紙張區域太小，請靠近一點後重新選角。');
  return true;
}

function solve(a,b) {
  const m=a.map((r,i)=>[...r,b[i]]), n=b.length;
  for(let col=0;col<n;col++) {
    let pivot=col;
    for(let r=col+1;r<n;r++) if(Math.abs(m[r][col])>Math.abs(m[pivot][col])) pivot=r;
    if(Math.abs(m[pivot][col])<1e-10) throw new Error('這組角落無法可靠校準，請重新選角。');
    [m[pivot],m[col]]=[m[col],m[pivot]];
    const divisor=m[col][col];
    for(let j=col;j<=n;j++) m[col][j]/=divisor;
    for(let r=0;r<n;r++) if(r!==col) {
      const factor=m[r][col];
      for(let j=col;j<=n;j++) m[r][j]-=factor*m[col][j];
    }
  }
  return m.map(r=>r[n]);
}

export function homography(q) {
  validateQuad(q);
  const a=[], b=[];
  UNIT_CORNERS.forEach(([x,y],i)=>{
    const [u,v]=q[i];
    a.push([x,y,1,0,0,0,-u*x,-u*y]); b.push(u);
    a.push([0,0,0,x,y,1,-v*x,-v*y]); b.push(v);
  });
  return [...solve(a,b),1];
}
export function project(h,[x,y]) {
  const w=h[6]*x+h[7]*y+h[8];
  if(!Number.isFinite(w) || Math.abs(w)<1e-10) throw new Error('投影超出有效範圍。');
  return [(h[0]*x+h[1]*y+h[2])/w,(h[3]*x+h[4]*y+h[5])/w];
}
export function inverse(h) {
  const [a,b,c,d,e,f,g,i,j]=h;
  const cof=[e*j-f*i,c*i-b*j,b*f-c*e,f*g-d*j,a*j-c*g,c*d-a*f,d*i-e*g,b*g-a*i,a*e-b*d];
  const det=a*cof[0]+b*cof[3]+c*cof[6];
  if(Math.abs(det)<1e-12) throw new Error('不可逆的投影。');
  return cof.map(v=>v/det);
}
export function contain(sw,sh,vw,vh) {
  const scale=Math.min(vw/sw,vh/sh);
  return {x:(vw-sw*scale)/2,y:(vh-sh*scale)/2,width:sw*scale,height:sh*scale};
}
export function toDisplay([u,v],rect) { return [rect.x+u*rect.width,rect.y+v*rect.height]; }
export function fromDisplay([x,y],rect) { return [(x-rect.x)/rect.width,(y-rect.y)/rect.height]; }

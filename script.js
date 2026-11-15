const $=s=>document.querySelector(s);$('#yr').textContent=new Date().getFullYear();
// Lens engine: softened point-mass deflection beta = theta - E^2 theta/(r^2+s^2), windowed to fade to zero at the patch edge
const bg=$('#bg'),bx=bg.getContext('2d'),sc=document.createElement('canvas'),sp=sc.getContext('2d',{willReadFrequently:true});
const pc=$('#ptc'),pw=$('.pt'),px=pc.getContext('2d'),ps=document.createElement('canvas'),pp=ps.getContext('2d',{willReadFrequently:true});
const R=200,E0=64,S=22,patchB=bx.createImageData(2*R,2*R),patchP=px.createImageData(2*R,2*R);
let GL=null,gcv,gU;
(function(){try{const c=document.createElement('canvas');c.setAttribute('aria-hidden','true');c.style.cssText='position:fixed;inset:0;width:100%;height:100%;z-index:0';
  const g=c.getContext('webgl',{antialias:false,alpha:false});if(!g)return;
  const sh=(t,x)=>{const o=g.createShader(t);g.shaderSource(o,x);g.compileShader(o);if(!g.getShaderParameter(o,g.COMPILE_STATUS))throw 1;return o},pr=g.createProgram();
  g.attachShader(pr,sh(g.VERTEX_SHADER,'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}'));
  g.attachShader(pr,sh(g.FRAGMENT_SHADER,`precision highp float;uniform sampler2D t;uniform vec2 res,L;uniform float E,Rr;uniform vec4 w[4];
void main(){vec2 p=vec2(gl_FragCoord.x,res.y-gl_FragCoord.y),o=vec2(0.);float gw=0.;
for(int i=0;i<4;i++){vec4 k=w[i];if(k.w>0.){vec2 d=p-k.xy;float r=length(d)+1e-3,s=34.+.027*k.z,e=(r-k.z)/s,x=exp(-e*e);o+=d/r*k.w*e*x;gw+=x*k.w;}}
vec2 d=p-L;float r2=dot(d,d),u=clamp((sqrt(r2)/Rr-.45)/.55,0.,1.),wn=1.-u*u*(3.-2.*u),f=1.-wn*E*E/(r2+484.);
vec3 c=texture2D(t,(L+d*f+o)/res).rgb;c=c*(1.+gw*.011)+vec3(.30,.26,.85)*gw*.006;
float rg=(sqrt(r2)-E)/1.4;c+=vec3(.89,.66,.34)*.35*exp(-rg*rg);gl_FragColor=vec4(c,1.);}`));
  g.linkProgram(pr);if(!g.getProgramParameter(pr,g.LINK_STATUS))throw 1;g.useProgram(pr);
  g.bindBuffer(g.ARRAY_BUFFER,g.createBuffer());g.bufferData(g.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),g.STATIC_DRAW);
  const a=g.getAttribLocation(pr,'a');g.enableVertexAttribArray(a);g.vertexAttribPointer(a,2,g.FLOAT,false,0,0);
  g.bindTexture(g.TEXTURE_2D,g.createTexture());for(const k of[g.TEXTURE_WRAP_S,g.TEXTURE_WRAP_T])g.texParameteri(g.TEXTURE_2D,k,g.CLAMP_TO_EDGE);
  g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MIN_FILTER,g.LINEAR);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MAG_FILTER,g.LINEAR);
  gU={res:g.getUniformLocation(pr,'res'),L:g.getUniformLocation(pr,'L'),E:g.getUniformLocation(pr,'E'),Rr:g.getUniformLocation(pr,'Rr'),w:g.getUniformLocation(pr,'w')};
  document.body.insertBefore(c,document.getElementById('bg'));document.getElementById('bg').style.display='none';gcv=c;GL=g}catch(e){GL=null}})();
const rings=[],od=[0,0];let rbuf,rc,rx,enabled=true,W=0,H=0,bgPix,ptPix,dirty=true;
const m={x:-1e3,y:-1e3,t:-1e9},kick={t:-1e9};
function lens(ctx,patch,pix,sw,sh,lx,ly,E,rp){
  const d=patch.data,L=Math.floor(lx)-R,T=Math.floor(ly)-R,D=2*R;
  for(let j=0;j<D;j++){const yy=T+j;if(yy<0||yy>=sh)continue;
    for(let i=0;i<D;i++){const xx=L+i;if(xx<0||xx>=sw)continue;
      const dx=xx-lx,dy=yy-ly,r2=dx*dx+dy*dy,u=Math.min(1,Math.max(0,(Math.sqrt(r2)/R-.45)/.55)),w=1-u*u*(3-2*u),f=1-w*E*E/(r2+S*S);
      if(rp)disp(xx,yy,od);else{od[0]=od[1]=0}const x=Math.max(0,Math.min(sw-1.001,lx+dx*f+od[0])),y=Math.max(0,Math.min(sh-1.001,ly+dy*f+od[1])),ix=x|0,iy=y|0,fx=x-ix,fy=y-iy;
      const a=(iy*sw+ix)*4,b=a+4,c=a+sw*4,e=c+4,o=(j*D+i)*4;
      for(let k=0;k<3;k++)d[o+k]=(pix[a+k]*(1-fx)+pix[b+k]*fx)*(1-fy)+(pix[c+k]*(1-fx)+pix[e+k]*fx)*fy;
      d[o+3]=255;}}
  ctx.putImageData(patch,L,T);
}
function buildBG(){
  W=innerWidth;H=innerHeight;bg.width=sc.width=W;bg.height=sc.height=H;
  sp.fillStyle='#0A0912';sp.fillRect(0,0,W,H);
  const hz=sp.createRadialGradient(W*.7,H*.35,0,W*.7,H*.35,Math.max(W,H)*.8);hz.addColorStop(0,'rgba(123,110,246,.18)');hz.addColorStop(1,'rgba(123,110,246,0)');sp.fillStyle=hz;sp.fillRect(0,0,W,H);
  sp.strokeStyle='rgba(167,159,189,.17)';sp.lineWidth=.7;sp.beginPath();
  for(let g=0;g<W;g+=64){sp.moveTo(g,0);sp.lineTo(g,H)}for(let g=0;g<H;g+=64){sp.moveTo(0,g);sp.lineTo(W,g)}sp.stroke();
  let s=49273;const r=()=>(s=(s*1664525+1013904223)>>>0)/4294967296;
  for(let i=0,n=Math.min(1800,Math.max(400,W*H/2200|0));i<n;i++){sp.fillStyle=`rgba(243,239,234,${.4+r()*.55})`;sp.beginPath();sp.arc(r()*W,r()*H,.5+r()*1.3,0,6.2832);sp.fill()}
  for(let i=0;i<9;i++){sp.save();sp.translate(r()*W,r()*H);sp.rotate(r()*3.14);sp.scale(1,.35);const z=35+r()*55,g=sp.createRadialGradient(0,0,0,0,0,z);
    g.addColorStop(0,'rgba(243,239,234,.35)');g.addColorStop(.2,'rgba(227,168,87,.16)');g.addColorStop(1,'rgba(123,110,246,0)');sp.fillStyle=g;sp.fillRect(-z,-z,2*z,2*z);sp.restore()}
  bgPix=sp.getImageData(0,0,W,H).data;if(GL){gcv.width=W;gcv.height=H;GL.viewport(0,0,W,H);GL.texImage2D(GL.TEXTURE_2D,0,GL.RGBA,GL.RGBA,GL.UNSIGNED_BYTE,sc)}bx.drawImage(sc,0,0);rbuf=new ImageData(W,H);rc=document.createElement('canvas');rc.width=W;rc.height=H;rx=rc.getContext('2d');dirty=true;
}
function buildPT(){
  const im=$('#ptimg'),w=ps.width=380,h=ps.height=460,z=1.45,ox=w/2,oy=h*.45;
  const k=Math.max(w/im.naturalWidth,h/im.naturalHeight),iw=im.naturalWidth*k,ih=im.naturalHeight*k,x0=(w-iw)/2,y0=(h-ih)/2;
  pp.fillStyle='#0d0b1a';pp.fillRect(0,0,w,h);pp.drawImage(im,ox+(x0-ox)*z,oy+(y0-oy)*z,iw*z,ih*z);ptPix=pp.getImageData(0,0,w,h).data;
}
const waves=[];let pOn=false,org=null;
function disp(x,y,o){let ox=0,oy=0;for(const g of rings){const dx=x-g.x,dy=y-g.y,r=Math.sqrt(dx*dx+dy*dy)||1,d=(r-g.r)/g.s;if(d>-3&&d<3){const f=g.a*d*Math.exp(-d*d);ox+=dx/r*f;oy+=dy/r*f}}o[0]=ox;o[1]=oy}
function ripples(){
  const d=rbuf.data,o=[0,0];d.fill(0);
  for(const g of rings){const Ro=g.r+3*g.s,Ri=Math.max(0,g.r-3*g.s),ya=Math.max(0,Math.floor(g.y-Ro)),yb=Math.min(H-1,Math.ceil(g.y+Ro));
    for(let y=ya;y<=yb;y++){const dy=y-g.y,xo=Math.sqrt(Math.max(0,Ro*Ro-dy*dy)),xi=Math.abs(dy)<Ri?Math.sqrt(Ri*Ri-dy*dy):0;
      for(const [a,b] of [[g.x-xo,g.x-xi],[g.x+xi,g.x+xo]])for(let x=Math.max(0,Math.ceil(a)),e=Math.min(W-1,b);x<=e;x++){
        disp(x,y,o);const sx=Math.max(0,Math.min(W-1.001,x+o[0])),sy=Math.max(0,Math.min(H-1.001,y+o[1])),ix=sx|0,iy=sy|0,fx=sx-ix,fy=sy-iy,p=(iy*W+ix)*4,q=p+4,r=p+W*4,t=r+4,u=(y*W+x)*4;
        for(let k=0;k<3;k++)d[u+k]=(bgPix[p+k]*(1-fx)+bgPix[q+k]*fx)*(1-fy)+(bgPix[r+k]*(1-fx)+bgPix[t+k]*fx)*fy;d[u+3]=255}}}
  rx.putImageData(rbuf,0,0);
}
function frame(now){requestAnimationFrame(frame);try{draw(now)}catch(e){console.error(e)}}
function draw(now){
  if(document.hidden||!bgPix)return;
  if(!enabled){if(dirty){bx.drawImage(sc,0,0);px.clearRect(0,0,380,460);pOn=false;dirty=false}return}
  let lx=m.x,ly=m.y;
  if(now-m.t>2500){lx=W*(.5+.36*Math.sin(now/3100));ly=H*(.5+.3*Math.sin(now/2300+1))}
  const p=(now-kick.t)/1300,k=p>=0&&p<1?Math.sin(Math.PI*p):0;
  const o=kick.o;if(o&&k>0){const b=Math.min(1,k*4);lx+=(o.x-lx)*b;ly+=(o.y-ly)*b}const E=E0;
  rings.length=0;
  for(let i=waves.length-1;i>=0;i--){const w=waves[i],q=(now-w.t)/2400;if(q>=1){waves.splice(i,1);continue}if(q<0)continue;
    const r=q*Math.max(W,H)*.8,a=42*Math.pow(1-q,1.2),sg=34+.027*r;rings.push({x:w.x,y:w.y,r,a,s:sg})}
  if(GL){const v=new Float32Array(16);rings.slice(0,4).forEach((g,i)=>v.set([g.x,g.y,g.r,g.a],i*4));
    GL.uniform2f(gU.res,W,H);GL.uniform2f(gU.L,lx,ly);GL.uniform1f(gU.E,E);GL.uniform1f(gU.Rr,R);GL.uniform4fv(gU.w,v);GL.drawArrays(GL.TRIANGLE_STRIP,0,4)}
  else{bx.drawImage(sc,0,0);if(rings.length){ripples();bx.drawImage(rc,0,0)}lens(bx,patchB,bgPix,W,H,lx,ly,E,1);
  bx.strokeStyle='rgba(227,168,87,.35)';bx.lineWidth=1;bx.beginPath();bx.arc(lx,ly,E,0,6.2832);bx.stroke()}
  const r=pw.getBoundingClientRect(),near=r.width>0&&k===0&&now-m.t<2500&&m.x>r.left-R&&m.x<r.right+R&&m.y>r.top-R&&m.y<r.bottom+R;
  if(near){const q=pc.width/r.width;px.drawImage(ps,0,0);lens(px,patchP,ptPix,pc.width,pc.height,(m.x-r.left)*q,(m.y-r.top)*q,E0*.7*q);pOn=true}
  else if(pOn){px.clearRect(0,0,pc.width,pc.height);pOn=false}
}
document.addEventListener('click',e=>{const a=e.target.closest('a[href^="#"]');if(!a)return;const r=a.getBoundingClientRect();org={x:e.clientX||r.left+r.width/2,y:e.clientY||r.top+r.height/2};const t=performance.now();for(let i=0;i<2;i++)waves.push({x:org.x,y:org.y,t:t+i*260})},true);
addEventListener('pointerdown',e=>{if(!e.target.closest('a,button,input,label,canvas'))waves.push({x:e.clientX,y:e.clientY,t:performance.now()})});
addEventListener('pointermove',e=>{if(e.pointerType==='mouse'){m.x=e.clientX;m.y=e.clientY;m.t=performance.now()}},{passive:true});
document.addEventListener('mouseleave',()=>{m.t=-1e9});addEventListener('resize',buildBG);
buildBG();const ph=$('#ptimg');ph.complete&&ph.naturalWidth?buildPT():ph.onload=buildPT;requestAnimationFrame(frame);

// Pages: hash routing. Each nav click opens a new page and sends the lens sweeping across the sky.
const names={home:'Home',about:'About',research:'Research',projects:'Projects',contact:'Contact'};
async function lensIn(el,cx,cy,ms){
  try{const w=el.offsetWidth,h=el.offsetHeight,k=.25,mw=Math.max(2,w*k|0),mh=Math.max(2,h*k|0),c=document.createElement('canvas');c.width=mw;c.height=mh;
    const g=c.getContext('2d'),im=g.createImageData(mw,mh),d=im.data,Rm=460*k,ox=cx*k,oy=cy*k,cl=v=>Math.max(-1,Math.min(1,v));
    for(let j=0;j<mh;j++)for(let i=0;i<mw;i++){const dx=i-ox,dy=j-oy,r=Math.hypot(dx,dy)/Rm,q=r<2.2?Math.exp(-r*r*1.5):0,o=(j*mw+i)*4;d[o]=128+127*cl(-dx/Rm*q*1.6);d[o+1]=128+127*cl(-dy/Rm*q*1.6);d[o+2]=128;d[o+3]=255}
    g.putImageData(im,0,0);const F=$('#lensf'),I=$('#lfi'),D=$('#lfd');
    for(const n of[F,I]){n.setAttribute('width',w);n.setAttribute('height',h)}I.setAttribute('href',c.toDataURL());D.setAttribute('scale','0');
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));el.style.filter='url(#lensf)';
    await new Promise(res=>{const t0=performance.now();(function f(t){const p=Math.min(1,(t-t0)/ms),e=1-Math.pow(1-p,3);D.setAttribute('scale',String(300*(1-e)));el.style.opacity=Math.min(1,p*2.2);p<1?requestAnimationFrame(f):res()})(t0)})
  }catch(e){}finally{el.style.filter='';el.style.opacity=''}
}
let cur=null,busy=false;
const mark=id=>document.querySelectorAll('.nav nav a').forEach(a=>a.classList.toggle('on',a.getAttribute('href')==='#'+id));
function setPage(id){
  document.querySelectorAll('.page').forEach(p=>p.hidden=p.id!=='p-'+id);mark(id);cur=id;
  document.title=(id==='home'?'':names[id]+' – ')+'Chris Gade';scrollTo(0,0);dirty=true;
}
// Transition: the old page is swallowed by the lens (it shrinks toward the center while the lens swells),
// then the new page is born from the Einstein ring as it expands across the sky.
async function route(){
  const id=names[location.hash.slice(1)]?location.hash.slice(1):'home';
  if(id===cur||busy)return;
  if(cur===null||matchMedia('(prefers-reduced-motion: reduce)').matches){setPage(id);kick.t=performance.now();return}
  busy=true;kick.t=performance.now();kick.o=org||{x:innerWidth/2,y:innerHeight/2};org=null;mark(id);
  const from=$('#p-'+cur);
  await from.animate([{opacity:1,filter:'blur(0px)'},{opacity:0,filter:'blur(7px)'}],{duration:320,easing:'ease-in',fill:'forwards'}).finished;
  from.getAnimations().forEach(a=>a.cancel());setPage(id);
  const to=$('#p-'+id);to.style.opacity=0;const rc2=to.getBoundingClientRect();await lensIn(to,kick.o.x-rc2.left,kick.o.y-rc2.top,1200);
  busy=false;route();
}
addEventListener('hashchange',route);route();

// Lens model demo: SIS + external shear, backward ray tracing; the source is a Gaussian galaxy
const dc=$('#demo'),dx=dc.getContext('2d'),di=dx.createImageData(340,340),src={x:14,y:-9};
function demo(){
  const E=+$('#e').value,g=+$('#g').value,A=+$('#a').value*Math.PI/90,g1=g*Math.cos(A),g2=g*Math.sin(A),d=di.data;
  for(let y=0;y<340;y++)for(let x=0;x<340;x++){
    const tx=x-170,ty=y-170,r=Math.hypot(tx,ty)||1,u=tx-E*tx/r-(g1*tx+g2*ty),v=ty-E*ty/r-(g2*tx-g1*ty);
    const q=Math.exp(-((u-src.x)**2+(v-src.y)**2)/162),o=(y*340+x)*4;
    d[o]=10+q*245;d[o+1]=9+q*170;d[o+2]=18+q*80;d[o+3]=255}
  dx.putImageData(di,0,0);dx.strokeStyle='rgba(123,110,246,.9)';dx.lineWidth=1.5;dx.beginPath();dx.arc(170+src.x,170+src.y,5,0,6.2832);dx.stroke();
}
function mv(e){const r=dc.getBoundingClientRect();src.x=Math.max(-60,Math.min(60,(e.clientX-r.left)*340/r.width-170));src.y=Math.max(-60,Math.min(60,(e.clientY-r.top)*340/r.height-170));demo()}
dc.addEventListener('pointerdown',e=>{dc.setPointerCapture(e.pointerId);mv(e);dc.onpointermove=mv});dc.addEventListener('pointerup',()=>dc.onpointermove=null);
['e','g','a'].forEach(i=>$('#'+i).addEventListener('input',demo));demo();

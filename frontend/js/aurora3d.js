/**
 * Aurora3D — ES module, matches CodePen reference exactly.
 * Owns the full space scene: black background, 2500 star points, 4 aurora ribbons,
 * UnrealBloomPass.  canvas_scenes.js pauses its own loop while this runs.
 */
import * as THREE from 'three';
import { EffectComposer }  from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass }      from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass }      from 'three/addons/postprocessing/OutputPass.js';

// ── Shaders ─────────────────────────────────────────────────────────────────
const STAR_VERT = `
  attribute float aSize;
  varying vec3  vColor;
  varying float vTwink;
  uniform float seconds;
  void main(){
    vColor  = color;
    vTwink  = 0.55 + 0.45 * sin(seconds * 1.7 + float(gl_VertexID) * 1.31);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position  = projectionMatrix * mv;
    gl_PointSize = aSize * (300.0 / -mv.z);
  }
`;
const STAR_FRAG = `
  varying vec3  vColor;
  varying float vTwink;
  void main(){
    vec2  p = gl_PointCoord - 0.5;
    float d = length(p);
    float a = pow(smoothstep(0.5, 0.0, d), 2.2);
    gl_FragColor = vec4(vColor * vTwink, a);
  }
`;

const AUR_VERT = `
  varying vec2 vUv;
  void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
`;
const AUR_FRAG = `
  precision highp float;
  uniform float uIntensity, uColor, uHueShift, uHueSpread, uHueSat, seconds;
  varying vec2 vUv;

  vec3 hsv2rgb(vec3 c){
    vec4 K=vec4(1.0,2.0/3.0,1.0/3.0,3.0);
    vec3 p=abs(fract(c.xxx+K.xyz)*6.0-K.www);
    return c.z*mix(K.xxx,clamp(p-K.xxx,0.0,1.0),c.y);
  }
  vec3 permute(vec3 x){return mod(((x*34.0)+1.0)*x,289.0);}
  float snoise(vec2 v){
    const vec4 C=vec4(0.211324865405187,0.366025403784439,-0.577350269189626,0.024390243902439);
    vec2 i=floor(v+dot(v,C.yy)); vec2 x0=v-i+dot(i,C.xx);
    vec2 i1=(x0.x>x0.y)?vec2(1.0,0.0):vec2(0.0,1.0);
    vec4 x12=x0.xyxy+C.xxzz; x12.xy-=i1;
    i=mod(i,289.0);
    vec3 p=permute(permute(i.y+vec3(0.0,i1.y,1.0))+i.x+vec3(0.0,i1.x,1.0));
    vec3 m=max(0.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.0);
    m=m*m; m=m*m;
    vec3 x_=2.0*fract(p*C.www)-1.0; vec3 h=abs(x_)-0.5;
    vec3 a0=x_-floor(x_+0.5);
    m*=1.79284291400159-0.85373472095314*(a0*a0+h*h);
    vec3 g; g.x=a0.x*x0.x+h.x*x0.y; g.yz=a0.yz*x12.xz+h.yz*x12.yw;
    return 130.0*dot(m,g);
  }

  void main(){
    float grad=fract(vUv.y*2.0); if(vUv.y>0.5) grad=1.0-grad;
    float a=vUv.x*6.28318530718; vec2 dir=vec2(cos(a),sin(a));
    float k50=50.0/6.28318530718, k30=30.0/6.28318530718, k40=40.0/6.28318530718;
    vec2 d1=vec2(seconds*0.10,seconds*0.07);
    vec2 d2=vec2(seconds*0.05,-seconds*0.04);
    vec2 d3=vec2(-seconds*0.11,seconds*0.08);
    float noise =0.5+0.5*(0.5*snoise(dir*k50+d1)+0.5*snoise(dir*k30+d2));
    float noise1=0.5+0.5*snoise(dir*k40+d3);
    float bottomFill=smoothstep(0.6,1.0,grad);
    float fadeTop   =smoothstep(0.0,0.8,grad-0.3*noise1);
    float fadeBottom=smoothstep(1.0,0.9,grad);
    vec3 base=(uColor>0.5)?vec3(0.306,0.471,0.462):vec3(0.385,0.50,0.861);
    float alpha=fadeBottom*fadeTop*uIntensity;
    float hue=(vUv.y*1.05+noise*0.28)*uHueSpread+uHueShift;
    vec3 rainbow=hsv2rgb(vec3(fract(hue),clamp(uHueSat,0.0,1.0),1.0));
    vec3 color=mix(base*0.18,rainbow,smoothstep(0.02,0.55,vUv.y))*(noise+bottomFill)*1.45;
    gl_FragColor=vec4(color,alpha);
  }
`;

// ── Helpers ──────────────────────────────────────────────────────────────────
function _noise(x,y,o){ return Math.sin(x*1.7+o*13.1)*Math.cos(y*2.3+o*7.7)*Math.sin(x*0.7+y*1.3+o*3.3); }

function _makeRibbon(radius, zOff, nScale, nAmp, nOff, isRed){
  const pts=[];
  for(let e=0;e<=100;e++){
    const a=(e/100)*Math.PI*2, n=nAmp*_noise(nScale*a,e/100,nOff);
    pts.push(new THREE.Vector3(Math.sin(a)*(radius+n), zOff, Math.cos(a)*(radius+n)));
  }
  const geo=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),200,0.9,2,true);
  const mat=new THREE.ShaderMaterial({
    uniforms:{
      uIntensity:{value:0.009}, uColor:{value:isRed?1:0},
      uHueShift:{value:0.16}, uHueSpread:{value:0.42}, uHueSat:{value:1.0}, seconds:{value:0},
    },
    vertexShader:AUR_VERT, fragmentShader:AUR_FRAG,
    side:THREE.DoubleSide, transparent:true, blending:THREE.AdditiveBlending, depthWrite:false,
  });
  return new THREE.Mesh(geo,mat);
}

function _makeStars(){
  const N=2500;
  const pos=new Float32Array(N*3), col=new Float32Array(N*3), sz=new Float32Array(N);
  for(let i=0;i<N;i++){
    const u=Math.random(), v=Math.random();
    const theta=2*Math.PI*u, phi=Math.acos(2*v-1), r=80+Math.random()*40;
    pos[i*3]  =r*Math.sin(phi)*Math.cos(theta);
    pos[i*3+1]=r*Math.sin(phi)*Math.sin(theta);
    pos[i*3+2]=r*Math.cos(phi);
    const warm=Math.random()<0.15, b=0.6+Math.random()*0.4;
    if(warm){col[i*3]=b; col[i*3+1]=b*0.85; col[i*3+2]=b*0.7;}
    else    {col[i*3]=b*0.85; col[i*3+1]=b*0.92; col[i*3+2]=b;}
    sz[i]=(Math.random()<0.05)?2.5:1.0+Math.random()*0.8;
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.BufferAttribute(pos,3));
  g.setAttribute('color',   new THREE.BufferAttribute(col,3));
  g.setAttribute('aSize',   new THREE.BufferAttribute(sz,1));
  const m=new THREE.ShaderMaterial({
    uniforms:{seconds:{value:0}},
    vertexShader:STAR_VERT, fragmentShader:STAR_FRAG,
    transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, vertexColors:true,
  });
  const pts=new THREE.Points(g,m); pts.renderOrder=-1; return pts;
}

// ── Drifting controls ────────────────────────────────────────────────────────
const _D=[
  {u:'uIntensity',base:0.009,amp:0.002,rate:0.13},
  {u:'uHueShift', base:0.16, amp:0.08, rate:0.07},
  {u:'uHueSpread',base:0.42, amp:0.10, rate:0.05},
];

// ── State ────────────────────────────────────────────────────────────────────
let _R=null,_composer=null,_scene=null,_cam=null,_stars=null;
let _group=null,_el=null,_raf=null,_running=false,_t=0,_last=0;

function _setAll(k,v){
  _group&&_group.children.forEach(m=>{
    if(m.material?.uniforms[k]!==undefined) m.material.uniforms[k].value=v;
  });
}

function _loop(now){
  _raf=requestAnimationFrame(_loop);
  if(!_composer||!_group) return;
  const dt=Math.min(now-_last,50); _last=now; _t+=dt*0.001;

  _D.forEach(d=>_setAll(d.u, d.base+d.amp*Math.sin(_t*d.rate)));
  _setAll('seconds',_t);
  if(_stars) _stars.material.uniforms.seconds.value=_t;
  _group.position.y =6.0+0.4*Math.sin(_t*0.09);
  _group.scale.setScalar(8.0+0.3*Math.sin(_t*0.11));

  const W=window.innerWidth,H=window.innerHeight,pr=_R.getPixelRatio();
  if(Math.abs(_R.domElement.width-W*pr)>4||Math.abs(_R.domElement.height-H*pr)>4){
    _R.setSize(W,H,false); _cam.aspect=W/H; _cam.updateProjectionMatrix(); _composer.setSize(W,H);
  }
  _composer.render();
}

function _build(){
  const W=window.innerWidth,H=window.innerHeight;

  // Fullscreen canvas at z:1 — covers bg-canvas entirely (no transparency needed)
  _el=document.createElement('canvas'); _el.id='aurora-canvas';
  Object.assign(_el.style,{position:'fixed',inset:'0',width:'100%',height:'100%',zIndex:'1',pointerEvents:'none'});
  const ref=document.getElementById('bg-canvas');
  if(ref?.nextSibling) document.body.insertBefore(_el,ref.nextSibling);
  else document.body.appendChild(_el);

  _R=new THREE.WebGLRenderer({canvas:_el,antialias:true});
  _R.setPixelRatio(Math.min(devicePixelRatio,2));
  _R.setSize(W,H,false);
  _R.setClearColor(0x000000,1);   // opaque black — owns full scene
  _R.toneMapping=THREE.ACESFilmicToneMapping;
  _R.toneMappingExposure=1.26;

  _scene=new THREE.Scene();
  _cam=new THREE.PerspectiveCamera(35,W/H,0.1,200);
  _cam.position.set(-5,-1.5,6); _cam.lookAt(0,0,0);

  // Stars (same as CodePen)
  _stars=_makeStars(); _scene.add(_stars);

  // Aurora ribbons
  _group=new THREE.Group();
  _group.position.set(0,6.0,0.3);
  _group.scale.setScalar(8.0);
  _scene.add(_group);
  _group.add(_makeRibbon(2,    0,    2,0.2,0,   false));
  _group.add(_makeRibbon(2.01, 0.05, 2,0.2,0,   true));
  _group.add(_makeRibbon(3.5,  0,    3,0.4,0.4, false));
  _group.add(_makeRibbon(3.51, 0,    3,0.4,0.45,true));

  _composer=new EffectComposer(_R);
  _composer.addPass(new RenderPass(_scene,_cam));
  _composer.addPass(new UnrealBloomPass(new THREE.Vector2(W,H),0.34,0.5,0.15));
  _composer.addPass(new OutputPass());

  _last=performance.now();
  _raf=requestAnimationFrame(_loop);
}

function start(){
  if(_running) return;
  _running=true; _t=0;
  _build();
}

function stop(){
  _running=false;
  cancelAnimationFrame(_raf); _raf=null;
  _el?.remove(); _el=null;
  _R?.dispose(); _R=null;
  _composer=_scene=_cam=_group=_stars=null;
}

window.Aurora3D={start,stop};

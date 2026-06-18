/**
 * Aurora3D — ES module
 * Ultra-realistic Aurora Borealis: viewed from ground, looking toward the horizon.
 * Wide vertical curtain planes (PlaneGeometry) span horizon-to-horizon in X,
 * wave in Z (depth), sinusoidal bottom edges, vertical traveling pillars.
 * Multiple layers at different Z distances give volumetric depth.
 */
import * as THREE from 'three';
import { EffectComposer }  from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass }      from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass }      from 'three/addons/postprocessing/OutputPass.js';

// ── Star shaders ─────────────────────────────────────────────────────────────
const STAR_VERT = `
  attribute float aSize;
  attribute float aIdx;
  varying vec3  vColor;
  varying float vTwink;
  uniform float seconds;
  void main(){
    vColor  = color;
    vTwink  = 0.55 + 0.45 * sin(seconds * 1.7 + aIdx * 1.31);
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
    float a = pow(smoothstep(0.5, 0.0, length(p)), 2.2);
    gl_FragColor = vec4(vColor * vTwink, a);
  }
`;

// ── Aurora curtain shaders ────────────────────────────────────────────────────
// PlaneGeometry in XY facing camera (+Z).
// Vertex shader:  ripples curtain in Z (3D depth flutter)
//                 waves bottom edge in Y (sinusoidal base)
//                 computes per-vertex pillar brightness (traveling bright columns)
// Fragment shader: simplex-noise shimmer, hue gradient by height,
//                  alpha envelope (fade at top, sharp bottom edge)
const CURTAIN_VERT = `
  uniform float uTime;
  uniform float uFreq;   // spatial frequency of curtain waves
  uniform float uAmp;    // Z-wave amplitude
  uniform float uSpeed;  // animation speed multiplier
  varying vec2  vUv;
  varying float vBright; // vertical pillar brightness, 0-1
  void main(){
    vUv = uv;
    vec3 p = position;

    // ── Curtain depth ripple (Z axis) ──────────────────────────────────────
    float w1 = sin(p.x * uFreq        + uTime * uSpeed       ) * uAmp;
    float w2 = sin(p.x * uFreq * 1.73 - uTime * uSpeed * 0.61 + 2.09) * uAmp * 0.42;
    float w3 = sin(p.x * uFreq * 0.47 + uTime * uSpeed * 0.28 + 4.71) * uAmp * 0.28;
    p.z += w1 + w2 + w3;

    // ── Sinusoidal bottom edge (Y, strongest at base, fades toward top) ────
    float bottomT = (1.0 - uv.y) * (1.0 - uv.y);  // squared: most at base
    float ey = sin(p.x * uFreq * 1.31 + uTime * 0.43) * 2.2
             + sin(p.x * uFreq * 2.17 - uTime * 0.31 + 1.57) * 0.9
             + sin(p.x * uFreq * 3.41 + uTime * 0.19 + 3.14) * 0.4;
    p.y += ey * bottomT;

    // ── Vertical traveling pillars (bright columns moving across curtain) ──
    float pillar = 0.5 + 0.5 * pow(
      max(0.0, sin(p.x * uFreq * 2.9 + uTime * 0.38)),
      1.6
    );
    // Second pillar wave for richness
    pillar = max(pillar, 0.35 + 0.65 * pow(
      max(0.0, sin(p.x * uFreq * 1.8 - uTime * 0.27 + 1.05)),
      2.0
    ));
    vBright = pillar;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const CURTAIN_FRAG = `
  precision highp float;
  uniform float uTime;
  uniform float uHue;       // base hue: 0.33=green, 0.48=cyan, 0.72=violet
  uniform float uIntensity; // overall brightness
  varying vec2  vUv;
  varying float vBright;

  vec3 hsv2rgb(vec3 c){
    vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz)*6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p-K.xxx,0.0,1.0), c.y);
  }

  vec3 permute(vec3 x){ return mod(((x*34.0)+1.0)*x, 289.0); }
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
    // ── Alpha envelope ──────────────────────────────────────────────────────
    // Top: aurora dissipates gently
    float fadeTop = 1.0 - smoothstep(0.50, 0.97, vUv.y);
    // Bottom: sharp sinusoidal lower boundary (tight fade over bottom 6%)
    float fadeBot = smoothstep(0.0, 0.06, vUv.y);

    // ── Shimmer noise (large scale slow + fine scale fast) ─────────────────
    float n1 = 0.5+0.5*snoise(vec2(vUv.x*5.0 + uTime*0.11, vUv.y*3.0 - uTime*0.07));
    float n2 = 0.5+0.5*snoise(vec2(vUv.x*16.0 - uTime*0.19, vUv.y*8.0 + uTime*0.13));
    float shimmer = 0.55 + 0.30*n1 + 0.15*n2;

    // ── Color: hue shifts upward (green→cyan→white tips) ──────────────────
    float hue = uHue + vUv.y * 0.13 + n1 * 0.05;
    // Saturation drops toward top (real aurora whitens at altitude)
    float sat = clamp(0.90 - vUv.y * 0.35, 0.0, 1.0);
    // Brightness: slightly brighter at mid-height (realistic intensity band)
    float bri = 0.75 + 0.25 * smoothstep(0.0, 0.3, vUv.y) * (1.0 - smoothstep(0.6, 1.0, vUv.y));
    vec3 color = hsv2rgb(vec3(fract(hue), sat, bri));

    // ── Final alpha ─────────────────────────────────────────────────────────
    float alpha = fadeTop * fadeBot * uIntensity * vBright * shimmer;

    gl_FragColor = vec4(color, alpha);
  }
`;

// ── Factory ───────────────────────────────────────────────────────────────────
// width, height: world-unit dimensions of the curtain plane
// wSeg, hSeg:   mesh subdivision (more = smoother waves)
// zPos, yBase:  position (yBase = bottom of curtain)
// freq, amp, speed: wave parameters
// hue: base color hue (HSV)
// intensity: brightness multiplier
function _makeCurtain(width, height, wSeg, hSeg, zPos, yBase, freq, amp, speed, hue, intensity){
  const geo = new THREE.PlaneGeometry(width, height, wSeg, hSeg);
  const mat = new THREE.ShaderMaterial({
    uniforms:{
      uTime:     {value:0},
      uFreq:     {value:freq},
      uAmp:      {value:amp},
      uSpeed:    {value:speed},
      uHue:      {value:hue},
      uIntensity:{value:intensity},
    },
    vertexShader:CURTAIN_VERT, fragmentShader:CURTAIN_FRAG,
    side:THREE.DoubleSide, transparent:true,
    blending:THREE.AdditiveBlending, depthWrite:false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(0, yBase + height*0.5, zPos);
  return mesh;
}

function _makeStars(){
  const N=2500;
  const pos=new Float32Array(N*3), col=new Float32Array(N*3),
        sz=new Float32Array(N),    idx=new Float32Array(N);
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
    idx[i]=i;
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.BufferAttribute(pos,3));
  g.setAttribute('color',   new THREE.BufferAttribute(col,3));
  g.setAttribute('aSize',   new THREE.BufferAttribute(sz,1));
  g.setAttribute('aIdx',    new THREE.BufferAttribute(idx,1));
  const m=new THREE.ShaderMaterial({
    uniforms:{seconds:{value:0}},
    vertexShader:STAR_VERT, fragmentShader:STAR_FRAG,
    transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, vertexColors:true,
  });
  const pts=new THREE.Points(g,m); pts.renderOrder=-1; return pts;
}

// ── State ─────────────────────────────────────────────────────────────────────
let _R=null,_composer=null,_scene=null,_cam=null,_stars=null;
let _curtains=[],_el=null,_raf=null,_running=false,_t=0,_last=0;

function _loop(now){
  _raf=requestAnimationFrame(_loop);
  if(!_composer) return;
  const dt=Math.min(now-_last,50); _last=now; _t+=dt*0.001;

  _curtains.forEach(m=>{ if(m.material?.uniforms?.uTime) m.material.uniforms.uTime.value=_t; });
  if(_stars) _stars.material.uniforms.seconds.value=_t;

  // Subtle sway — feel like standing on the ground watching
  _cam.position.x =  Math.sin(_t*0.038)*1.2;
  _cam.position.y =  3.5 + Math.sin(_t*0.022)*0.3;
  _cam.position.z = 22 + Math.cos(_t*0.028)*0.6;
  _cam.lookAt(Math.sin(_t*0.019)*0.8, 11, 0);

  const W=window.innerWidth,H=window.innerHeight,pr=_R.getPixelRatio();
  if(Math.abs(_R.domElement.width-W*pr)>4||Math.abs(_R.domElement.height-H*pr)>4){
    _R.setSize(W,H,false); _cam.aspect=W/H; _cam.updateProjectionMatrix(); _composer.setSize(W,H);
  }
  _composer.render();
}

function _build(){
  const W=window.innerWidth,H=window.innerHeight;

  _el=document.createElement('canvas'); _el.id='aurora-canvas';
  Object.assign(_el.style,{position:'fixed',inset:'0',width:'100%',height:'100%',zIndex:'1',pointerEvents:'none'});
  const ref=document.getElementById('bg-canvas');
  if(ref?.nextSibling) document.body.insertBefore(_el,ref.nextSibling);
  else document.body.appendChild(_el);

  _R=new THREE.WebGLRenderer({canvas:_el,antialias:true});
  _R.setPixelRatio(Math.min(devicePixelRatio,2));
  _R.setSize(W,H,false);
  _R.setClearColor(0x000308,1);   // deep blue-black night sky
  _R.toneMapping=THREE.ACESFilmicToneMapping;
  _R.toneMappingExposure=1.35;

  _scene=new THREE.Scene();

  // Camera: standing on ground, looking toward aurora on the horizon
  // FOV 60° — wide enough to see full curtain span, not fisheye
  _cam=new THREE.PerspectiveCamera(60,W/H,0.1,300);
  _cam.position.set(0,3.5,22); _cam.lookAt(0,11,0);

  _stars=_makeStars(); _scene.add(_stars);
  _curtains=[];

  // ── Aurora layers — far to near so additive blending stacks correctly ──
  //
  // _makeCurtain(width, height, wSeg, hSeg, zPos, yBase, freq, amp, speed, hue, intensity)
  //
  // Hue guide: 0.72=violet, 0.50=cyan, 0.48=cyan-green, 0.38=green-cyan, 0.33=green
  // zPos: negative = further from camera (camera at z=22 looking toward z=0)

  // Layer 3 — far (z=-10), violet/purple, wide faint glow
  const c3a=_makeCurtain(75,22, 70,40, -10, 3, 0.17,2.2,0.21, 0.72,0.55);
  const c3b=_makeCurtain(75,14, 70,30, -11, 14,0.22,1.8,0.26, 0.68,0.38);
  _scene.add(c3a); _scene.add(c3b); _curtains.push(c3a,c3b);

  // Layer 2 — mid (z=-4), cyan, medium brightness
  const c2a=_makeCurtain(72,24, 70,45,  -4, 2, 0.21,2.8,0.29, 0.50,0.68);
  const c2b=_makeCurtain(72,16, 70,35,  -5, 13,0.27,2.2,0.24, 0.46,0.52);
  _scene.add(c2a); _scene.add(c2b); _curtains.push(c2a,c2b);

  // Layer 1 — near (z=0..2), main emerald green, brightest
  const c1a=_makeCurtain(68,26, 70,50,   0, 2, 0.25,3.2,0.34, 0.33,0.88);
  const c1b=_makeCurtain(68,18, 70,40,   1, 12,0.31,2.6,0.29, 0.36,0.72);
  // High thin band — faint magenta/violet at upper edge
  const c1c=_makeCurtain(68,10, 70,25,   2, 22,0.19,1.8,0.18, 0.30,0.42);
  _scene.add(c1a); _scene.add(c1b); _scene.add(c1c); _curtains.push(c1a,c1b,c1c);

  _composer=new EffectComposer(_R);
  _composer.addPass(new RenderPass(_scene,_cam));
  // Bloom: strength, radius, threshold — glow without blowing out
  _composer.addPass(new UnrealBloomPass(new THREE.Vector2(W,H),0.75,0.55,0.08));
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
  _curtains.forEach(m=>{ m.geometry?.dispose(); m.material?.dispose(); });
  _curtains=[];
  _R?.dispose(); _R=null;
  _composer=_scene=_cam=_stars=null;
}

window.Aurora3D={start,stop};

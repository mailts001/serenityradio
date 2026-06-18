/* ═══════════════════════════════════════════════════════════════════
   Aurora3D — WebGL aurora overlay using Three.js TubeGeometry ribbons
   + UnrealBloomPass.  Transparent background so the canvas-2D space
   scene (stars, shooting stars) shows through underneath.

   Approach from reference aurora shader:
   • TubeGeometry ribbons along CatmullRomCurve3 rings, 4 ribbons total
   • Fragment shader: simplex noise, rainbow hue mode, additive blending
   • UnrealBloomPass for characteristic glow
   • Control values drift slowly over time for subtle organic animation
   ═══════════════════════════════════════════════════════════════════ */
const Aurora3D = (() => {
  'use strict';

  let _renderer = null, _composer = null, _scene = null, _camera = null;
  let _auroraGroup = null, _el = null, _raf = null, _running = false;
  let _clock = 0, _lastNow = 0;

  // Slowly drifting control values — unique slow oscillation per param
  const _ctrl = {
    intensity:  { base: 0.009, amp: 0.002, rate: 0.13 },
    hueShift:   { base: 0.16,  amp: 0.08,  rate: 0.07 },
    hueSpread:  { base: 0.42,  amp: 0.10,  rate: 0.05 },
    posY:       { base: 6.0,   amp: 0.40,  rate: 0.09 },
    scale:      { base: 8.0,   amp: 0.30,  rate: 0.11 },
  };
  function _cv(c, t) { return c.base + c.amp * Math.sin(t * c.rate); }

  const VERT = `
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
  `;

  const FRAG = `
    precision highp float;
    uniform float uIntensity, uColor, uHueShift, uHueSpread, uHueSat, seconds;
    varying vec2 vUv;

    vec3 hsv2rgb(vec3 c){
      vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
      vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
      return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
    }
    vec3 permute(vec3 x){ return mod(((x*34.0)+1.0)*x, 289.0); }
    float snoise(vec2 v){
      const vec4 C = vec4(0.211324865405187,0.366025403784439,-0.577350269189626,0.024390243902439);
      vec2 i  = floor(v + dot(v, C.yy));
      vec2 x0 = v - i + dot(i, C.xx);
      vec2 i1 = (x0.x > x0.y) ? vec2(1.0,0.0) : vec2(0.0,1.0);
      vec4 x12 = x0.xyxy + C.xxzz; x12.xy -= i1;
      i = mod(i, 289.0);
      vec3 p = permute(permute(i.y + vec3(0.0,i1.y,1.0)) + i.x + vec3(0.0,i1.x,1.0));
      vec3 m = max(0.5 - vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)), 0.0);
      m = m*m; m = m*m;
      vec3 x_ = 2.0 * fract(p * C.www) - 1.0;
      vec3 h = abs(x_) - 0.5;
      vec3 a0 = x_ - floor(x_ + 0.5);
      m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
      vec3 g;
      g.x  = a0.x  * x0.x  + h.x  * x0.y;
      g.yz = a0.yz * x12.xz + h.yz * x12.yw;
      return 130.0 * dot(m, g);
    }

    void main(){
      float grad = fract(vUv.y * 2.0);
      if (vUv.y > 0.5) grad = 1.0 - grad;

      float a   = vUv.x * 6.28318530718;
      vec2  dir = vec2(cos(a), sin(a));
      float k50 = 50.0 / 6.28318530718;
      float k30 = 30.0 / 6.28318530718;
      float k40 = 40.0 / 6.28318530718;
      vec2 d1 = vec2( seconds*0.10,  seconds*0.07);
      vec2 d2 = vec2( seconds*0.05, -seconds*0.04);
      vec2 d3 = vec2(-seconds*0.11,  seconds*0.08);

      float noise  = 0.5 + 0.5*(0.5*snoise(dir*k50+d1) + 0.5*snoise(dir*k30+d2));
      float noise1 = 0.5 + 0.5*snoise(dir*k40+d3);

      float bottomFill = smoothstep(0.6, 1.0, grad);
      float fadeTop    = smoothstep(0.0, 0.8, grad - 0.3*noise1);
      float fadeBottom = smoothstep(1.0, 0.9, grad);

      vec3 base  = (uColor > 0.5) ? vec3(0.306,0.471,0.462) : vec3(0.385,0.50,0.861);
      float alpha = fadeBottom * fadeTop * uIntensity;

      // Rainbow mode
      float hue = (vUv.y*1.05 + noise*0.28) * uHueSpread + uHueShift;
      vec3  rainbow = hsv2rgb(vec3(fract(hue), clamp(uHueSat,0.0,1.0), 1.0));
      vec3  color   = mix(base*0.18, rainbow, smoothstep(0.02,0.55,vUv.y))
                    * (noise + bottomFill) * 1.45;

      gl_FragColor = vec4(color, alpha);
    }
  `;

  function _noise(x, y, off) {
    return Math.sin(x*1.7 + off*13.1) * Math.cos(y*2.3 + off*7.7) * Math.sin(x*0.7 + y*1.3 + off*3.3);
  }

  function _makeRibbon(THREE, radius, zOff, nScale, nAmp, nOff, isRed) {
    const pts = [];
    for (let e = 0; e <= 100; e++) {
      const a = (e/100) * Math.PI * 2;
      const n = nAmp * _noise(nScale*a, e/100, nOff);
      pts.push(new THREE.Vector3(Math.sin(a)*(radius+n), zOff, Math.cos(a)*(radius+n)));
    }
    const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 200, 0.9, 2, true);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uIntensity: { value: 0.009 },
        uColor:     { value: isRed ? 1.0 : 0.0 },
        uHueShift:  { value: 0.16 },
        uHueSpread: { value: 0.42 },
        uHueSat:    { value: 1.00 },
        seconds:    { value: 0 },
      },
      vertexShader: VERT, fragmentShader: FRAG,
      side: THREE.DoubleSide, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    return new THREE.Mesh(geo, mat);
  }

  function _setAll(key, val) {
    _auroraGroup && _auroraGroup.children.forEach(m => {
      m.material && m.material.uniforms[key] !== undefined && (m.material.uniforms[key].value = val);
    });
  }

  function _loop(now) {
    _raf = requestAnimationFrame(_loop);
    if (!_composer || !_auroraGroup) return;

    const dt = Math.min(now - _lastNow, 50);
    _lastNow = now;
    _clock += dt * 0.001;
    const t = _clock;

    _setAll('uIntensity', _cv(_ctrl.intensity, t));
    _setAll('uHueShift',  _cv(_ctrl.hueShift,  t));
    _setAll('uHueSpread', _cv(_ctrl.hueSpread, t));
    _setAll('uHueSat',    1.0);
    _setAll('seconds',    t);
    _auroraGroup.position.y = _cv(_ctrl.posY,  t);
    _auroraGroup.scale.setScalar(_cv(_ctrl.scale, t));

    const W = window.innerWidth, H = window.innerHeight;
    const rW = _renderer.domElement.width, rH = _renderer.domElement.height;
    if (Math.abs(rW - W * _renderer.getPixelRatio()) > 4 ||
        Math.abs(rH - H * _renderer.getPixelRatio()) > 4) {
      _renderer.setSize(W, H, false);
      _camera.aspect = W / H;
      _camera.updateProjectionMatrix();
      _composer.setSize(W, H);
    }

    _composer.render();
  }

  async function _loadAndBuild() {
    try {
      const THREE          = await import('https://unpkg.com/three@0.172.0/build/three.module.js');
      const { EffectComposer }   = await import('https://unpkg.com/three@0.172.0/examples/jsm/postprocessing/EffectComposer.js');
      const { RenderPass }       = await import('https://unpkg.com/three@0.172.0/examples/jsm/postprocessing/RenderPass.js');
      const { UnrealBloomPass }  = await import('https://unpkg.com/three@0.172.0/examples/jsm/postprocessing/UnrealBloomPass.js');
      const { OutputPass }       = await import('https://unpkg.com/three@0.172.0/examples/jsm/postprocessing/OutputPass.js');

      if (!_running) return;

      const W = window.innerWidth, H = window.innerHeight;

      _el = document.createElement('canvas');
      _el.id = 'aurora-canvas';
      Object.assign(_el.style, { position:'fixed', inset:'0', width:'100%', height:'100%', zIndex:'1', pointerEvents:'none' });
      const bgC = document.getElementById('bg-canvas');
      if (bgC && bgC.nextSibling) document.body.insertBefore(_el, bgC.nextSibling);
      else document.body.appendChild(_el);

      _renderer = new THREE.WebGLRenderer({ canvas: _el, antialias: true, alpha: true });
      _renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      _renderer.setSize(W, H, false);
      _renderer.setClearColor(0x000000, 0);   // transparent — stars show through
      _renderer.toneMapping = THREE.ACESFilmicToneMapping;
      _renderer.toneMappingExposure = 1.26;

      _scene  = new THREE.Scene();
      _camera = new THREE.PerspectiveCamera(35, W/H, 0.1, 200);
      _camera.position.set(-5, -1.5, 6);
      _camera.lookAt(0, 0, 0);

      _composer = new EffectComposer(_renderer);
      _composer.addPass(new RenderPass(_scene, _camera));
      _composer.addPass(new UnrealBloomPass(new THREE.Vector2(W, H), 0.34, 0.5, 0.15));
      _composer.addPass(new OutputPass());

      _auroraGroup = new THREE.Group();
      _auroraGroup.position.set(0, 6.0, 0.3);
      _auroraGroup.scale.setScalar(8.0);
      _scene.add(_auroraGroup);

      _auroraGroup.add(_makeRibbon(THREE, 2,    0,    2, 0.2, 0,    false));
      _auroraGroup.add(_makeRibbon(THREE, 2.01, 0.05, 2, 0.2, 0,    true));
      _auroraGroup.add(_makeRibbon(THREE, 3.5,  0,    3, 0.4, 0.4,  false));
      _auroraGroup.add(_makeRibbon(THREE, 3.51, 0,    3, 0.4, 0.45, true));

      _lastNow = performance.now();
      _raf = requestAnimationFrame(_loop);
    } catch(e) {
      console.warn('[Aurora3D] load failed:', e);
    }
  }

  function start() {
    if (_running) return;
    _running = true;
    _clock = 0;
    _loadAndBuild();
  }

  function stop() {
    _running = false;
    cancelAnimationFrame(_raf); _raf = null;
    if (_el)       { _el.remove(); _el = null; }
    if (_renderer) { _renderer.dispose(); _renderer = null; }
    _composer = _scene = _camera = _auroraGroup = null;
  }

  return { start, stop };
})();

/* ═══════════════════════════════════════════════════════════════════
   Aurora3D — WebGL / GLSL volumetric aurora borealis
   Replaces the canvas-2D aurora in the space scene.
   Uses Three.js (already loaded on page) + custom GLSL shaders.
   Optimised for mobile GPUs (mediump float, 4-octave FBM, simple hash).
   Renders stars + FBM-based curtain aurora + shooting stars.
   ═══════════════════════════════════════════════════════════════════ */
const Aurora3D = (() => {
  'use strict';

  let _R = null, _scene = null, _cam = null, _raf = null;
  let _mat = null, _el = null, _running = false;
  let _clock = 0, _lastNow = 0;

  // ── GLSL vertex shader (fullscreen quad, no MVP needed) ────────────
  const VERT = /* glsl */`
    void main() {
      gl_Position = vec4(position, 1.0);
    }
  `;

  // ── GLSL fragment shader ────────────────────────────────────────────
  const FRAG = /* glsl */`
    precision mediump float;

    uniform float uTime;
    uniform vec2  uResolution;
    uniform float uStar1;   // pre-randomised seed offsets for shooting stars
    uniform float uStar2;
    uniform vec2  uShoot1;  // shooting star 1: (progress 0-1, angle)
    uniform vec2  uShoot2;  // shooting star 2: (progress 0-1, angle)

    // ── Hash / noise ────────────────────────────────────────────────
    float hash12(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(
        mix(hash12(i),              hash12(i + vec2(1.0, 0.0)), f.x),
        mix(hash12(i + vec2(0.0,1.0)), hash12(i + vec2(1.0,1.0)), f.x),
        f.y);
    }

    // 4-octave FBM (mobile-safe)
    float fbm(vec2 p) {
      float v = 0.0;
      float a = 0.5;
      // Rotation matrix to reduce axis-alignment artifacts
      mat2 m = mat2(1.60, 1.20, -1.20, 1.60);
      for (int i = 0; i < 4; i++) {
        v += a * noise(p);
        p  = m * p;
        a *= 0.5;
      }
      return v;
    }

    // ── Stars (grid-cell approach — no loops over screen) ───────────
    vec3 drawStars(vec2 uv) {
      vec3 col = vec3(0.0);

      // Layer 1: fine stars
      vec2 p1 = uv * 140.0;
      vec2 i1 = floor(p1);
      float h1 = hash12(i1 + vec2(7.1, 3.3));
      if (h1 > 0.88) {
        float rate = h1 * 2.5 + 0.8;
        float twk  = 0.55 + 0.45 * abs(sin(uTime * rate + h1 * 6.28));
        vec2  f1   = fract(p1) - 0.5;
        float d1   = length(f1);
        float brt  = (h1 - 0.88) * 8.0;   // brightness
        col += vec3(0.85, 0.92, 1.00) * smoothstep(brt + 0.05, brt, d1) * twk;
      }

      // Layer 2: medium stars (fewer, brighter)
      vec2 p2 = uv * 70.0;
      vec2 i2 = floor(p2);
      float h2 = hash12(i2 + vec2(2.7, 9.1));
      if (h2 > 0.92) {
        float rate = h2 * 1.5 + 0.4;
        float twk  = 0.60 + 0.40 * abs(sin(uTime * rate + h2 * 5.0));
        vec2  f2   = fract(p2) - 0.5;
        float d2   = length(f2);
        float brt  = (h2 - 0.92) * 12.0;
        // Soft glow halo
        col += vec3(0.7, 0.85, 1.0) * 0.012 / (d2 + 0.03) * twk;
        col += vec3(0.90, 0.95, 1.00) * smoothstep(brt + 0.04, brt, d2) * twk;
      }

      // Layer 3: rare brilliant stars (< 0.5% of cells)
      vec2 p3 = uv * 35.0;
      vec2 i3 = floor(p3);
      float h3 = hash12(i3 + vec2(5.3, 1.7));
      if (h3 > 0.97) {
        float twk = 0.75 + 0.25 * sin(uTime * 1.1 + h3 * 4.0);
        vec2  f3  = fract(p3) - 0.5;
        float d3  = length(f3);
        // Cross spike (4-pointed star shape)
        float spike = 0.003 / (abs(f3.x) + abs(f3.y) * 3.0 + 0.005)
                    + 0.003 / (abs(f3.y) + abs(f3.x) * 3.0 + 0.005);
        col += vec3(0.95, 0.98, 1.0) * (0.018 / (d3 + 0.015) + spike) * twk;
      }
      return col;
    }

    // ── Aurora curtain band ─────────────────────────────────────────
    // Returns RGB emission for one aurora band.
    // uv.y == 0 at bottom, 1 at top.
    // bandCY  = center Y of the band (0-1)
    // bandH   = half-height of bell curve
    // speed   = horizontal drift speed
    // seed    = per-band random offset
    vec3 auroraBand(vec2 uv, vec3 colour, float bandCY, float bandH,
                    float speed, float seed) {
      float t = uTime * 0.38;   // global time scale

      // ── Horizontal warping creates the "dancing curtain" motion ──
      float drift = t * speed + seed;

      // Slow large wave — defines main curtain shape
      vec2 warpP  = vec2(uv.x * 2.2 + drift, t * 0.08 + seed * 0.7);
      float warp  = fbm(warpP) * 0.14 - 0.07;

      // Vertical position of this column of curtain
      float cy    = bandCY + warp
                  + 0.040 * sin(uv.x * 4.0 + drift * 1.3 + seed)
                  + 0.018 * sin(uv.x * 9.0 + drift * 2.1);

      // ── Vertical profile: bell curve with sharp top, diffuse bottom ──
      float dy    = uv.y - cy;
      // Asymmetric: aurora top edge sharper than bottom
      float topH  = bandH * 0.55;
      float botH  = bandH * 1.50;
      float vert  = dy > 0.0
        ? exp(-dy * dy / (topH * topH))
        : exp(-dy * dy / (botH * botH));

      // ── Horizontal density: FBM-based columns (bright streaks) ──
      vec2 densP  = vec2(uv.x * 5.5 + drift * 0.5, t * 0.05 + seed * 1.3);
      float dens  = max(0.0, fbm(densP) - 0.26);

      // ── Fine vertical rays ──
      vec2 rayP   = vec2(uv.x * 12.0 + drift * 1.2, t * 0.10 + seed * 2.1);
      float ray   = max(0.0, fbm(rayP) - 0.40) * 2.5;

      // ── Intensity pulsing (aurora breathes) ──
      float pulse = 0.80 + 0.20 * sin(t * 0.9 + uv.x * 2.0 + seed * 3.0);

      float intensity = vert * (dens * 1.6 + ray * 0.5) * pulse;

      return colour * max(0.0, intensity);
    }

    // ── Shooting star ───────────────────────────────────────────────
    vec3 shootingStar(vec2 uv, vec2 params) {
      // params.x = progress (0-1), params.y = angle
      if (params.x <= 0.0 || params.x >= 1.0) return vec3(0.0);
      // Start position (random top area)
      float ang   = params.y;
      vec2  orig  = vec2(0.15 + params.y * 0.7, 0.75 + params.y * 0.15);
      vec2  dir   = vec2(cos(ang), -sin(ang)) * 0.55;  // diagonal downward
      vec2  head  = orig + dir * params.x;
      // Fade: bright middle, fade both ends
      float alpha = params.x < 0.15 ? params.x / 0.15
                  : params.x > 0.80 ? (1.0 - params.x) / 0.20 : 1.0;
      // Trail (line from head backward)
      vec2  tail  = head - dir * 0.18;
      // Distance to line segment
      vec2  ab    = tail - head;
      float t2    = clamp(dot(uv - head, ab) / dot(ab, ab), 0.0, 1.0);
      float d     = length((uv - head) - ab * t2);
      float glow  = 0.0015 / (d + 0.002);
      float fade  = 1.0 - t2;  // head bright, tail fades
      return vec3(0.95, 0.97, 1.0) * glow * alpha * fade * 3.0;
    }

    // ── Nebula haze ─────────────────────────────────────────────────
    vec3 nebula(vec2 uv) {
      float n1 = fbm(uv * 2.2 + vec2(uTime * 0.006, 0.0));
      float n2 = fbm(uv * 3.5 + vec2(0.0, uTime * 0.004));
      return vec3(0.03, 0.008, 0.06) * n1
           + vec3(0.012, 0.02, 0.05) * n2;
    }

    void main() {
      vec2 uv = gl_FragCoord.xy / uResolution;

      // ── Deep space background gradient ────────────────────────────
      vec3 col = mix(vec3(0.0, 0.002, 0.018),
                     vec3(0.002, 0.004, 0.010), uv.y);

      // ── Nebula ───────────────────────────────────────────────────
      col += nebula(uv);

      // ── Stars ────────────────────────────────────────────────────
      col += drawStars(uv);

      // ── Aurora — 4 bands: green, blue, red, teal ─────────────────
      // Restrict aurora to sky region (above horizon) with soft mask
      float skyMask = smoothstep(0.28, 0.48, uv.y);

      // Green — dominant (oxygen ~100km)
      col += auroraBand(uv, vec3(0.00, 0.92, 0.38), 0.58, 0.095, 0.18, 0.00) * skyMask * 0.85;
      // Blue/purple — nitrogen, just below green
      col += auroraBand(uv, vec3(0.18, 0.30, 1.00), 0.46, 0.065, 0.23, 2.30) * skyMask * 0.55;
      // Red/crimson — rare, high altitude (oxygen ~200km)
      col += auroraBand(uv, vec3(0.92, 0.12, 0.35), 0.72, 0.075, 0.13, 4.70) * skyMask * 0.42;
      // Teal accent layer
      col += auroraBand(uv, vec3(0.00, 0.88, 0.72), 0.64, 0.050, 0.26, 7.10) * skyMask * 0.32;

      // ── Shooting stars ───────────────────────────────────────────
      col += shootingStar(uv, uShoot1);
      col += shootingStar(uv, uShoot2);

      // ── Atmospheric horizon glow ─────────────────────────────────
      float horiz = max(0.0, 0.32 - uv.y) * 3.0;
      col += vec3(0.08, 0.18, 0.35) * horiz * 0.25;

      // ── Tone mapping (Reinhard) + gamma ──────────────────────────
      col  = col / (col + 0.70);
      col  = pow(max(col, vec3(0.0)), vec3(0.4545));  // gamma 2.2

      gl_FragColor = vec4(col, 1.0);
    }
  `;

  // ── Shooting star state (managed in JS, passed to shader as uniforms) ─
  let _ss = [
    { prog: -1, angle: 0.55, next: 3.0 },
    { prog: -1, angle: 0.42, next: 8.0 },
  ];

  function _launch() {
    if (!_running) return;

    _el = document.createElement('canvas');
    _el.id = 'aurora-canvas';
    Object.assign(_el.style, {
      position: 'fixed', inset: '0',
      width: '100%', height: '100%',
      zIndex: '1',   // above bg-canvas (z:0), below page content (z:2)
    });
    // Insert after bg-canvas so it stacks on top of it
    const bgCanvas = document.getElementById('bg-canvas');
    if (bgCanvas && bgCanvas.nextSibling) {
      document.body.insertBefore(_el, bgCanvas.nextSibling);
    } else {
      document.body.insertBefore(_el, document.body.firstChild);
    }

    const W = window.innerWidth, H = window.innerHeight;
    _R = new THREE.WebGLRenderer({ canvas: _el, antialias: false });
    _R.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    _R.setSize(W, H, false);

    _scene = new THREE.Scene();
    _cam   = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const geo = new THREE.PlaneGeometry(2, 2);
    _mat = new THREE.ShaderMaterial({
      vertexShader:   VERT,
      fragmentShader: FRAG,
      uniforms: {
        uTime:       { value: 0 },
        uResolution: { value: new THREE.Vector2(W, H) },
        uShoot1:     { value: new THREE.Vector2(-1, 0.55) },
        uShoot2:     { value: new THREE.Vector2(-1, 0.42) },
      },
    });
    _scene.add(new THREE.Mesh(geo, _mat));
    _R.compile(_scene, _cam);   // pre-compile shaders & upload data → no first-frame hitch

    _lastNow = performance.now();
    _clock   = 0;
    _raf     = requestAnimationFrame(_loop);
  }

  function _loop(now) {
    _raf = requestAnimationFrame(_loop);
    if (!_R || !_mat) return;

    const dt = Math.min(now - _lastNow, 50);
    _lastNow = now;
    _clock  += dt * 0.001;

    // Update shooting stars
    const u = _mat.uniforms;
    _ss.forEach((ss, i) => {
      const key = i === 0 ? 'uShoot1' : 'uShoot2';
      if (ss.prog >= 0) {
        ss.prog += dt * 0.0015;   // ~660ms full life
        if (ss.prog >= 1) {
          ss.prog = -1;
          ss.next = _clock + 3 + Math.random() * 6;   // next 3-9s
          ss.angle = 0.3 + Math.random() * 0.5;
        }
        u[key].value.set(ss.prog, ss.angle);
      } else {
        if (_clock >= ss.next) {
          ss.prog = 0;
        }
        u[key].value.set(-1, ss.angle);
      }
    });

    u.uTime.value = _clock;

    // Handle resize
    const W = window.innerWidth, H = window.innerHeight;
    if (Math.abs(_R.domElement.width  - W) > 4 ||
        Math.abs(_R.domElement.height - H) > 4) {
      _R.setSize(W, H, false);
      u.uResolution.value.set(W, H);
    }

    _R.render(_scene, _cam);
  }

  function start() {
    if (_running) return;
    _running = true;
    _ss.forEach(ss => { ss.prog = -1; ss.next = 2 + Math.random() * 4; });
    if (typeof THREE === 'undefined') {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r149/three.min.js';
      s.onload = _launch;
      document.head.appendChild(s);
    } else {
      _launch();
    }
  }

  function stop() {
    _running = false;
    cancelAnimationFrame(_raf);
    if (_el) { _el.remove(); _el = null; }
    if (_R)  { _R.dispose(); _R = null; }
    _mat = _scene = _cam = null;
  }

  return { start, stop };
})();

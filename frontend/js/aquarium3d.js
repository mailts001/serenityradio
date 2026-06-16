'use strict';
/* ═══════════════════════════════════════════════════════════════════════
   AQUARIUM3D  —  WebGL Samples–inspired Three.js aquarium
   Serenity Radio  ·  2026

   Fish system directly follows WebGL Samples/WebGLSamples.github.io:
   • Lissajous-curve parametric orbits  (Math.sin/cos with per-axis clocks)
   • GPU vertex-shader body-wave animation  (fishVertexShader.glsl math)
   • worldPosition + nextPosition uniforms → orientation built in shader
   • Per-species: fishLength, fishWaveLength, fishBendAmount, tailSpeed

   Environment:
   • Animated caustic floor (CanvasTexture, updated each frame)
   • Semi-transparent cone light shafts
   • Vertex-displaced water surface
   • Seaweed (CatmullRomCurve3 line meshes)
   • Bubble particle system (Points)
   • Coral + rock clusters
   ═══════════════════════════════════════════════════════════════════════ */
const Aquarium3D = (() => {

  const CDN = 'https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js';

  // ── Tank half-extents (world units)
  const TW = 14, TH = 7.5, TD = 12;

  // ── Live tuning parameters (adjusted by control panel)
  let _tuning = { speed: 1.0, bend: 1.0, wave: 1.0 };

  // ── Fish species  (adapted from WebGL Samples g_fishTable, scaled to tank)
  //    xCk/yCk/zCk: per-species Lissajous clock multipliers (same for all fish
  //    in species → they trace the SAME orbit).  Each fish gets a different
  //    clockOffset so they're spread around the path → schooling behaviour.
  // ── Shared texture helper: draws a fish-scale pattern across the canvas
  //    UV layout on LatheGeometry (post rotateX): U=circumference (0=dorsal
  //    top, 0.5=ventral belly), V=0=tail end, V=1=head end.
  //    With Three.js flipY=true: canvas Y=0 → head, canvas Y=H → tail.
  //    Canvas X=0 → dorsal, X=W/2 → belly, X=W → back to dorsal.
  function _drawScales(ctx, W, H, sz, color) {
    ctx.strokeStyle = color; ctx.lineWidth = 0.9;
    for (let row = 0; row <= H / sz + 1; row++) {
      const xOff = (row & 1) * (sz * 0.5);
      for (let col = -1; col <= W / sz + 1; col++) {
        ctx.beginPath();
        ctx.arc(col * sz + xOff, row * sz, sz * 0.62, 0.05 * Math.PI, 0.95 * Math.PI);
        ctx.stroke();
      }
    }
  }

  const SPECIES = [
    {
      name: 'SmallFishA',   // clownfish — bright orange, 3 white rings
      count: 22,  speed: 1.0, speedRange: 1.5,
      radius: 8,  radiusRange: 6,
      xCk: 1.0, yCk: 0.45, zCk: 0.95,
      tailSpeed: 10, heightOffset: -1, heightRange: 4.5,
      fishLength: 1.8, fishWaveLength: 1.0, fishBendAmount: 2.0,
      fishScale: 1.0,
      tex: (ctx) => {
        const W=256, H=256; ctx.canvas.width=W; ctx.canvas.height=H;
        // Base: vivid orange
        ctx.fillStyle='#e05000'; ctx.fillRect(0,0,W,H);
        _drawScales(ctx,W,H,18,'rgba(80,10,0,0.20)');
        // 3 white vertical bands (ring around body) — at head, mid, near-tail
        [0.12, 0.48, 0.80].forEach(u => {
          const x = u * W;
          ctx.fillStyle='rgba(255,255,255,0.90)'; ctx.fillRect(x-11,0,22,H);
          ctx.fillStyle='rgba(0,0,0,0.55)'; ctx.fillRect(x-12,0,2,H);
          ctx.fillStyle='rgba(0,0,0,0.55)'; ctx.fillRect(x+10,0,2,H);
        });
        // Belly: lighter (X = W/2 = ventral surface)
        const belly=ctx.createLinearGradient(W*0.3,0,W*0.5,0);
        belly.addColorStop(0,'rgba(255,200,130,0)'); belly.addColorStop(1,'rgba(255,200,130,0.45)');
        ctx.fillStyle=belly; ctx.fillRect(0,0,W,H);
        const belly2=ctx.createLinearGradient(W*0.7,0,W*0.5,0);
        belly2.addColorStop(0,'rgba(255,200,130,0)'); belly2.addColorStop(1,'rgba(255,200,130,0.45)');
        ctx.fillStyle=belly2; ctx.fillRect(0,0,W,H);
        // Eye: near head (canvas top Y≈0) on right side (X≈W*0.75)
        ctx.fillStyle='#111'; ctx.beginPath(); ctx.arc(W*0.76, H*0.06, 7, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle='rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.arc(W*0.76-2, H*0.06-2, 3, 0, Math.PI*2); ctx.fill();
      },
    },
    {
      name: 'SmallFishB',   // blue chromis — vivid blue, iridescent stripe
      count: 20,  speed: 1.5, speedRange: 2.0,
      radius: 6,  radiusRange: 5,
      xCk: 0.75, yCk: 0.55, zCk: 1.05,
      tailSpeed: 12, heightOffset: 2.5, heightRange: 3.5,
      fishLength: 1.4, fishWaveLength: 1.0, fishBendAmount: 1.8,
      fishScale: 0.8,
      tex: (ctx) => {
        const W=256, H=256; ctx.canvas.width=W; ctx.canvas.height=H;
        // Base blue-to-cyan gradient (dorsal to belly)
        const bg=ctx.createLinearGradient(0,0,W,0);
        bg.addColorStop(0,'#0040cc'); bg.addColorStop(0.5,'#00ccff'); bg.addColorStop(1,'#0040cc');
        ctx.fillStyle=bg; ctx.fillRect(0,0,W,H);
        _drawScales(ctx,W,H,14,'rgba(0,20,100,0.22)');
        // Iridescent silver-cyan mid-lateral stripe (horizontal band at Y=H/2)
        const stripe=ctx.createLinearGradient(0,H*0.42,0,H*0.58);
        stripe.addColorStop(0,'rgba(130,255,255,0)');
        stripe.addColorStop(0.5,'rgba(200,255,255,0.65)');
        stripe.addColorStop(1,'rgba(130,255,255,0)');
        ctx.fillStyle=stripe; ctx.fillRect(0,0,W,H);
        // Specular highlight (dorsal shimmer)
        const spec=ctx.createLinearGradient(0,0,W*0.18,0);
        spec.addColorStop(0,'rgba(255,255,255,0.35)'); spec.addColorStop(1,'rgba(255,255,255,0)');
        ctx.fillStyle=spec; ctx.fillRect(0,0,W,H);
        // Eye
        ctx.fillStyle='#080c18'; ctx.beginPath(); ctx.arc(W*0.76, H*0.06, 6, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle='rgba(200,240,255,0.7)'; ctx.beginPath(); ctx.arc(W*0.75, H*0.055, 2.5, 0, Math.PI*2); ctx.fill();
      },
    },
    {
      name: 'MediumFishA',  // goldfish — metallic gold scales
      count: 10,  speed: 0.8, speedRange: 0.8,
      radius: 10, radiusRange: 5,
      xCk: 0.9, yCk: 0.35, zCk: 0.85,
      tailSpeed: 7, heightOffset: 0, heightRange: 3.5,
      fishLength: 2.8, fishWaveLength: 0.8, fishBendAmount: 1.5,
      fishScale: 1.4,
      tex: (ctx) => {
        const W=256, H=256; ctx.canvas.width=W; ctx.canvas.height=H;
        // Rich metallic gold base
        const bg=ctx.createLinearGradient(0,0,W,0);
        bg.addColorStop(0,'#c88000'); bg.addColorStop(0.5,'#ffe040'); bg.addColorStop(1,'#c88000');
        ctx.fillStyle=bg; ctx.fillRect(0,0,W,H);
        _drawScales(ctx,W,H,20,'rgba(100,40,0,0.25)');
        // Orange tint on rear body (tail end = canvas bottom)
        const tail=ctx.createLinearGradient(0,H*0.6,0,H);
        tail.addColorStop(0,'rgba(220,100,0,0)'); tail.addColorStop(1,'rgba(220,100,0,0.5)');
        ctx.fillStyle=tail; ctx.fillRect(0,0,W,H);
        // White belly shimmer
        const belly=ctx.createLinearGradient(W*0.35,0,W*0.5,0);
        belly.addColorStop(0,'rgba(255,255,200,0)'); belly.addColorStop(1,'rgba(255,255,200,0.55)');
        ctx.fillStyle=belly; ctx.fillRect(0,0,W,H);
        const belly2=ctx.createLinearGradient(W*0.65,0,W*0.5,0);
        belly2.addColorStop(0,'rgba(255,255,200,0)'); belly2.addColorStop(1,'rgba(255,255,200,0.55)');
        ctx.fillStyle=belly2; ctx.fillRect(0,0,W,H);
        // Dark dorsal ridge
        const dors=ctx.createLinearGradient(0,0,W*0.12,0);
        dors.addColorStop(0,'rgba(0,0,0,0.30)'); dors.addColorStop(1,'rgba(0,0,0,0)');
        ctx.fillStyle=dors; ctx.fillRect(0,0,W,H);
        // Eye
        ctx.fillStyle='#1a0800'; ctx.beginPath(); ctx.arc(W*0.78, H*0.07, 8, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle='rgba(255,240,100,0.6)'; ctx.beginPath(); ctx.arc(W*0.77, H*0.065, 3, 0, Math.PI*2); ctx.fill();
      },
    },
    {
      name: 'MediumFishB',  // parrotfish — emerald green with blue fin edges
      count: 10,  speed: 0.9, speedRange: 1.0,
      radius: 8,  radiusRange: 4,
      xCk: 1.05, yCk: 0.6, zCk: 0.80,
      tailSpeed: 8, heightOffset: -2, heightRange: 4,
      fishLength: 2.6, fishWaveLength: 0.9, fishBendAmount: 1.8,
      fishScale: 1.2,
      tex: (ctx) => {
        const W=256, H=256; ctx.canvas.width=W; ctx.canvas.height=H;
        const bg=ctx.createLinearGradient(0,0,W,0);
        bg.addColorStop(0,'#008830'); bg.addColorStop(0.5,'#44cc60'); bg.addColorStop(1,'#008830');
        ctx.fillStyle=bg; ctx.fillRect(0,0,W,H);
        _drawScales(ctx,W,H,18,'rgba(0,40,10,0.24)');
        // Blue fin-edge tint in tail area and dorsal
        const blue1=ctx.createLinearGradient(0,H*0.7,0,H);
        blue1.addColorStop(0,'rgba(30,100,200,0)'); blue1.addColorStop(1,'rgba(30,80,200,0.50)');
        ctx.fillStyle=blue1; ctx.fillRect(0,0,W,H);
        const dors=ctx.createLinearGradient(0,0,W*0.12,0);
        dors.addColorStop(0,'rgba(0,80,160,0.40)'); dors.addColorStop(1,'rgba(0,80,160,0)');
        ctx.fillStyle=dors; ctx.fillRect(0,0,W,H);
        // Yellow lateral stripe
        const lat=ctx.createLinearGradient(0,H*0.44,0,H*0.56);
        lat.addColorStop(0,'rgba(255,220,0,0)'); lat.addColorStop(0.5,'rgba(255,220,0,0.45)'); lat.addColorStop(1,'rgba(255,220,0,0)');
        ctx.fillStyle=lat; ctx.fillRect(0,0,W,H);
        // Eye
        ctx.fillStyle='#050d05'; ctx.beginPath(); ctx.arc(W*0.77, H*0.07, 7, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle='rgba(180,255,180,0.6)'; ctx.beginPath(); ctx.arc(W*0.76, H*0.065, 3, 0, Math.PI*2); ctx.fill();
      },
    },
    {
      name: 'BigFishA',     // reef shark — sleek grey-blue, white belly, black fin tips
      count: 3,   speed: 0.4, speedRange: 0.3,
      radius: 11, radiusRange: 3,
      xCk: 0.85, yCk: 0.25, zCk: 1.0,
      tailSpeed: 4, heightOffset: 1, heightRange: 2.5,
      fishLength: 5.5, fishWaveLength: 0.6, fishBendAmount: 1.2,
      fishScale: 2.8,
      tex: (ctx) => {
        const W=256, H=256; ctx.canvas.width=W; ctx.canvas.height=H;
        // Dorsal: dark blue-grey, belly: cream-white
        const bg=ctx.createLinearGradient(0,0,W,0);
        bg.addColorStop(0,'#3a4a58'); bg.addColorStop(0.38,'#8a9aaa'); bg.addColorStop(0.5,'#dce8f0'); bg.addColorStop(0.62,'#8a9aaa'); bg.addColorStop(1,'#3a4a58');
        ctx.fillStyle=bg; ctx.fillRect(0,0,W,H);
        // Subtle scale texture (sharks have dermal denticles — tiny)
        _drawScales(ctx,W,H,10,'rgba(0,0,0,0.07)');
        // Dark lateral stripe
        const lat=ctx.createLinearGradient(0,H*0.28,0,H*0.38);
        lat.addColorStop(0,'rgba(20,30,40,0)'); lat.addColorStop(0.5,'rgba(20,30,40,0.35)'); lat.addColorStop(1,'rgba(20,30,40,0)');
        ctx.fillStyle=lat; ctx.fillRect(0,0,W,H);
        // Black fin tips: tail area (canvas bottom)
        const ftip=ctx.createLinearGradient(0,H*0.80,0,H);
        ftip.addColorStop(0,'rgba(0,0,0,0)'); ftip.addColorStop(1,'rgba(0,0,0,0.60)');
        ctx.fillStyle=ftip; ctx.fillRect(0,0,W,H);
        // Eye (large, dark, near head = canvas top)
        ctx.fillStyle='#040810'; ctx.beginPath(); ctx.arc(W*0.77, H*0.055, 9, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle='rgba(180,200,220,0.5)'; ctx.beginPath(); ctx.arc(W*0.77-2, H*0.05, 4, 0, Math.PI*2); ctx.fill();
      },
    },
    {
      name: 'BigFishB',     // giant tropical — bronze-copper, wide colour bands
      count: 2,   speed: 0.35, speedRange: 0.2,
      radius: 12, radiusRange: 2,
      xCk: 0.95, yCk: 0.20, zCk: 0.90,
      tailSpeed: 3.5, heightOffset: 0, heightRange: 2,
      fishLength: 6.5, fishWaveLength: 0.5, fishBendAmount: 1.0,
      fishScale: 3.2,
      tex: (ctx) => {
        const W=256, H=256; ctx.canvas.width=W; ctx.canvas.height=H;
        const bg=ctx.createLinearGradient(0,0,W,0);
        bg.addColorStop(0,'#7a3200'); bg.addColorStop(0.5,'#e07030'); bg.addColorStop(1,'#7a3200');
        ctx.fillStyle=bg; ctx.fillRect(0,0,W,H);
        _drawScales(ctx,W,H,24,'rgba(60,10,0,0.22)');
        // Wide dark-brown alternating bands across body length (vertical in canvas)
        [0.20, 0.46, 0.72].forEach(u => {
          const x = u * W;
          ctx.fillStyle='rgba(50,10,0,0.48)'; ctx.fillRect(x-16,0,32,H);
        });
        // Gold shimmer highlights between bands
        [0.33, 0.59].forEach(u => {
          const x = u * W;
          const g=ctx.createLinearGradient(x-12,0,x,0);
          g.addColorStop(0,'rgba(255,200,50,0)'); g.addColorStop(1,'rgba(255,200,50,0.38)');
          ctx.fillStyle=g; ctx.fillRect(x-12,0,12,H);
          const g2=ctx.createLinearGradient(x+12,0,x,0);
          g2.addColorStop(0,'rgba(255,200,50,0)'); g2.addColorStop(1,'rgba(255,200,50,0.38)');
          ctx.fillStyle=g2; ctx.fillRect(x,0,12,H);
        });
        // Pale belly
        const belly=ctx.createLinearGradient(W*0.38,0,W*0.5,0);
        belly.addColorStop(0,'rgba(255,200,150,0)'); belly.addColorStop(1,'rgba(255,200,150,0.40)');
        ctx.fillStyle=belly; ctx.fillRect(0,0,W,H);
        const belly2=ctx.createLinearGradient(W*0.62,0,W*0.5,0);
        belly2.addColorStop(0,'rgba(255,200,150,0)'); belly2.addColorStop(1,'rgba(255,200,150,0.40)');
        ctx.fillStyle=belly2; ctx.fillRect(0,0,W,H);
        // Eye
        ctx.fillStyle='#1a0800'; ctx.beginPath(); ctx.arc(W*0.78, H*0.06, 10, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle='rgba(255,200,80,0.55)'; ctx.beginPath(); ctx.arc(W*0.78-2, H*0.055, 4, 0, Math.PI*2); ctx.fill();
      },
    },
  ];

  // ════════════════════════════════════════════════════════════════════
  //  FISH SHADERS  —  vertex shader follows WebGL Samples fishVertexShader
  // ════════════════════════════════════════════════════════════════════
  const FISH_VERT = /* glsl */`
    // Per-fish uniforms (set each frame)
    uniform vec3  uWorldPos;       // fish current world position
    uniform vec3  uNextPos;        // fish position ~1 frame ahead (for orientation)
    uniform float uScale;          // uniform body scale
    uniform float uTime;           // tail animation clock
    uniform float uFishLength;     // body length in local units
    uniform float uFishWaveLength; // body wave spatial frequency
    uniform float uFishBendAmount; // tail wave amplitude

    varying vec2 vUv;
    varying float vDiffuse;

    void main() {
      // ── Orientation: build rotation matrix from worldPos → nextPos ──
      vec3 vz = normalize(uWorldPos - uNextPos);
      vec3 vx = normalize(cross(vec3(0.0, 1.0, 0.0), vz));
      vec3 vy = cross(vz, vx);

      // World matrix = orientation * uniform scale + translation
      mat4 world = mat4(
        vec4(vx * uScale, 0.0),
        vec4(vy * uScale, 0.0),
        vec4(vz * uScale, 0.0),
        vec4(uWorldPos,   1.0)
      );

      // ── Body-wave animation  (exact WebGL Samples fishVertexShader math) ──
      // position.z: positive = head side, negative = tail side
      float mult = position.z > 0.0
        ? ( position.z / uFishLength)
        : (-position.z / uFishLength * 2.0);
      float s      = sin(uTime + mult * uFishWaveLength);
      float xOff   = pow(mult, 2.0) * s * uFishBendAmount;

      vec4 aPos = vec4(position.x + xOff, position.y, position.z, 1.0);

      // ── Lighting ──
      vec3 wNormal  = normalize((world * vec4(normal, 0.0)).xyz);
      vec3 lightDir = normalize(vec3(0.4, 1.0, 0.6));
      vDiffuse = clamp(dot(wNormal, lightDir), 0.0, 1.0);

      vUv       = uv;
      gl_Position = projectionMatrix * viewMatrix * world * aPos;
    }
  `;

  const FISH_FRAG = /* glsl */`
    uniform sampler2D uMap;
    uniform vec3      uAmbient;

    varying vec2  vUv;
    varying float vDiffuse;

    void main() {
      vec3 col = texture2D(uMap, vUv).rgb;
      // uAmbient is underwater tint.  vDiffuse adds directional light.
      // Keep colours visible: clamp total light to [0.25, 1.0] range so fish
      // textures are always readable regardless of orientation.
      float light = clamp(dot(uAmbient, vec3(0.333)) + vDiffuse * 0.85, 0.25, 1.0);
      gl_FragColor = vec4(col * light, 1.0);
    }
  `;

  // ── State
  let _canvas2d = null, _el = null;
  let _R = null, _scene = null, _cam = null;
  let _raf = null, _running = false;
  let _W = 0, _H = 0;

  let _fish = [];           // [{mesh, mat, worldPos, nextPos, xCk, yCk, zCk, clockOffset, species}]
  let _seaweeds = [];
  let _bubbleGeo = null;
  let _waterSurface = null;
  let _causticCanvas = null, _causticCtx = null, _causticTex = null;
  let _disposables = [];    // everything to dispose on stop()
  let _clock = 0;           // seconds elapsed

  // ════════════════════════════════════════════════════════════════════
  //  FISH GEOMETRY  (all parts merged into one BufferGeometry)
  //  Local Z axis: –Z = tail, +Z = head  (matches FISH_VERT shader)
  // ════════════════════════════════════════════════════════════════════

  // Helper: merge a list of geometries (indexed or not) → non-indexed result
  function _mergeGeos(geos) {
    // Convert each to non-indexed
    const parts = geos.map(g => {
      if (!g) return null;
      const ni = g.index ? g.toNonIndexed() : g;
      if (!ni.attributes.normal) ni.computeVertexNormals();
      return ni;
    }).filter(Boolean);

    let total = 0;
    parts.forEach(g => { total += g.attributes.position.count; });

    const pos = new Float32Array(total * 3);
    const nrm = new Float32Array(total * 3);
    const uvs = new Float32Array(total * 2);
    let off = 0;
    parts.forEach(g => {
      const n = g.attributes.position.count;
      pos.set(g.attributes.position.array, off * 3);
      nrm.set(g.attributes.normal.array,   off * 3);
      uvs.set(g.attributes.uv ? g.attributes.uv.array : new Float32Array(n * 2), off * 2);
      off += n;
    });

    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    merged.setAttribute('normal',   new THREE.BufferAttribute(nrm, 3));
    merged.setAttribute('uv',       new THREE.BufferAttribute(uvs, 2));
    return merged;
  }

  // Helper: create non-indexed geometry from raw triangle vertex array + uv array
  function _triGeo(verts, uvArr) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
    if (uvArr) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvArr), 2));
    g.computeVertexNormals();
    return g;
  }

  // ── Body (LatheGeometry, torpedo profile)
  function _fishBodyGeo(FL) {
    const pts = [
      new THREE.Vector2(0.005,       -FL * 0.500),   // tail tip
      new THREE.Vector2(FL * 0.042,  -FL * 0.450),
      new THREE.Vector2(FL * 0.080,  -FL * 0.340),
      new THREE.Vector2(FL * 0.108,  -FL * 0.180),
      new THREE.Vector2(FL * 0.122,  -FL * 0.020),   // widest (slightly rear of midpoint)
      new THREE.Vector2(FL * 0.118,   FL * 0.130),
      new THREE.Vector2(FL * 0.108,   FL * 0.270),
      new THREE.Vector2(FL * 0.090,   FL * 0.390),
      new THREE.Vector2(FL * 0.062,   FL * 0.460),
      new THREE.Vector2(FL * 0.032,   FL * 0.490),
      new THREE.Vector2(0.006,        FL * 0.500),   // head tip (mouth)
    ];
    const geo = new THREE.LatheGeometry(pts, 18);  // 18 radial segments = smoother
    geo.rotateX(Math.PI / 2);    // spine → Z axis
    geo.scale(0.44, 1.0, 1.0);   // laterally compressed (fish are flat-sided)
    return geo;
  }

  // ── Dorsal fin (triangular spine on top, 8 triangle fan)
  function _dorsalFinGeo(FL) {
    const Z0 = FL * 0.05;    // front of fin (near head)
    const Z1 = -FL * 0.28;   // rear of fin
    const BODY_TOP = FL * 0.12;  // approximate body radius at top
    const H = FL * 0.20;     // fin height
    const N = 8;
    const verts = [], uvArr = [];
    for (let i = 0; i < N; i++) {
      const t0 = i / N, t1 = (i + 1) / N;
      const z0 = Z0 + t0 * (Z1 - Z0);
      const z1 = Z0 + t1 * (Z1 - Z0);
      // Height profile: tallest at ~30% from front
      const h0 = H * Math.sin(t0 * Math.PI * 0.95);
      const h1 = H * Math.sin(t1 * Math.PI * 0.95);
      const y  = BODY_TOP;
      // Two triangles per segment (quad)
      verts.push(0,y,z0,  0,y+h0,z0,  0,y+h1,z1);
      verts.push(0,y,z0,  0,y+h1,z1,  0,y,z1);
      // UV: dorsal maps to top-center strip of texture (U: 0.35-0.65, V: 0.78-0.98)
      uvArr.push(0.35+t0*0.3,0.78,  0.35+t0*0.3,0.98,  0.35+t1*0.3,0.98);
      uvArr.push(0.35+t0*0.3,0.78,  0.35+t1*0.3,0.98,  0.35+t1*0.3,0.78);
    }
    return _triGeo(verts, uvArr);
  }

  // ── Caudal fin = proper forked tail with 8 triangles per lobe
  function _caudalFinGeo(FL) {
    const AZ = -FL * 0.42;   // Z where fin meets body
    const FZ = -FL * 0.62;   // Z tip of fin (further back than old 2-triangle tail)
    const FY = FL * 0.27;    // max Y spread of each lobe
    const N  = 8;
    const verts = [], uvArr = [];

    for (const s of [-1, 1]) {  // s=-1 lower lobe, s=+1 upper lobe
      for (let i = 0; i < N; i++) {
        const t0 = i / N, t1 = (i + 1) / N;

        // Lobe edge uses a sine arc for natural curvature
        const a0 = t0 * Math.PI * 0.88, a1 = t1 * Math.PI * 0.88;
        const ey0 = s * FY * Math.sin(a0);
        const ey1 = s * FY * Math.sin(a1);
        // Z progresses from attachment toward tip
        const ez0 = AZ + (FZ - AZ) * Math.pow(t0, 0.55);
        const ez1 = AZ + (FZ - AZ) * Math.pow(t1, 0.55);
        // Slight X flare
        const ex0 = Math.cos(a0) * FL * 0.04;
        const ex1 = Math.cos(a1) * FL * 0.04;

        // Winding: upper lobe CCW (as seen from +X), lower lobe CW
        if (s > 0) {
          verts.push(0,0,AZ,  ex0,ey0,ez0,  ex1,ey1,ez1);
        } else {
          verts.push(0,0,AZ,  ex1,ey1,ez1,  ex0,ey0,ez0);
        }

        // UV: tail maps to right stripe of texture
        const uBase = 0.80, uTip = 0.98;
        const vCtr = 0.50;
        uvArr.push(
          uBase, vCtr,
          uBase + t0 * (uTip - uBase), vCtr + s * 0.44 * Math.sin(a0),
          uBase + t1 * (uTip - uBase), vCtr + s * 0.44 * Math.sin(a1),
        );
      }
    }
    return _triGeo(verts, uvArr);
  }

  // ── Pectoral fins (two side wings, near head)
  function _pectoralFinGeo(FL) {
    const verts = [], uvArr = [];
    const ZC = FL * 0.18;   // attachment Z (near head side)
    const BX = FL * 0.044;  // body X at attachment (flattened body)
    const WR = FL * 0.15;   // fin reach
    const N  = 5;

    for (const s of [-1, 1]) {  // s=-1 left, s=+1 right (sign of X)
      for (let i = 0; i < N; i++) {
        const t0 = i / N, t1 = (i + 1) / N;
        // Fan from body wall outward
        const a0 = t0 * Math.PI * 0.72 - 0.2;
        const a1 = t1 * Math.PI * 0.72 - 0.2;
        const x0 = s * (BX + Math.cos(a0) * WR);
        const x1 = s * (BX + Math.cos(a1) * WR);
        const y0 = Math.sin(a0) * WR * 0.40 - FL * 0.02;
        const y1 = Math.sin(a1) * WR * 0.40 - FL * 0.02;
        const z0 = ZC - Math.sin(a0) * WR * 0.28;
        const z1 = ZC - Math.sin(a1) * WR * 0.28;

        if (s > 0) {
          verts.push(s*BX, 0, ZC,  x0,y0,z0,  x1,y1,z1);
        } else {
          verts.push(s*BX, 0, ZC,  x1,y1,z1,  x0,y0,z0);
        }

        uvArr.push(
          0.5 + s*0.07, 0.45,
          0.5 + s*0.10 + t0*s*0.09, 0.45 - i*0.04,
          0.5 + s*0.10 + t1*s*0.09, 0.45 - (i+1)*0.04,
        );
      }
    }
    return _triGeo(verts, uvArr);
  }

  // ── Create full fish (body + dorsal + caudal + pectoral)
  function _createFishGeo(FL) {
    return _mergeGeos([
      _fishBodyGeo(FL),
      _dorsalFinGeo(FL),
      _caudalFinGeo(FL),
      _pectoralFinGeo(FL),
    ]);
  }

  // ════════════════════════════════════════════════════════════════════
  //  CANVAS TEXTURE
  // ════════════════════════════════════════════════════════════════════
  function _makeTex(drawFn) {
    const c = document.createElement('canvas');
    c.width = c.height = 256;  // higher resolution for scale detail
    drawFn(c.getContext('2d'));
    const t = new THREE.CanvasTexture(c);
    _disposables.push(t);
    return t;
  }

  // ════════════════════════════════════════════════════════════════════
  //  BUILD FISH  — one ShaderMaterial clone per fish (independent uniforms)
  // ════════════════════════════════════════════════════════════════════
  function _buildFishForSpecies(spec, tex, geo) {
    // Brighter ambient — underwater blue-green tint but bright enough to see textures
    const ambient = new THREE.Color(0x4466aa);
    for (let i = 0; i < spec.count; i++) {
      // All fish in species share the SAME Lissajous multipliers (from spec)
      // → they trace identical orbits.  Phase offsets spread them around the path
      // → looks like a school of fish swimming together.
      const xCk = spec.xCk;
      const yCk = spec.yCk;
      const zCk = spec.zCk;
      // Evenly distribute fish around the orbit, with a small random jitter
      const clockOffset = (i / spec.count) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      const speed  = spec.speed + Math.random() * spec.speedRange * 0.3;  // tighter speed range
      const radius = spec.radius + (Math.random() - 0.5) * spec.radiusRange * 0.5;

      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uWorldPos:       { value: new THREE.Vector3() },
          uNextPos:        { value: new THREE.Vector3() },
          uScale:          { value: spec.fishScale },
          uTime:           { value: 0 },
          uFishLength:     { value: spec.fishLength },
          uFishWaveLength: { value: spec.fishWaveLength },
          uFishBendAmount: { value: spec.fishBendAmount },
          uMap:            { value: tex },
          uAmbient:        { value: ambient },
        },
        vertexShader:   FISH_VERT,
        fragmentShader: FISH_FRAG,
        side: THREE.DoubleSide,
      });

      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;   // shader positions geometry; skip CPU culling
      _scene.add(mesh);
      _disposables.push(mesh, mat);

      _fish.push({ mesh, mat, speed, radius, xCk, yCk, zCk, clockOffset, spec });
    }
  }

  // ════════════════════════════════════════════════════════════════════
  //  FISH MOVEMENT  (WebGL Samples Lissajous orbits)
  // ════════════════════════════════════════════════════════════════════
  function _updateFish(clock) {
    const spd  = _tuning.speed;
    const bend = _tuning.bend;
    const wave = _tuning.wave;
    _fish.forEach(f => {
      const fc  = clock * f.speed * spd + f.clockOffset;
      const r   = f.radius;
      const rY  = f.spec.heightRange;
      const hOff = f.spec.heightOffset;

      const xC = fc * f.xCk,  yC = fc * f.yCk,  zC = fc * f.zCk;
      // nextPos = slightly in the past → worldPos - nextPos ≈ velocity = forward dir
      const xCN = (fc - 0.04) * f.xCk;
      const yCN = (fc - 0.01) * f.yCk;
      const zCN = (fc - 0.01) * f.zCk;

      f.mat.uniforms.uWorldPos.value.set(
        Math.sin(xC) * r,
        Math.sin(yC) * rY + hOff,
        Math.cos(zC) * r,
      );
      f.mat.uniforms.uNextPos.value.set(
        Math.sin(xCN) * r,
        Math.sin(yCN) * rY + hOff,
        Math.cos(zCN) * r,
      );
      // Apply live-tuning to wave uniforms
      f.mat.uniforms.uFishBendAmount.value  = f.spec.fishBendAmount  * bend;
      f.mat.uniforms.uFishWaveLength.value  = f.spec.fishWaveLength  * wave;
      // Tail animation clock (separate tail-speed tuning)
      f.mat.uniforms.uTime.value =
        (clock * f.spec.tailSpeed * f.speed * spd * _tuning.tail + f.clockOffset) % (Math.PI * 2);
    });
  }

  // ════════════════════════════════════════════════════════════════════
  //  CAUSTIC FLOOR
  // ════════════════════════════════════════════════════════════════════
  function _initCaustics() {
    _causticCanvas = document.createElement('canvas');
    _causticCanvas.width = _causticCanvas.height = 256;
    _causticCtx = _causticCanvas.getContext('2d');
    _causticTex = new THREE.CanvasTexture(_causticCanvas);
    _causticTex.wrapS = _causticTex.wrapT = THREE.RepeatWrapping;
    _causticTex.repeat.set(5, 4);
    _disposables.push(_causticTex);
  }

  function _updateCaustics(t) {
    const ctx = _causticCtx, W = 256, H = 256;
    ctx.fillStyle = '#c2a268'; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 32; i++) {
      const cx = ((Math.sin(t * 0.38 + i * 2.51) * 0.45 + 0.5 + (i % 6) / 6.0) % 1.0) * W;
      const cy = ((Math.cos(t * 0.25 + i * 1.72) * 0.45 + 0.5 + Math.floor(i/6) / 5.0) % 1.0) * H;
      const r  = 7 + Math.sin(t * 0.9 + i * 0.8) * 4;
      const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      gr.addColorStop(0,   'rgba(255,240,170,0.85)');
      gr.addColorStop(0.5, 'rgba(255,225,130,0.35)');
      gr.addColorStop(1,   'rgba(0,0,0,0)');
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    }
    _causticTex.needsUpdate = true;
  }

  // ════════════════════════════════════════════════════════════════════
  //  SCENE SETUP
  // ════════════════════════════════════════════════════════════════════
  function _buildScene() {
    _scene.background = new THREE.Color(0x002a40);
    _scene.fog = new THREE.Fog(0x002a40, 20, 46);

    // Ambient + directional (simulates sunlight from above)
    _scene.add(new THREE.AmbientLight(0x003355, 0.9));
    const sun = new THREE.DirectionalLight(0x88ccff, 1.6);
    sun.position.set(3, 12, 5);
    _scene.add(sun);
    const fill = new THREE.PointLight(0x0066aa, 0.7, 22);
    fill.position.set(-TW * 0.5, TH * 0.3, 0);
    _scene.add(fill);

    // ── Caustic sand floor
    _initCaustics(); _updateCaustics(0);
    const floorG = new THREE.PlaneGeometry(TW * 2.2, TD * 2.2);
    const floorM = new THREE.MeshStandardMaterial({ map: _causticTex, roughness: 0.95 });
    const floor  = new THREE.Mesh(floorG, floorM);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -TH;
    _scene.add(floor);
    _disposables.push(floor, floorG, floorM);

    // ── Back wall (depth)
    const bwG = new THREE.PlaneGeometry(TW * 2.2, TH * 2.2);
    const bwM = new THREE.MeshStandardMaterial({
      color: 0x001a2d, transparent: true, opacity: 0.6, roughness: 0.1,
    });
    const bw = new THREE.Mesh(bwG, bwM);
    bw.position.set(0, -TH * 0.1, -TD);
    _scene.add(bw);
    _disposables.push(bw, bwG, bwM);

    // ── Light shafts (light rays from surface, similar to WebGL Samples LightRay)
    const shaftM = new THREE.MeshBasicMaterial({
      color: 0x70c0ff, transparent: true, opacity: 0.042,
      depthWrite: false, side: THREE.DoubleSide,
    });
    [-TW*0.55, -TW*0.18, TW*0.18, TW*0.55].forEach((x, i) => {
      const sg = new THREE.ConeGeometry(2.4, TH * 2.4, 6, 1, true);
      const s  = new THREE.Mesh(sg, shaftM);
      s.position.set(x, -TH * 0.1, (i % 2 ? 2.5 : -2.5));
      s.rotation.x = 0.07 + i * 0.018;
      _scene.add(s);
      _disposables.push(s, sg);
    });
    _disposables.push(shaftM);

    // ── Water surface
    const surfG = new THREE.PlaneGeometry(TW * 2.2, TD * 2.2, 26, 26);
    const surfM = new THREE.MeshStandardMaterial({
      color: 0x1878aa, transparent: true, opacity: 0.25,
      roughness: 0.04, metalness: 0.3, side: THREE.DoubleSide,
    });
    _waterSurface = new THREE.Mesh(surfG, surfM);
    _waterSurface.rotation.x = -Math.PI / 2;
    _waterSurface.position.y = TH * 0.9;
    _scene.add(_waterSurface);
    _disposables.push(_waterSurface, surfG, surfM);

    // ── Coral + rocks
    _buildCoral();

    // ── Seaweed (WebGL Samples SeaweedA/B rendered as line curves here)
    _buildSeaweed();

    // ── Bubbles
    _buildBubbles();

    // ── Fish (one geometry + texture per species, one mesh per fish)
    _fish = [];
    SPECIES.forEach(spec => {
      const tex = _makeTex(spec.tex);
      const geo = _createFishGeo(spec.fishLength);
      _disposables.push(geo);
      _buildFishForSpecies(spec, tex, geo);
    });
    // Initialise fish visibility mask
    _fishMask = _fish.map(() => true);
  }

  // ════════════════════════════════════════════════════════════════════
  //  CORAL
  // ════════════════════════════════════════════════════════════════════
  function _buildCoral() {
    const cols = [0xdd3333, 0xee7700, 0xddaa00, 0xcc33aa, 0xff5544, 0x33bb77];
    const fY   = -TH + 0.05;
    for (let i = 0; i < 24; i++) {
      const x = (Math.random() - 0.5) * TW * 1.85;
      const z = (Math.random() - 0.5) * TD * 1.85;
      const h = 0.4 + Math.random() * 2.0;
      const r = 0.07 + Math.random() * 0.20;
      const col = cols[i % cols.length];
      const cg = new THREE.CylinderGeometry(r*0.35, r, h, 5);
      const cm = new THREE.MeshStandardMaterial({ color: col, roughness: 0.85 });
      const c  = new THREE.Mesh(cg, cm);
      c.position.set(x, fY + h / 2, z);
      c.rotation.z = (Math.random() - 0.5) * 0.45;
      _scene.add(c); _disposables.push(c, cg, cm);
      // 1-2 branches
      for (let b = 0; b < Math.floor(Math.random() * 3); b++) {
        const bh = h * (0.35 + Math.random() * 0.5);
        const bg = new THREE.CylinderGeometry(r*0.20, r*0.38, bh, 4);
        const bm = new THREE.MeshStandardMaterial({ color: col, roughness: 0.85 });
        const br = new THREE.Mesh(bg, bm);
        br.position.set(x + (Math.random()-0.5)*0.6, fY + h*0.6 + bh/2, z + (Math.random()-0.5)*0.6);
        br.rotation.z = (Math.random()-0.5)*0.9;
        br.rotation.x = (Math.random()-0.5)*0.5;
        _scene.add(br); _disposables.push(br, bg, bm);
      }
    }
    // Rocks
    for (let i = 0; i < 16; i++) {
      const rg = new THREE.SphereGeometry(0.25 + Math.random()*0.55, 5, 4);
      rg.scale(1, 0.5 + Math.random()*0.3, 1 + (Math.random()-0.5)*0.4);
      const rm = new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(0.07, 0.12, 0.28 + Math.random()*0.22),
        roughness: 0.95,
      });
      const rock = new THREE.Mesh(rg, rm);
      rock.position.set(
        (Math.random()-0.5)*TW*1.9,
        -TH + 0.1 + Math.random()*0.2,
        (Math.random()-0.5)*TD*1.9,
      );
      rock.rotation.y = Math.random()*Math.PI;
      _scene.add(rock); _disposables.push(rock, rg, rm);
    }
  }

  // ════════════════════════════════════════════════════════════════════
  //  SEAWEED  (WebGL Samples SeaweedA/B — here as animated line curves)
  // ════════════════════════════════════════════════════════════════════
  function _buildSeaweed() {
    const swM = new THREE.LineBasicMaterial({ color: 0x20aa50, linewidth: 2 });
    _disposables.push(swM);
    for (let i = 0; i < 30; i++) {
      const bx   = (Math.random()-0.5)*TW*1.7;
      const bz   = (Math.random()-0.5)*TD*1.7;
      const h    = 1.2 + Math.random()*3.0;
      const segs = 7;
      const pts  = [];
      for (let s = 0; s <= segs; s++) {
        pts.push(new THREE.Vector3(
          bx + Math.sin(s*0.9)*0.18,
          -TH + (s/segs)*h,
          bz + Math.cos(s*1.1)*0.18,
        ));
      }
      const crv = new THREE.CatmullRomCurve3(pts);
      const geo = new THREE.BufferGeometry().setFromPoints(crv.getPoints(22));
      const ln  = new THREE.Line(geo, swM);
      _scene.add(ln);
      _seaweeds.push({ ln, geo, bx, bz, h, segs, ph: Math.random()*Math.PI*2 });
      _disposables.push(ln, geo);
    }
  }

  function _updateSeaweed(t) {
    _seaweeds.forEach(sw => {
      const pts = [];
      for (let s = 0; s <= sw.segs; s++) {
        const f = s / sw.segs;
        pts.push(new THREE.Vector3(
          sw.bx + Math.sin(t*1.4 + sw.ph + f*2.6)*0.28*f,
          -TH + f*sw.h,
          sw.bz + Math.cos(t*0.9 + sw.ph*1.3 + f*1.9)*0.18*f,
        ));
      }
      const newPts = new THREE.CatmullRomCurve3(pts).getPoints(22);
      const posAttr = sw.geo.attributes.position;
      newPts.forEach((p, i) => posAttr.setXYZ(i, p.x, p.y, p.z));
      posAttr.needsUpdate = true;
    });
  }

  // ════════════════════════════════════════════════════════════════════
  //  BUBBLES
  // ════════════════════════════════════════════════════════════════════
  function _buildBubbles() {
    const N   = 700;
    _bubbleGeo = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      pos[i*3]   = (Math.random()-0.5)*TW*1.85;
      pos[i*3+1] = -TH + Math.random()*TH*2;
      pos[i*3+2] = (Math.random()-0.5)*TD*1.85;
    }
    _bubbleGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const bm  = new THREE.PointsMaterial({
      color: 0xaaddff, size: 0.07, transparent: true, opacity: 0.45, sizeAttenuation: true,
    });
    const pts = new THREE.Points(_bubbleGeo, bm);
    _scene.add(pts);
    _disposables.push(pts, _bubbleGeo, bm);
  }

  function _updateBubbles() {
    const pos = _bubbleGeo.attributes.position;
    const top = TH * 0.9;
    for (let i = 0; i < pos.count; i++) {
      let y = pos.getY(i) + 0.020 + Math.random() * 0.008;
      if (y > top) {
        y = -TH + Math.random() * 0.4;
        pos.setX(i, (Math.random()-0.5)*TW*1.85);
        pos.setZ(i, (Math.random()-0.5)*TD*1.85);
      }
      pos.setY(i, y);
    }
    pos.needsUpdate = true;
  }

  // ════════════════════════════════════════════════════════════════════
  //  WATER SURFACE  (vertex-displaced plane like WebGL Samples inner globe)
  // ════════════════════════════════════════════════════════════════════
  function _updateWater(t) {
    const pos = _waterSurface.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      pos.setY(i, Math.sin(x*0.42 + t*0.85)*0.30 + Math.cos(z*0.36 + t*0.65)*0.20);
    }
    pos.needsUpdate = true;
    _waterSurface.geometry.computeVertexNormals();
  }

  // ════════════════════════════════════════════════════════════════════
  //  RENDER LOOP
  // ════════════════════════════════════════════════════════════════════
  let _lastNow = 0, _causticFrame = 0;

  function _loop(now) {
    _raf = requestAnimationFrame(_loop);
    if (!_cam || !_R || !_scene) return;

    const dt = Math.min((now - _lastNow) / 1000, 0.08);
    _lastNow = now;
    _clock  += dt;

    // Resize
    const pw = window.innerWidth, ph = window.innerHeight;
    if (pw !== _W || ph !== _H) {
      _W = pw; _H = ph;
      _R.setSize(_W, _H);
      _cam.aspect = _W / _H;
      _cam.updateProjectionMatrix();
    }

    // Every 2 frames — caustics are slow-moving, no need for 60fps update
    if (++_causticFrame % 2 === 0) _updateCaustics(_clock);

    _updateWater(_clock);
    _updateSeaweed(_clock);
    _updateBubbles();
    _updateFish(_clock);

    // Slow camera sway (speed controlled by _tuningCamSpd slider)
    const cs = _clock * 0.10 * _tuningCamSpd;
    _cam.position.x = Math.sin(cs) * 2.2;
    _cam.position.y = 1.5 + Math.sin(cs * 0.7) * 0.9;
    _cam.lookAt(0, 0, 0);

    _R.render(_scene, _cam);
  }

  // ════════════════════════════════════════════════════════════════════
  //  PUBLIC API
  // ════════════════════════════════════════════════════════════════════
  // ════════════════════════════════════════════════════════════════════
  //  LIVE CONTROLS  — comprehensive tuning panel (like WebGL Samples demo)
  // ════════════════════════════════════════════════════════════════════
  let _controlPanel = null;
  // Extended tuning state
  let _tuningFog    = true;   // toggle fog
  let _tuningLight  = 1.0;    // ambient light multiplier
  let _tuningCamSpd = 1.0;    // camera orbit speed multiplier
  let _specCountMult = 1.0;   // fraction of each species to render (0–1)
  // Per-fish rendering mask (true = render this fish)
  let _fishMask = [];

  // Called when count or countMult changes to show/hide fish
  function _applyFishMask() {
    _fish.forEach((f, i) => {
      f.mesh.visible = i < _fishMask.length ? _fishMask[i] : true;
    });
  }

  function _rebuildFishMask() {
    let idx = 0;
    SPECIES.forEach(spec => {
      const show = Math.round(spec.count * _specCountMult);
      for (let i = 0; i < spec.count; i++) {
        _fishMask[idx++] = i < show;
      }
    });
    _applyFishMask();
  }

  function _buildControls() {
    if (_controlPanel) return;
    const panel = document.createElement('div');
    panel.id = 'aq-controls';
    panel.style.cssText = [
      'position:fixed;bottom:14px;right:14px;z-index:20',
      'background:rgba(0,8,18,0.85);color:#aaddff',
      'padding:12px 16px;border-radius:10px;font:11px/1.8 monospace',
      'pointer-events:auto;user-select:none;min-width:210px;max-height:90vh;overflow-y:auto',
      'border:1px solid rgba(80,160,255,0.30)',
      'box-shadow:0 4px 20px rgba(0,80,180,0.25)',
    ].join(';');

    const sliders = [
      // Animation
      { id:'aq-spd',  label:'Fish Speed',   key:'speed', min:0.05,max:5.0, step:0.05, def:1.0, grp:'Animation' },
      { id:'aq-bend', label:'Tail Bend',     key:'bend',  min:0.1, max:5.0, step:0.05, def:1.0, grp:null },
      { id:'aq-wave', label:'Wave Freq',     key:'wave',  min:0.1, max:5.0, step:0.05, def:1.0, grp:null },
      { id:'aq-tail', label:'Tail Speed',    key:'tail',  min:0.1, max:5.0, step:0.05, def:1.0, grp:null },
      // Population
      { id:'aq-cnt',  label:'Fish Count %',  key:'count', min:0.0, max:1.0, step:0.05, def:1.0, grp:'Population' },
      // Environment
      { id:'aq-lgt',  label:'Light Intensity',key:'light',min:0.2, max:3.0, step:0.05, def:1.0, grp:'Environment' },
      { id:'aq-cam',  label:'Camera Speed',  key:'cam',   min:0.0, max:4.0, step:0.05, def:1.0, grp:null },
    ];

    let html = '<div style="margin-bottom:8px;font-size:13px;font-weight:bold;color:#44aaff;letter-spacing:1px">🐟 AQUARIUM SETTINGS</div>';

    let lastGrp = null;
    sliders.forEach(s => {
      if (s.grp && s.grp !== lastGrp) {
        html += `<div style="margin:6px 0 2px;color:#558899;font-size:10px;text-transform:uppercase;letter-spacing:1px">${s.grp}</div>`;
        lastGrp = s.grp;
      }
      html += `<label style="display:flex;align-items:center;gap:6px;margin:2px 0">
        <span style="width:88px;color:#88bbcc">${s.label}</span>
        <input id="${s.id}" type="range" min="${s.min}" max="${s.max}" step="${s.step}" value="${s.def}"
          style="flex:1;accent-color:#22aaff;cursor:pointer">
        <span id="${s.id}-v" style="width:34px;text-align:right;color:#fff">${s.def.toFixed(2)}</span>
      </label>`;
    });

    // Toggles
    html += '<div style="margin:6px 0 2px;color:#558899;font-size:10px;text-transform:uppercase;letter-spacing:1px">Toggles</div>';
    html += `<label style="display:flex;align-items:center;gap:8px;margin:2px 0;cursor:pointer">
      <input id="aq-fog" type="checkbox" checked style="accent-color:#22aaff">
      <span style="color:#88bbcc">Underwater Fog</span>
    </label>`;

    html += '<div style="margin-top:8px;color:#335566;font-size:10px">Drag sliders to tune in real-time</div>';

    panel.innerHTML = html;
    document.body.appendChild(panel);
    _controlPanel = panel;

    // Wire up sliders
    sliders.forEach(s => {
      const el = document.getElementById(s.id);
      const vl = document.getElementById(s.id + '-v');
      el.addEventListener('input', () => {
        const v = parseFloat(el.value);
        vl.textContent = v.toFixed(2);
        switch (s.key) {
          case 'speed': _tuning.speed = v; break;
          case 'bend':  _tuning.bend  = v; break;
          case 'wave':  _tuning.wave  = v; break;
          case 'tail':  _tuning.tail  = v; break;
          case 'count': _specCountMult = v; _rebuildFishMask(); break;
          case 'light': _tuningLight = v;
            if (_scene) {
              _scene.traverseVisible(o => {
                if (o.isLight) { o.intensity = (o.userData.baseIntensity||o.intensity) * v; }
              });
            }
            break;
          case 'cam':   _tuningCamSpd = v; break;
        }
      });
      // Store base intensity for lights
      if (s.key === 'light' && _scene) {
        _scene.traverseVisible(o => { if (o.isLight) o.userData.baseIntensity = o.intensity; });
      }
    });

    // Fog toggle
    document.getElementById('aq-fog').addEventListener('change', e => {
      _tuningFog = e.target.checked;
      if (_scene) _scene.fog = _tuningFog ? new THREE.Fog(0x002a40, 20, 46) : null;
    });
  }

  function _removeControls() {
    if (_controlPanel) { _controlPanel.remove(); _controlPanel = null; }
  }

  function start(canvas2dRef) {
    if (_running) return;
    _running = true;
    _canvas2d = canvas2dRef;
    if (_canvas2d) _canvas2d.style.display = 'none';
    _tuning = { speed: 1.0, bend: 1.0, wave: 1.0, tail: 1.0 };
    _tuningLight = 1.0; _tuningCamSpd = 1.0; _specCountMult = 1.0;
    _buildControls();

    function _launch() {
      if (!_running) return;

      _el = document.getElementById('aquarium3d-canvas');
      if (!_el) {
        _el = document.createElement('canvas');
        _el.id = 'aquarium3d-canvas';
        Object.assign(_el.style, {
          position:'fixed', inset:'0', width:'100%', height:'100%',
          zIndex:'3', display:'block',
        });
        document.body.appendChild(_el);
      }

      _W = window.innerWidth;
      _H = window.innerHeight;

      _R = new THREE.WebGLRenderer({ canvas: _el, antialias: true });
      _R.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      _R.setSize(_W, _H);

      _scene = new THREE.Scene();
      _cam   = new THREE.PerspectiveCamera(60, _W / _H, 0.1, 80);
      _cam.position.set(0, 1.5, 18);
      _cam.lookAt(0, 0, 0);

      _fish = []; _seaweeds = []; _disposables = [];
      _buildScene();

      _lastNow = performance.now();
      _clock = 0; _causticFrame = 0;
      _raf   = requestAnimationFrame(_loop);
    }

    if (typeof THREE === 'undefined') {
      const s = document.createElement('script');
      s.src = CDN; s.onload = _launch;
      document.head.appendChild(s);
    } else {
      _launch();
    }
  }

  function stop() {
    _running = false;
    cancelAnimationFrame(_raf); _raf = null;

    _disposables.forEach(o => { if (o && o.dispose) o.dispose(); });
    _disposables = []; _fish = []; _seaweeds = [];
    _bubbleGeo = null; _waterSurface = null;
    _causticCanvas = null; _causticCtx = null; _causticTex = null;

    if (_R) { _R.dispose(); _R = null; }
    _scene = null; _cam = null;

    if (_el) { _el.remove(); _el = null; }
    if (_canvas2d) { _canvas2d.style.display = ''; _canvas2d = null; }
    _removeControls();
  }

  return { start, stop };
})();

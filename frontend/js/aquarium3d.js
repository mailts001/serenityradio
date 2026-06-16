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
  const SPECIES = [
    {
      name: 'SmallFishA',   // fast schooling orange fish
      count: 22,  speed: 1.0, speedRange: 1.5,
      radius: 8,  radiusRange: 6,
      xCk: 1.0, yCk: 0.45, zCk: 0.95,   // smooth near-circular orbit
      tailSpeed: 10, heightOffset: -1, heightRange: 4.5,
      fishLength: 1.8, fishWaveLength: 1.0, fishBendAmount: 2.0,
      fishScale: 1.0,
      tex: (ctx) => {
        ctx.fillStyle = '#e06010'; ctx.fillRect(0,0,128,128);
        [24, 66, 106].forEach(cy => {         // horizontal bands → vertical stripes on fish
          ctx.fillStyle = '#fff';  ctx.fillRect(0, cy-9, 128, 18);
          ctx.fillStyle = '#000';  ctx.fillRect(0, cy-11,128, 2);
          ctx.fillStyle = '#000';  ctx.fillRect(0, cy+9, 128, 2);
        });
        const g = ctx.createRadialGradient(64,64,12,64,64,72);
        g.addColorStop(0,'rgba(0,0,0,0)'); g.addColorStop(1,'rgba(0,0,0,0.4)');
        ctx.fillStyle=g; ctx.fillRect(0,0,128,128);
      },
    },
    {
      name: 'SmallFishB',   // fast blue chromis
      count: 20,  speed: 1.5, speedRange: 2.0,
      radius: 6,  radiusRange: 5,
      xCk: 0.75, yCk: 0.55, zCk: 1.05,
      tailSpeed: 12, heightOffset: 2.5, heightRange: 3.5,
      fishLength: 1.4, fishWaveLength: 1.0, fishBendAmount: 1.8,
      fishScale: 0.8,
      tex: (ctx) => {
        const bg = ctx.createLinearGradient(0,0,0,128);
        bg.addColorStop(0,'#0055ee'); bg.addColorStop(1,'#00aaff');
        ctx.fillStyle=bg; ctx.fillRect(0,0,128,128);
        const sh = ctx.createRadialGradient(50,40,4,50,40,55);
        sh.addColorStop(0,'rgba(255,255,255,0.4)'); sh.addColorStop(1,'rgba(0,0,0,0)');
        ctx.fillStyle=sh; ctx.fillRect(0,0,128,128);
      },
    },
    {
      name: 'MediumFishA',  // gold fish, medium
      count: 10,  speed: 0.8, speedRange: 0.8,
      radius: 10, radiusRange: 5,
      xCk: 0.9, yCk: 0.35, zCk: 0.85,
      tailSpeed: 7, heightOffset: 0, heightRange: 3.5,
      fishLength: 2.8, fishWaveLength: 0.8, fishBendAmount: 1.5,
      fishScale: 1.4,
      tex: (ctx) => {
        const bg = ctx.createLinearGradient(0,0,0,128);
        bg.addColorStop(0,'#e8c020'); bg.addColorStop(0.5,'#ffd840'); bg.addColorStop(1,'#c89010');
        ctx.fillStyle=bg; ctx.fillRect(0,0,128,128);
        ctx.fillStyle='rgba(255,200,0,0.4)';
        ctx.fillRect(0,52,128,24);
        const g = ctx.createRadialGradient(64,64,15,64,64,68);
        g.addColorStop(0,'rgba(0,0,0,0)'); g.addColorStop(1,'rgba(0,0,0,0.3)');
        ctx.fillStyle=g; ctx.fillRect(0,0,128,128);
      },
    },
    {
      name: 'MediumFishB',  // green tropical
      count: 10,  speed: 0.9, speedRange: 1.0,
      radius: 8,  radiusRange: 4,
      xCk: 1.05, yCk: 0.6, zCk: 0.80,
      tailSpeed: 8, heightOffset: -2, heightRange: 4,
      fishLength: 2.6, fishWaveLength: 0.9, fishBendAmount: 1.8,
      fishScale: 1.2,
      tex: (ctx) => {
        const bg = ctx.createLinearGradient(0,0,0,128);
        bg.addColorStop(0,'#10aa40'); bg.addColorStop(0.6,'#30cc60'); bg.addColorStop(1,'#008828');
        ctx.fillStyle=bg; ctx.fillRect(0,0,128,128);
        ctx.fillStyle='rgba(0,0,0,0.25)'; ctx.fillRect(0,56,128,16);
        const g = ctx.createRadialGradient(45,45,8,45,45,55);
        g.addColorStop(0,'rgba(255,255,255,0.3)'); g.addColorStop(1,'rgba(0,0,0,0)');
        ctx.fillStyle=g; ctx.fillRect(0,0,128,128);
      },
    },
    {
      name: 'BigFishA',     // large shark-like grey
      count: 3,   speed: 0.4, speedRange: 0.3,
      radius: 11, radiusRange: 3,
      xCk: 0.85, yCk: 0.25, zCk: 1.0,
      tailSpeed: 4, heightOffset: 1, heightRange: 2.5,
      fishLength: 5.5, fishWaveLength: 0.6, fishBendAmount: 1.2,
      fishScale: 2.8,
      tex: (ctx) => {
        const bg = ctx.createLinearGradient(0,0,0,128);
        bg.addColorStop(0,'#4a5a64'); bg.addColorStop(0.55,'#7a8a94'); bg.addColorStop(1,'#c8d8e0');
        ctx.fillStyle=bg; ctx.fillRect(0,0,128,128);
        for (let y=0;y<128;y+=20){
          ctx.fillStyle='rgba(0,0,0,0.04)'; ctx.fillRect(0,y,128,10);
        }
      },
    },
    {
      name: 'BigFishB',     // large slow tropical
      count: 2,   speed: 0.35, speedRange: 0.2,
      radius: 12, radiusRange: 2,
      xCk: 0.95, yCk: 0.20, zCk: 0.90,
      tailSpeed: 3.5, heightOffset: 0, heightRange: 2,
      fishLength: 6.5, fishWaveLength: 0.5, fishBendAmount: 1.0,
      fishScale: 3.2,
      tex: (ctx) => {
        const bg = ctx.createLinearGradient(0,0,0,128);
        bg.addColorStop(0,'#7a4010'); bg.addColorStop(0.5,'#b05820'); bg.addColorStop(1,'#7a4010');
        ctx.fillStyle=bg; ctx.fillRect(0,0,128,128);
        [32, 96].forEach(cy => {
          ctx.fillStyle='rgba(255,160,0,0.5)'; ctx.fillRect(0,cy-8,128,16);
        });
        const g = ctx.createRadialGradient(64,64,20,64,64,70);
        g.addColorStop(0,'rgba(255,255,255,0.2)'); g.addColorStop(1,'rgba(0,0,0,0)');
        ctx.fillStyle=g; ctx.fillRect(0,0,128,128);
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
  //  FISH GEOMETRY  (body Z from –FL/2=tail to +FL/2=head)
  // ════════════════════════════════════════════════════════════════════
  function _fishBodyGeo(FL) {
    // LatheGeometry profile: Vector2(radius, y_along_spine)
    // y goes from –FL/2 (tail) to +FL/2 (head)
    const pts = [
      new THREE.Vector2(0.005,      -FL * 0.50),
      new THREE.Vector2(FL * 0.055, -FL * 0.42),
      new THREE.Vector2(FL * 0.085, -FL * 0.28),
      new THREE.Vector2(FL * 0.115, -FL * 0.08),
      new THREE.Vector2(FL * 0.120,  FL * 0.10),
      new THREE.Vector2(FL * 0.105,  FL * 0.28),
      new THREE.Vector2(FL * 0.075,  FL * 0.40),
      new THREE.Vector2(FL * 0.040,  FL * 0.48),
      new THREE.Vector2(0.005,       FL * 0.50),
    ];
    const geo = new THREE.LatheGeometry(pts, 10);
    geo.rotateX(Math.PI / 2);  // spine → Z axis
    geo.scale(0.38, 1.0, 1.0); // flatten left-right
    return geo;
  }

  // Tail-fork geometry (two flat lobes at the tail, Z = –FL*0.44)
  function _tailForkGeo(FL) {
    const r = FL * 0.14;
    const v = new Float32Array([
      // upper lobe
       0.01, 0.02, -FL*0.44,
       0.01,-0.02, -FL*0.44,
      -r,    r*1.5,-FL*0.50,
      // lower lobe
       0.01, 0.02, -FL*0.44,
       0.01,-0.02, -FL*0.44,
      -r,   -r*1.5,-FL*0.50,
    ]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(v, 3));
    geo.setAttribute('normal',
      new THREE.BufferAttribute(new Float32Array([
        0,0,1, 0,0,1, 0,0,1,
        0,0,-1,0,0,-1,0,0,-1,
      ]), 3));
    geo.setAttribute('uv',
      new THREE.BufferAttribute(new Float32Array([
        1,0.5, 1,0.5, 0,1,
        1,0.5, 1,0.5, 0,0,
      ]), 2));
    return geo;
  }

  // Merge body + tail into one BufferGeometry
  function _createFishGeo(FL) {
    const body = _fishBodyGeo(FL);
    const tail = _tailForkGeo(FL);
    // Manual merge (Three.js r149 doesn't have BufferGeometryUtils built-in)
    const bPos = body.attributes.position.array;
    const bNrm = body.attributes.normal.array;
    const bUv  = body.attributes.uv.array;
    const bIdx = body.index.array;
    const tPos = tail.attributes.position.array;
    const tNrm = tail.attributes.normal.array;
    const tUv  = tail.attributes.uv.array;

    const off = bPos.length / 3;
    const pos = new Float32Array(bPos.length + tPos.length);
    const nrm = new Float32Array(bNrm.length + tNrm.length);
    const uvs = new Float32Array(bUv.length  + tUv.length);
    pos.set(bPos); pos.set(tPos, bPos.length);
    nrm.set(bNrm); nrm.set(tNrm, bNrm.length);
    uvs.set(bUv);  uvs.set(tUv,  bUv.length);

    // Tail indices (non-indexed, just sequential after body)
    const tIdxArr = new Uint32Array(tPos.length / 3);
    for (let i = 0; i < tIdxArr.length; i++) tIdxArr[i] = off + i;

    const idx = new Uint32Array(bIdx.length + tIdxArr.length);
    idx.set(bIdx); idx.set(tIdxArr, bIdx.length);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal',   new THREE.BufferAttribute(nrm, 3));
    geo.setAttribute('uv',       new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    return geo;
  }

  // ════════════════════════════════════════════════════════════════════
  //  CANVAS TEXTURE
  // ════════════════════════════════════════════════════════════════════
  function _makeTex(drawFn) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
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
      // Tail animation clock
      f.mat.uniforms.uTime.value =
        (clock * f.spec.tailSpeed * f.speed * spd + f.clockOffset) % (Math.PI * 2);
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
    SPECIES.forEach(spec => {
      const tex = _makeTex(spec.tex);
      const geo = _createFishGeo(spec.fishLength);
      _disposables.push(geo);
      _buildFishForSpecies(spec, tex, geo);
    });
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

    // Slow camera sway (like WebGL Samples eyeClock)
    _cam.position.x = Math.sin(_clock * 0.10) * 2.2;
    _cam.position.y = 1.5 + Math.sin(_clock * 0.07) * 0.9;
    _cam.lookAt(0, 0, 0);

    _R.render(_scene, _cam);
  }

  // ════════════════════════════════════════════════════════════════════
  //  PUBLIC API
  // ════════════════════════════════════════════════════════════════════
  // ════════════════════════════════════════════════════════════════════
  //  LIVE CONTROLS  (corner HUD for tuning animation parameters)
  // ════════════════════════════════════════════════════════════════════
  let _controlPanel = null;

  function _buildControls() {
    if (_controlPanel) return;
    const panel = document.createElement('div');
    panel.id = 'aq-controls';
    panel.style.cssText = [
      'position:fixed;bottom:18px;right:18px;z-index:20',
      'background:rgba(0,10,20,0.78);color:#aaddff',
      'padding:10px 14px;border-radius:8px;font:12px/1.7 monospace',
      'pointer-events:auto;user-select:none;min-width:190px',
      'border:1px solid rgba(80,160,255,0.25)',
    ].join(';');

    const sliders = [
      { id:'aq-spd',  label:'Speed',     key:'speed', min:0.1, max:4.0, step:0.05, def:1.0 },
      { id:'aq-bend', label:'Tail Bend', key:'bend',  min:0.1, max:4.0, step:0.05, def:1.0 },
      { id:'aq-wave', label:'Wave Freq', key:'wave',  min:0.1, max:4.0, step:0.05, def:1.0 },
    ];

    panel.innerHTML = '<div style="margin-bottom:6px;font-weight:bold;color:#88ccff">🐟 Aquarium Controls</div>'
      + sliders.map(s => `
        <label style="display:flex;align-items:center;gap:6px;margin:3px 0">
          <span style="width:68px">${s.label}</span>
          <input id="${s.id}" type="range" min="${s.min}" max="${s.max}"
            step="${s.step}" value="${s.def}"
            style="flex:1;accent-color:#44aaff">
          <span id="${s.id}-v" style="width:32px;text-align:right">${s.def.toFixed(2)}</span>
        </label>`).join('');

    document.body.appendChild(panel);
    _controlPanel = panel;

    sliders.forEach(s => {
      const el = document.getElementById(s.id);
      const vl = document.getElementById(s.id + '-v');
      el.addEventListener('input', () => {
        const v = parseFloat(el.value);
        _tuning[s.key] = v;
        vl.textContent  = v.toFixed(2);
      });
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
    _tuning = { speed: 1.0, bend: 1.0, wave: 1.0 };
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

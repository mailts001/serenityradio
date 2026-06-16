'use strict';
/* ═══════════════════════════════════════════════════════════════════════
   AQUARIUM3D  —  Procedural Three.js underwater scene
   Serenity Radio  ·  2026

   Architecture
   ───────────
   • Procedural geometry fish  (5 species, ~72 total)
   • Boids: separation + alignment + cohesion + wall-avoid + depth-pref
   • Seaweed: CatmullRomCurve3 lines, per-frame vertex update
   • Bubbles: GPU Points (1 200 particles, per-frame rise)
   • Caustic lighting: 3 animated SpotLights
   • Coral & rocks: procedural geometry clusters
   • Water-surface plane: per-frame sine-wave vertex deformation
   • All geometry & materials disposed cleanly on stop()
   ═══════════════════════════════════════════════════════════════════════ */
const Aquarium3D = (() => {

  const CDN = 'https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js';

  // ── half-extents of the virtual tank
  const W = 13, H = 6.5, D = 10;

  // ── tunables
  const N_BUBBLES  = 1200;
  const N_SEAWEED  = 18;
  const N_ROCKS    = 16;
  const ORBIT_RANGE = 6;   // camera sway (x) in units

  // ── state
  let _canvas2d = null;         // the 2-D bg-canvas we hide while running
  let _el       = null;         // our WebGL canvas
  let _R        = null;         // THREE.WebGLRenderer
  let _scene    = null;
  let _cam      = null;
  let _raf      = null;
  let _running  = false;
  let _W = 0, _H = 0;          // last known pixel size

  // scene objects
  let _fish          = [];
  let _seaweeds      = [];
  let _bubbleGeo     = null;
  let _bubblePts     = null;
  let _causticLights = [];
  let _waterSurface  = null;
  let _camSwayT      = 0;
  let _lastNow       = 0;

  // ────────────────────────────────────────────────────────────────────
  //  PUBLIC API
  // ────────────────────────────────────────────────────────────────────
  function start(canvas2d) {
    if (_running) return;
    _canvas2d = canvas2d;

    // Hide the 2-D background canvas
    if (_canvas2d) _canvas2d.style.display = 'none';

    // Create our own fullscreen WebGL canvas
    _el = document.createElement('canvas');
    _el.id = 'aquarium3d-canvas';
    _el.style.cssText =
      'position:fixed;inset:0;z-index:3;width:100%;height:100%;display:block;';
    document.body.appendChild(_el);

    _running = true;

    if (typeof THREE !== 'undefined') {
      _launch();
    } else {
      const s = document.createElement('script');
      s.src   = CDN;
      s.onload = _launch;
      document.head.appendChild(s);
    }
  }

  function stop() {
    if (!_running) return;
    _running = false;
    cancelAnimationFrame(_raf);
    _raf = null;

    // Dispose GPU resources
    if (_scene) {
      _scene.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach(m => m.dispose());
        }
      });
      _scene = null;
    }
    if (_R) { _R.dispose(); _R = null; }

    // Remove canvas
    const c = document.getElementById('aquarium3d-canvas');
    if (c) c.remove();
    _el = null;

    // Restore 2-D canvas
    if (_canvas2d) _canvas2d.style.display = '';
    _canvas2d = null;

    // Reset arrays
    _fish          = [];
    _seaweeds      = [];
    _causticLights = [];
    _bubbleGeo     = null;
    _bubblePts     = null;
    _waterSurface  = null;
  }

  // ────────────────────────────────────────────────────────────────────
  //  SCENE INIT
  // ────────────────────────────────────────────────────────────────────
  function _launch() {
    if (!_running) return;

    // Renderer
    _R = new THREE.WebGLRenderer({
      canvas:           _el,
      antialias:        false,
      alpha:            false,
      powerPreference: 'high-performance',
    });
    _R.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    if (THREE.sRGBEncoding   !== undefined) _R.outputEncoding  = THREE.sRGBEncoding;
    if (THREE.SRGBColorSpace !== undefined) _R.outputColorSpace = THREE.SRGBColorSpace;
    _R.shadowMap.enabled = false;

    // Scene & fog
    _scene = new THREE.Scene();
    _scene.fog = new THREE.Fog(0x092535, 10, 60);
    _scene.background = new THREE.Color(0x092535);

    // Camera — positioned just outside the front glass
    _cam = new THREE.PerspectiveCamera(62, 1, 0.1, 80);
    _cam.position.set(0, 0.5, D + 7);
    _cam.lookAt(0, -0.5, 0);

    _buildScene();
    _checkResize();
    _lastNow = performance.now();
    _loop(_lastNow);
  }

  // ── Resize handling ──────────────────────────────────────────────────
  function _checkResize() {
    const cw = (_el.clientWidth)  | 0;
    const ch = (_el.clientHeight) | 0;
    if (cw !== _W || ch !== _H) {
      _W = cw; _H = ch;
      _R.setSize(cw, ch, false);
      _cam.aspect = cw / ch;
      _cam.updateProjectionMatrix();
    }
  }

  // ────────────────────────────────────────────────────────────────────
  //  SCENE BUILDING
  // ────────────────────────────────────────────────────────────────────
  function _buildScene() {
    _buildLights();
    _buildEnvironment();
    _buildSeaweed();
    _buildBubbles();
    _buildWaterSurface();
    _buildFish();
  }

  // ── Lights ──────────────────────────────────────────────────────────
  function _buildLights() {
    // Dim blue-green ambient (deep water feel)
    _scene.add(new THREE.AmbientLight(0x1a4060, 0.65));

    // Top directional "sun shaft"
    const sun = new THREE.DirectionalLight(0x70c0ff, 1.0);
    sun.position.set(2, H + 1, 3);
    _scene.add(sun);

    // 3 animated caustic spotlights
    const cols = [0x50b8f8, 0x38a8e8, 0x70d0ff];
    cols.forEach((col, i) => {
      const sl = new THREE.SpotLight(col, 3.0, H * 2.8, Math.PI / 7, 0.75, 1.6);
      sl.position.set((i - 1) * W * 0.45, H - 0.4, (i - 1) * D * 0.22);
      sl.target = new THREE.Object3D();
      sl.target.position.set(0, -H + 1, 0);
      _scene.add(sl);
      _scene.add(sl.target);
      _causticLights.push(sl);
    });
  }

  // ── Tank environment (floor, walls, rocks, coral) ───────────────────
  function _buildEnvironment() {
    const rng = _srng(9001);

    // Sand floor — slightly bumpy
    const sandMat = new THREE.MeshLambertMaterial({ color: 0xd4b480 });
    const sandGeo = new THREE.PlaneGeometry(W * 2, D * 2, 22, 22);
    const sp = sandGeo.attributes.position;
    for (let i = 0; i < sp.count; i++) {
      sp.setZ(i, sp.getZ(i) + (rng() - 0.5) * 0.1);
    }
    sp.needsUpdate = true;
    sandGeo.computeVertexNormals();
    const sand = new THREE.Mesh(sandGeo, sandMat);
    sand.rotation.x = -Math.PI / 2;
    sand.position.y = -H;
    _scene.add(sand);

    // Back wall (subtle dark plane — helps define depth)
    const backMat = new THREE.MeshLambertMaterial({ color: 0x0a2030 });
    const back = new THREE.Mesh(new THREE.PlaneGeometry(W * 2, H * 2), backMat);
    back.position.z = -D;
    _scene.add(back);

    // Side walls (very faint, mostly for light bounce)
    const sideMat = new THREE.MeshLambertMaterial({ color: 0x0c2535, transparent: true, opacity: 0.5 });
    [-W, W].forEach(x => {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(D * 2, H * 2), sideMat);
      s.position.x = x;
      s.rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2;
      _scene.add(s);
    });

    // Front glass (very subtle — lets the user feel the glass pane)
    const frontGlassMat = new THREE.MeshPhysicalMaterial({
      color:       0x90c8e0,
      transparent: true,
      opacity:     0.05,
      roughness:   0.04,
      metalness:   0.0,
      side:        THREE.FrontSide,
    });
    const fglass = new THREE.Mesh(new THREE.PlaneGeometry(W * 2, H * 2), frontGlassMat);
    fglass.position.z = D - 0.05;
    fglass.rotation.y = Math.PI;
    _scene.add(fglass);

    // Rocks
    const rockMat = new THREE.MeshLambertMaterial({ color: 0x506060 });
    for (let ri = 0; ri < N_ROCKS; ri++) {
      const rx = (rng() - 0.5) * W * 1.7;
      const rz = -D + 1 + rng() * (D * 1.7);
      const rs = 0.35 + rng() * 0.9;
      const geo = new THREE.SphereGeometry(rs, 6, 5);
      // Deform into irregular rock
      const p = geo.attributes.position;
      for (let vi = 0; vi < p.count; vi++) {
        p.setX(vi, p.getX(vi) * (0.65 + rng() * 0.7));
        p.setZ(vi, p.getZ(vi) * (0.65 + rng() * 0.7));
        p.setY(vi, p.getY(vi) * (0.38 + rng() * 0.5));
      }
      p.needsUpdate = true;
      geo.computeVertexNormals();
      const rock = new THREE.Mesh(geo, rockMat);
      rock.position.set(rx, -H + rs * 0.35, rz);
      _scene.add(rock);
    }

    // Coral clusters (5 groups)
    const coralCols = [0xff6090, 0xff8840, 0xcc44ee, 0x40e8c0, 0xffcc44];
    coralCols.forEach((col, ci) => {
      const mat = new THREE.MeshLambertMaterial({ color: col });
      const cx  = (rng() - 0.5) * W * 1.5;
      const cz  = -D + 1 + rng() * D * 1.5;
      const branches = 5 + Math.floor(rng() * 6);
      for (let b = 0; b < branches; b++) {
        const ang = (b / branches) * Math.PI * 1.6 - Math.PI * 0.8;
        const bh  = 0.6 + rng() * 1.4;
        const br  = 0.055 + rng() * 0.07;
        const geo = new THREE.CylinderGeometry(br * 0.25, br, bh, 5);
        const m   = new THREE.Mesh(geo, mat);
        m.position.set(
          cx + Math.sin(ang) * 0.28,
          -H + bh / 2,
          cz + Math.cos(ang) * 0.28,
        );
        m.rotation.z = Math.sin(ang) * 0.38;
        m.rotation.x = Math.cos(ang) * 0.18;
        _scene.add(m);
        // Tip sphere
        const tip = new THREE.Mesh(
          new THREE.SphereGeometry(br * 1.5, 5, 4),
          new THREE.MeshLambertMaterial({ color: 0xffffff }),
        );
        tip.position.set(
          m.position.x + Math.sin(ang) * 0.05,
          -H + bh + 0.08,
          m.position.z,
        );
        _scene.add(tip);
      }
    });
  }

  // ── Seaweed (CatmullRomCurve3 lines, vertex-updated each frame) ─────
  function _buildSeaweed() {
    const mat = new THREE.LineBasicMaterial({ color: 0x2a9040, linewidth: 2 });
    const rng = _srng(44444);
    for (let i = 0; i < N_SEAWEED; i++) {
      const sx   = (rng() - 0.5) * W * 1.75;
      const sz   = -D + 0.5 + rng() * D * 1.7;
      const sh   = 1.4 + rng() * 3.2;
      const segs = 9;

      const pts  = new Float32Array((segs + 1) * 3);
      const geo  = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pts, 3));

      const sw = {
        x: sx, z: sz, h: sh, segs,
        phase: rng() * Math.PI * 2,
        speed: 0.38 + rng() * 0.55,
        amp:   0.18 + rng() * 0.28,
        mesh:  new THREE.Line(geo, mat),
        pts,
      };
      _scene.add(sw.mesh);
      _seaweeds.push(sw);
    }
  }

  // ── Bubbles (Points) ────────────────────────────────────────────────
  function _buildBubbles() {
    _bubblePts = new Float32Array(N_BUBBLES * 3);
    const rng = _srng(77777);
    for (let i = 0; i < N_BUBBLES; i++) {
      _bubblePts[i * 3]     = (rng() - 0.5) * W * 1.85;
      _bubblePts[i * 3 + 1] = -H + rng() * H * 2;
      _bubblePts[i * 3 + 2] = -D + rng() * D * 1.95;
    }
    _bubbleGeo = new THREE.BufferGeometry();
    _bubbleGeo.setAttribute('position', new THREE.BufferAttribute(_bubblePts, 3));
    _scene.add(new THREE.Points(
      _bubbleGeo,
      new THREE.PointsMaterial({
        color:          0xb8e0ff,
        size:           0.055,
        transparent:    true,
        opacity:        0.50,
        sizeAttenuation: true,
      }),
    ));
  }

  // ── Water surface (animated sine plane at top of tank) ───────────────
  function _buildWaterSurface() {
    const mat = new THREE.MeshPhysicalMaterial({
      color:       0x38a0d0,
      transparent: true,
      opacity:     0.22,
      roughness:   0.12,
      metalness:   0.0,
      side:        THREE.DoubleSide,
    });
    const geo = new THREE.PlaneGeometry(W * 2, D * 2, 28, 28);
    _waterSurface = new THREE.Mesh(geo, mat);
    _waterSurface.rotation.x = -Math.PI / 2;
    _waterSurface.position.y = H - 0.08;
    _scene.add(_waterSurface);
  }

  // ────────────────────────────────────────────────────────────────────
  //  FISH
  // ────────────────────────────────────────────────────────────────────

  /* Species config ──────────────────────────────────────────────────── */
  const SPECIES = [
    { name:'clownfish', color:0xff6622, stripe:0xffffff, count:16, sz:0.36, spd:1.55, school:true,  dy:[-H*0.15,  H*0.55] },
    { name:'tang',      color:0x1a8cff, stripe:0xffdd00, count:20, sz:0.44, spd:1.40, school:true,  dy:[-H*0.4,   H*0.45] },
    { name:'angelfish', color:0xffd020, stripe:0x202030, count:10, sz:0.54, spd:0.85, school:false, dy:[-H*0.4,   H*0.35] },
    { name:'shark',     color:0x7a90a0, stripe:0xb8ccda, count:3,  sz:1.50, spd:0.65, school:false, dy:[-H*0.05,  H*0.60] },
    { name:'puffer',    color:0xf0d050, stripe:0xa07820, count:12, sz:0.38, spd:1.05, school:true,  dy:[-H*0.45,  H*0.30] },
    { name:'nemo',      color:0xff3800, stripe:0xffffff, count:11, sz:0.30, spd:1.70, school:true,  dy:[-H*0.5,   H*0.15] },
  ];

  /* Geometry helpers ────────────────────────────────────────────────── */
  function _tailGeo(s) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      -s*0.10,  s*0.55, 0,
      -s*0.10, -s*0.55, 0,
      -s*0.72,  s*0.78, 0,
      -s*0.72, -s*0.78, 0,
    ]), 3));
    g.setIndex([0, 1, 2,  1, 3, 2]);
    g.computeVertexNormals();
    return g;
  }

  function _dorsalGeo(s) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
       s*0.22,  0, 0,
      -s*0.28,  0, 0,
       0,       s*0.55, 0,
    ]), 3));
    g.setIndex([0, 1, 2]);
    g.computeVertexNormals();
    return g;
  }

  function _createFishGroup(spec) {
    const g   = new THREE.Group();
    const s   = spec.sz;
    const mat = new THREE.MeshLambertMaterial({ color: spec.color });
    const stm = new THREE.MeshLambertMaterial({ color: spec.stripe });

    if (spec.name === 'shark') {
      // Torpedo body
      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(s * 0.28, s * 0.16, s * 2.4, 9),
        mat,
      );
      body.rotation.z = Math.PI / 2;
      g.add(body);
      // Belly stripe
      const belly = new THREE.Mesh(
        new THREE.CylinderGeometry(s * 0.14, s * 0.10, s * 1.8, 6),
        stm,
      );
      belly.rotation.z = Math.PI / 2;
      belly.position.set(0, -s * 0.12, 0);
      g.add(belly);
      // Dorsal fin
      const dors = new THREE.Mesh(new THREE.ConeGeometry(s * 0.22, s * 0.5, 4), mat);
      dors.position.set(0, s * 0.34, 0);
      dors.rotation.z = Math.PI;
      g.add(dors);
      // Caudal fin
      g.add(Object.assign(new THREE.Mesh(_tailGeo(s * 1.18), mat), { position: { x: -s * 1.22, y: 0, z: 0 } }));
      // Pectoral fins
      [-1, 1].forEach(side => {
        const fin = new THREE.Mesh(new THREE.ConeGeometry(s * 0.16, s * 0.52, 3), stm);
        fin.position.set(0, -s * 0.16, side * s * 0.38);
        fin.rotation.x = side * 0.5;
        g.add(fin);
      });

    } else if (spec.name === 'angelfish') {
      const body = new THREE.Mesh(new THREE.SphereGeometry(s, 9, 7), mat);
      body.scale.set(1.05, 1.55, 0.32);
      g.add(body);
      // 3 vertical stripes
      for (let si = 0; si < 3; si++) {
        const st = new THREE.Mesh(
          new THREE.BoxGeometry(s * 0.13, s * 2.9, s * 0.35),
          stm,
        );
        st.position.x = s * (si * 0.58 - 0.58);
        g.add(st);
      }
      // Top fin
      g.add(Object.assign(new THREE.Mesh(_dorsalGeo(s), mat), { position: { x: 0, y: s * 1.52, z: 0 } }));
      // Tail
      const tail = new THREE.Mesh(_tailGeo(s * 0.95), mat);
      tail.position.x = -s * 1.0;
      g.add(tail);

    } else if (spec.name === 'puffer') {
      const body = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 1), mat);
      g.add(body);
      // Spines
      for (let si = 0; si < 10; si++) {
        const ang = (si / 10) * Math.PI * 2;
        const sp2 = new THREE.Mesh(new THREE.ConeGeometry(s * 0.042, s * 0.28, 3), stm);
        sp2.position.set(Math.cos(ang) * s * 0.92, Math.sin(ang) * s * 0.92, 0);
        sp2.rotation.z = -ang;
        g.add(sp2);
      }
      // Rounded tail
      const tail = new THREE.Mesh(new THREE.SphereGeometry(s * 0.42, 6, 4), mat);
      tail.scale.x = 0.48;
      tail.position.x = -s * 1.1;
      g.add(tail);
      // Mouth
      const mouth = new THREE.Mesh(new THREE.SphereGeometry(s * 0.12, 5, 4), stm);
      mouth.position.set(s * 0.96, -s * 0.08, 0);
      g.add(mouth);

    } else {
      // Generic tropical (clownfish / tang / nemo)
      const body = new THREE.Mesh(new THREE.SphereGeometry(s, 9, 7), mat);
      body.scale.set(1.45, 0.82, 0.52);
      g.add(body);
      // Stripes
      const nStripes = spec.name === 'tang' ? 1 : 2;
      for (let si = 0; si < nStripes; si++) {
        const st = new THREE.Mesh(
          new THREE.BoxGeometry(s * 0.13, s * 1.52, s * 0.56),
          stm,
        );
        st.position.x = s * (si * 0.72 - 0.36);
        g.add(st);
      }
      // Tail fin
      const tail = new THREE.Mesh(_tailGeo(s), mat);
      tail.position.x = -s * 0.82;
      g.add(tail);
      // Dorsal fin
      const dors = new THREE.Mesh(_dorsalGeo(s), stm);
      dors.position.y = s * 0.78;
      g.add(dors);
      // Pectoral fin
      const pec = new THREE.Mesh(new THREE.ConeGeometry(s * 0.15, s * 0.32, 4), mat);
      pec.position.set(s * 0.22, 0, s * 0.44);
      pec.rotation.x = 0.75;
      g.add(pec);
    }

    // Eye (on all species)
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(s * 0.085, 5, 5),
      new THREE.MeshLambertMaterial({ color: 0x0a0a0a }),
    );
    eye.position.set(s * (spec.name === 'shark' ? 1.05 : 0.88), s * 0.14, s * 0.34);
    g.add(eye);
    // Catch-light
    const hl = new THREE.Mesh(
      new THREE.SphereGeometry(s * 0.038, 4, 4),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
    );
    hl.position.set(s * (spec.name === 'shark' ? 1.10 : 0.93), s * 0.18, s * 0.37);
    g.add(hl);

    return g;
  }

  function _buildFish() {
    const rng = _srng(31415);
    SPECIES.forEach(spec => {
      for (let i = 0; i < spec.count; i++) {
        const mesh = _createFishGroup(spec);
        _scene.add(mesh);

        const yMin = spec.dy[0], yMax = spec.dy[1];
        const fish = {
          mesh,
          spec,
          pos: new THREE.Vector3(
            (rng() - 0.5) * W * 1.6,
            yMin + rng() * (yMax - yMin),
            -D + 0.5 + rng() * D * 1.8,
          ),
          vel: new THREE.Vector3(
            (rng() - 0.5) * spec.spd,
            (rng() - 0.5) * spec.spd * 0.25,
            (rng() - 0.5) * spec.spd,
          ),
          phase:     rng() * Math.PI * 2,
          wagPhase:  rng() * Math.PI * 2,
          yMin, yMax,
        };
        // Give initial speed
        const len = fish.vel.length();
        if (len < 0.01) fish.vel.set(spec.spd * 0.5, 0, 0);
        else            fish.vel.multiplyScalar(spec.spd * 0.7 / len);
        _fish.push(fish);
      }
    });
  }

  // ────────────────────────────────────────────────────────────────────
  //  PER-FRAME UPDATES
  // ────────────────────────────────────────────────────────────────────

  /* Seeded RNG (deterministic for stable initial positions) */
  function _srng(seed) {
    let s = Math.abs((seed * 1664525 + 1013904223) | 0) >>> 0;
    return () => {
      s = Math.abs((s * 1664525 + 1013904223) | 0) >>> 0;
      return s / 4294967296;
    };
  }

  function _updateFish(dt) {
    const DT   = dt * 0.016;   // normalise to 60 fps
    const WALL = 1.8;
    const LOOK = new THREE.Vector3();

    _fish.forEach((f, fi) => {
      const spec = f.spec;
      const acc  = new THREE.Vector3();

      // ── Boids ─────────────────────────────────────────────
      if (spec.school) {
        let sX = 0, sY = 0, sZ = 0;   // separation
        let aX = 0, aY = 0, aZ = 0;   // alignment
        let cX = 0, cY = 0, cZ = 0;   // cohesion
        let cnt = 0;
        const R2 = 20; // search radius²

        for (let oi = Math.max(0, fi - 14); oi < Math.min(_fish.length, fi + 14); oi++) {
          if (oi === fi) continue;
          const o = _fish[oi];
          if (o.spec.name !== spec.name) continue;
          const dx = f.pos.x - o.pos.x;
          const dy = f.pos.y - o.pos.y;
          const dz = f.pos.z - o.pos.z;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 > R2 || d2 < 0.0001) continue;
          const d = Math.sqrt(d2);
          sX += dx / d; sY += dy / d; sZ += dz / d;
          aX += o.vel.x; aY += o.vel.y; aZ += o.vel.z;
          cX += o.pos.x; cY += o.pos.y; cZ += o.pos.z;
          cnt++;
        }
        if (cnt > 0) {
          acc.x += sX * 1.3 + (aX / cnt - f.vel.x) * 0.35 + (cX / cnt - f.pos.x) * 0.07;
          acc.y += sY * 1.3 + (aY / cnt - f.vel.y) * 0.35 + (cY / cnt - f.pos.y) * 0.07;
          acc.z += sZ * 1.3 + (aZ / cnt - f.vel.z) * 0.35 + (cZ / cnt - f.pos.z) * 0.07;
        }
      }

      // ── Wall avoidance ────────────────────────────────────
      const WL = W - WALL, DL = D - WALL;
      if (f.pos.x >  WL) acc.x -= (f.pos.x - WL)  * 3.0;
      if (f.pos.x < -WL) acc.x -= (f.pos.x + WL)  * 3.0;
      if (f.pos.z > -0.4) acc.z -= (f.pos.z + 0.4) * 3.0;   // front glass
      if (f.pos.z < -DL * 1.8) acc.z -= (f.pos.z + DL * 1.8) * 3.0;
      if (f.pos.y < f.yMin - 0.3) acc.y += (f.yMin - 0.3 - f.pos.y) * 2.5;
      if (f.pos.y > f.yMax + 0.3) acc.y -= (f.pos.y - f.yMax - 0.3) * 2.5;

      // ── Wander (sinusoidal drift) ─────────────────────────
      f.phase += DT * 0.9;
      acc.x += Math.sin(f.phase * 1.0)  * 0.10;
      acc.z += Math.cos(f.phase * 0.85) * 0.10;
      acc.y += Math.sin(f.phase * 0.65) * 0.03;

      // ── Integrate ─────────────────────────────────────────
      f.vel.addScaledVector(acc, DT * 0.55);

      // Speed clamp
      const spd = f.vel.length();
      const spdMin = spec.spd * 0.22, spdMax = spec.spd * 1.6;
      if (spd > spdMax) f.vel.multiplyScalar(spdMax / spd);
      if (spd < spdMin && spd > 0.001) f.vel.multiplyScalar(spdMin / spd);

      f.pos.addScaledVector(f.vel, DT);

      // ── Mesh pose ─────────────────────────────────────────
      f.mesh.position.copy(f.pos);

      // Face velocity direction
      if (spd > 0.02) {
        LOOK.copy(f.pos).addScaledVector(f.vel, 0.25 / spd);
        f.mesh.lookAt(LOOK);
      }

      // Body undulation (rotate slightly around local Y each frame)
      f.wagPhase += DT * spec.spd * 4.8;
      f.mesh.rotateY(Math.sin(f.wagPhase) * 0.065);
    });
  }

  function _updateSeaweed(t) {
    _seaweeds.forEach(sw => {
      const pos = sw.mesh.geometry.attributes.position;
      for (let s = 0; s <= sw.segs; s++) {
        const frac  = s / sw.segs;
        const waveX = Math.sin(t * sw.speed       + sw.phase + frac * 4.2) * sw.amp * frac;
        const waveZ = Math.cos(t * sw.speed * 0.7 + sw.phase * 1.4 + frac * 3.0) * sw.amp * frac * 0.5;
        pos.setXYZ(s, sw.x + waveX, -H + frac * sw.h, sw.z + waveZ);
      }
      pos.needsUpdate = true;
    });
  }

  function _updateBubbles(dt) {
    const rise = dt * 0.011;
    for (let i = 0; i < N_BUBBLES; i++) {
      _bubblePts[i * 3 + 1] += rise * (0.55 + Math.random() * 0.45);
      _bubblePts[i * 3]     += (Math.random() - 0.5) * 0.018;
      if (_bubblePts[i * 3 + 1] > H - 0.1) {
        _bubblePts[i * 3]     = (Math.random() - 0.5) * W * 1.8;
        _bubblePts[i * 3 + 1] = -H + Math.random() * 0.4;
        _bubblePts[i * 3 + 2] = -D + Math.random() * D * 1.9;
      }
    }
    _bubbleGeo.attributes.position.needsUpdate = true;
  }

  function _updateWaterSurface(t) {
    const pos = _waterSurface.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      pos.setZ(i, Math.sin(x * 0.42 + t * 0.78) * 0.07 + Math.cos(z * 0.36 + t * 0.62) * 0.05);
    }
    pos.needsUpdate = true;
    _waterSurface.geometry.computeVertexNormals();
  }

  function _updateCaustics(t) {
    _causticLights.forEach((sl, i) => {
      const ang  = t * 0.38 + i * (Math.PI * 2 / 3);
      sl.position.x = Math.cos(ang) * W * 0.55;
      sl.position.z = Math.sin(ang) * D * 0.4 - D * 0.3;
      sl.target.position.x = -Math.cos(ang) * W * 0.32;
      sl.target.position.z = -Math.sin(ang) * D * 0.25;
      sl.target.updateMatrixWorld();
      // Gentle flicker
      sl.intensity = 2.6 + Math.sin(t * 3.8 + i * 2.2) * 0.5 + Math.sin(t * 7.5 + i) * 0.22;
    });
  }

  // ────────────────────────────────────────────────────────────────────
  //  RENDER LOOP
  // ────────────────────────────────────────────────────────────────────
  function _loop(now) {
    if (!_running) return;
    _raf = requestAnimationFrame(_loop);

    const dt  = Math.min(now - _lastNow, 50);
    _lastNow  = now;
    const t   = now * 0.001;

    _checkResize();

    _updateFish(dt);
    _updateSeaweed(t);
    _updateBubbles(dt);
    _updateWaterSurface(t);
    _updateCaustics(t);

    // Gentle camera sway (front-facing, no full orbit)
    _camSwayT += dt * 0.00012;
    _cam.position.x = Math.sin(_camSwayT)       * ORBIT_RANGE;
    _cam.position.y = 0.5 + Math.sin(_camSwayT * 0.72) * 2.5;
    _cam.position.z = D + 7 - Math.abs(Math.sin(_camSwayT * 0.44)) * 2.5;
    _cam.lookAt(0, -0.8, 0);

    _R.render(_scene, _cam);
  }

  return { start, stop };
})();

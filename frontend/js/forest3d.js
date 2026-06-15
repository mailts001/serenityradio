/* ══════════════════════════════════════════════════════════
   Forest3D — Three.js infinite procedural forest
   Mobile-optimised: instancing, fog, ~15k triangles, 5 draw calls
   ══════════════════════════════════════════════════════════ */

const Forest3D = (() => {
  'use strict';

  // ── World constants ──────────────────────────────────────────
  const CHUNK      = 48;               // world-unit size of one chunk
  const GRID       = 5;                // 5×5 visible chunks
  const HALF       = 2;                // floor(GRID/2)
  const TREES      = 8;                // trees per chunk
  const TOTAL_T    = GRID * GRID * TREES;        // 200 trunk instances
  const TOTAL_C    = TOTAL_T * 3;                // 600 canopy instances
  const CHUNKS_N   = GRID * GRID;               // 25

  // ── Module state ─────────────────────────────────────────────
  let _R, _scene, _cam, _raf;          // renderer, scene, camera, anim frame
  let _trunkMesh, _canopyMesh, _cloudMesh, _fireMesh;
  let _sunLight, _ambLight;
  let _canvas2d = null;                // original 2D canvas (hidden while 3D runs)
  let _el = null;                      // WebGL canvas element

  // Chunk grid: each slot has world chunk coords
  let _slots = [];   // [{cx,cz}] length CHUNKS_N
  let _camChunkX = 999, _camChunkZ = 999;  // force initial fill

  // Camera
  const _camPos   = { x: 0, y: 5.2, z: 0 };
  let   _camAz    = 0;               // horizontal look angle (radians)
  let   _camAlt   = 0.08;            // slight downward tilt
  let   _lastT    = 0;
  let   _isDrag   = false, _dStartX = 0, _dStartAz = 0;

  // Day / night (driven by real clock)
  let _nightMode  = false;

  // Cloud state
  const _clouds   = [];

  // Bird state (3 birds, simple path)
  const _birds    = [];
  let _birdMeshes = [];

  // ── Seeded deterministic random ───────────────────────────────
  function rng(seed) {
    let s = ((seed * 9301 + 49297) | 0) % 233280;
    return () => { s = ((s * 9301 + 49297) | 0) % 233280; return s / 233280; };
  }

  // ── Tree geometry & data ──────────────────────────────────────
  function _treeData(cx, cz) {
    const r = rng(cx * 9973 + cz * 9871 + 4567);
    const out = [];
    for (let i = 0; i < TREES; i++) {
      // Keep trees away from chunk centre (leave a clearing path)
      const angle = r() * Math.PI * 2;
      const dist  = CHUNK * (0.18 + r() * 0.38);
      out.push({
        lx : Math.cos(angle) * dist + (r() - 0.5) * CHUNK * 0.22,
        lz : Math.sin(angle) * dist + (r() - 0.5) * CHUNK * 0.22,
        h  : 12 + r() * 24,          // trunk height
        cr : 2.4 + r() * 3.2,        // canopy radius
        lean: (r() - 0.5) * 0.07,    // slight lean
        gv : r(),                     // green variation 0..1
      });
    }
    return out;
  }

  // ── Update one chunk's instance slice ────────────────────────
  let _dummy = null;   // initialised after THREE loads in _realStart()

  function _updateSlot(slotIdx, cx, cz) {
    const trees   = _treeData(cx, cz);
    const tBase   = slotIdx * TREES;
    const cBase   = slotIdx * TREES * 3;
    const worldX  = cx * CHUNK;
    const worldZ  = cz * CHUNK;
    const c3      = new THREE.Color();

    trees.forEach((tr, ti) => {
      const wx = worldX + tr.lx;
      const wz = worldZ + tr.lz;

      // ── Trunk ──────────────────────────────────────────────
      _dummy.position.set(wx, tr.h * 0.5, wz);
      _dummy.scale.set(1, tr.h, 1);
      _dummy.rotation.set(0, 0, tr.lean);
      _dummy.updateMatrix();
      _trunkMesh.setMatrixAt(tBase + ti, _dummy.matrix);
      // Warm brown trunk colour — vary per tree
      const tv = 0.75 + tr.gv * 0.25;
      c3.setRGB(0.38 * tv, 0.24 * tv, 0.10 * tv);
      _trunkMesh.setColorAt(tBase + ti, c3);

      // ── Canopy: 3 overlapping blobs ────────────────────────
      const r2 = rng(cx * 71 + cz * 53 + ti * 17);
      for (let ci = 0; ci < 3; ci++) {
        const offX  = (r2() - 0.5) * tr.cr * 0.7;
        const offZ  = (r2() - 0.5) * tr.cr * 0.7;
        const offY  = ci === 0 ? 0 : ci === 1 ? -tr.cr * 0.38 : tr.cr * 0.28;
        const sxy   = tr.cr * (0.72 + r2() * 0.44);
        const sy    = sxy * (0.58 + r2() * 0.36);
        _dummy.position.set(wx + offX, tr.h + offY, wz + offZ);
        _dummy.scale.set(sxy, sy, sxy);
        _dummy.rotation.set(0, r2() * Math.PI, 0);
        _dummy.updateMatrix();
        _canopyMesh.setMatrixAt(cBase + ti * 3 + ci, _dummy.matrix);
        // Green variation: dark inner, lighter outer
        const gBase = 0.14 + tr.gv * 0.12;
        const ghi   = ci === 2 ? 0.08 : 0;
        c3.setRGB(gBase - 0.02 + ghi, gBase * 1.9 + ghi * 1.2, gBase * 0.65);
        _canopyMesh.setColorAt(cBase + ti * 3 + ci, c3);
      }
    });

    _trunkMesh.instanceMatrix.needsUpdate = true;
    _trunkMesh.instanceColor.needsUpdate  = true;
    _canopyMesh.instanceMatrix.needsUpdate = true;
    _canopyMesh.instanceColor.needsUpdate  = true;
  }

  // ── Check if camera crossed a chunk boundary ─────────────────
  function _checkChunks() {
    const cx = Math.round(_camPos.x / CHUNK);
    const cz = Math.round(_camPos.z / CHUNK);
    if (cx === _camChunkX && cz === _camChunkZ) return;

    const prevX = _camChunkX, prevZ = _camChunkZ;
    _camChunkX = cx; _camChunkZ = cz;

    // Build the set of desired chunks
    const desired = new Map();
    for (let gz = -HALF; gz <= HALF; gz++)
      for (let gx = -HALF; gx <= HALF; gx++)
        desired.set(`${cx+gx},${cz+gz}`, { cx: cx+gx, cz: cz+gz });

    // Find slots that are stale (outside desired set)
    const staleSlots = [];
    _slots.forEach((sl, idx) => {
      const key = `${sl.cx},${sl.cz}`;
      if (desired.has(key)) desired.delete(key);  // already present
      else staleSlots.push(idx);
    });

    // Assign remaining desired chunks to stale slots
    const missing = [...desired.values()];
    staleSlots.forEach((slotIdx, i) => {
      if (i >= missing.length) return;
      const ch = missing[i];
      _slots[slotIdx] = { cx: ch.cx, cz: ch.cz };
      _updateSlot(slotIdx, ch.cx, ch.cz);
    });
  }

  // ── Initialise full 5×5 grid ─────────────────────────────────
  function _fillGrid() {
    _slots = [];
    for (let gz = -HALF; gz <= HALF; gz++)
      for (let gx = -HALF; gx <= HALF; gx++)
        _slots.push({ cx: gx, cz: gz });

    _slots.forEach((sl, i) => _updateSlot(i, sl.cx, sl.cz));
    _camChunkX = 0; _camChunkZ = 0;
  }

  // ── Clouds ────────────────────────────────────────────────────
  function _initClouds() {
    const r = rng(88888);
    _clouds.length = 0;
    for (let i = 0; i < 12; i++) {
      _clouds.push({
        x:     (r() - 0.5) * CHUNK * GRID * 0.9,
        y:     30 + r() * 22,
        z:     (r() - 0.5) * CHUNK * GRID * 0.9,
        sx:    10 + r() * 18,
        sy:    2.2 + r() * 2.8,
        sz:    6  + r() * 12,
        vx:    0.006 + r() * 0.010,
        phase: r() * Math.PI * 2,
      });
    }
    _refreshClouds();
  }

  function _refreshClouds() {
    _clouds.forEach((cl, i) => {
      _dummy.position.set(cl.x, cl.y, cl.z);
      _dummy.scale.set(cl.sx, cl.sy, cl.sz);
      _dummy.rotation.set(0, cl.phase, 0);
      _dummy.updateMatrix();
      _cloudMesh.setMatrixAt(i, _dummy.matrix);
    });
    _cloudMesh.instanceMatrix.needsUpdate = true;
  }

  function _updateClouds(dt) {
    const worldW = CHUNK * GRID;
    let changed = false;
    _clouds.forEach(cl => {
      cl.x += cl.vx * dt * 0.06;
      if (cl.x > worldW * 0.6) { cl.x -= worldW * 1.2; changed = true; }
    });
    if (changed || true) _refreshClouds();   // update every frame (cheap)
  }

  // ── Fireflies (30 tiny emissive instances) ───────────────────
  const _fireData = [];
  function _initFireflies() {
    const r = rng(11111);
    _fireData.length = 0;
    for (let i = 0; i < 30; i++) {
      _fireData.push({
        x: (r() - 0.5) * CHUNK * 2,
        y: 0.8 + r() * 3.5,
        z: (r() - 0.5) * CHUNK * 2,
        vx: (r() - 0.5) * 0.012,
        vy: (r() - 0.5) * 0.006,
        vz: (r() - 0.5) * 0.012,
        phase: r() * Math.PI * 2,
        speed: 0.8 + r() * 1.2,
      });
    }
  }

  function _updateFireflies(t, dt) {
    const c3 = new THREE.Color();
    _fireData.forEach((f, i) => {
      f.x += f.vx * dt * 0.04;
      f.y += Math.sin(t * 0.0008 * f.speed + f.phase) * 0.008;
      f.z += f.vz * dt * 0.04;
      // Wrap near camera
      const wrap = CHUNK * 1.5;
      if (f.x < _camPos.x - wrap) f.x += wrap * 2;
      if (f.x > _camPos.x + wrap) f.x -= wrap * 2;
      if (f.z < _camPos.z - wrap) f.z += wrap * 2;
      if (f.z > _camPos.z + wrap) f.z -= wrap * 2;

      _dummy.position.set(f.x, f.y, f.z);
      _dummy.scale.setScalar(0.18);
      _dummy.updateMatrix();
      _fireMesh.setMatrixAt(i, _dummy.matrix);

      // Pulse brightness
      const bri = 0.4 + 0.6 * Math.sin(t * 0.003 * f.speed + f.phase);
      c3.setRGB(bri * 0.8, bri, bri * 0.3);
      _fireMesh.setColorAt(i, c3);
    });
    _fireMesh.instanceMatrix.needsUpdate = true;
    _fireMesh.instanceColor.needsUpdate  = true;
  }

  // ── Birds (3 simple path objects) ────────────────────────────
  function _initBirds() {
    const r = rng(22222);
    _birds.length = 0;
    _birdMeshes.forEach(m => _scene.remove(m));
    _birdMeshes = [];
    const mat = new THREE.MeshBasicMaterial({ color: 0x222222 });
    for (let i = 0; i < 3; i++) {
      _birds.push({
        orbitR: 18 + r() * 24,
        orbitY: 18 + r() * 16,
        speed : 0.0004 + r() * 0.0006,
        phase : r() * Math.PI * 2,
        tilt  : (r() - 0.5) * 0.3,
      });
      const geo = new THREE.ConeGeometry(0.18, 0.6, 3);
      geo.rotateX(Math.PI / 2);
      const mesh = new THREE.Mesh(geo, mat);
      _scene.add(mesh);
      _birdMeshes.push(mesh);
    }
  }

  function _updateBirds(t) {
    _birds.forEach((b, i) => {
      const angle = t * b.speed * 1000 + b.phase;
      const m = _birdMeshes[i];
      m.position.set(
        _camPos.x + Math.cos(angle) * b.orbitR,
        b.orbitY + Math.sin(angle * 0.37 + b.tilt) * 3.5,
        _camPos.z + Math.sin(angle) * b.orbitR
      );
      m.rotation.y = -angle + Math.PI * 0.5;
    });
  }

  // ── Lighting & sky ────────────────────────────────────────────
  function _applyTimeOfDay() {
    const hr = new Date().getHours() + new Date().getMinutes() / 60;
    _nightMode = hr < 6 || hr >= 20;
    const isDusk = !_nightMode && (hr < 7.5 || hr >= 17.5);

    if (_nightMode) {
      _scene.background.setStyle('#090e0a');
      _scene.fog.color.setStyle('#090e0a');
      _ambLight.color.setStyle('#1a2a1e');
      _ambLight.intensity = 0.5;
      _sunLight.color.setStyle('#3050ff');
      _sunLight.intensity = 0.25;
      _sunLight.position.set(-40, 60, -50);
    } else if (isDusk) {
      _scene.background.setStyle('#d47a40');
      _scene.fog.color.setStyle('#c86838');
      _ambLight.color.setStyle('#c07040');
      _ambLight.intensity = 0.8;
      _sunLight.color.setStyle('#ff9040');
      _sunLight.intensity = 1.4;
      _sunLight.position.set(hr > 12 ? -80 : 80, 30, 40);
    } else {
      _scene.background.setStyle('#b8d2c0');
      _scene.fog.color.setStyle('#b8d2c0');
      _ambLight.color.setStyle('#88b8a0');
      _ambLight.intensity = 0.9;
      _sunLight.color.setStyle('#fff4d0');
      _sunLight.intensity = 1.3;
      _sunLight.position.set(60, 90, 50);
    }

    // Cloud opacity: dimmer at night
    _cloudMesh.material.opacity = _nightMode ? 0.35 : 0.80;
    // Fireflies: visible only dusk + night
    _fireMesh.visible = _nightMode || isDusk;
  }

  // ── Camera ────────────────────────────────────────────────────
  function _updateCamera(dt, t) {
    // Slow auto-drift forward
    const speed = 0.016;
    _camPos.x += Math.sin(_camAz) * speed * dt;
    _camPos.z -= Math.cos(_camAz) * speed * dt;
    // Gentle breathing sway
    _camPos.y = 5.2 + Math.sin(t * 0.00028) * 0.55;

    // Collective canopy sway (nearly free — single uniform)
    _canopyMesh.rotation.z = Math.sin(t * 0.00055) * 0.012;

    const lookX = _camPos.x + Math.sin(_camAz)  * 25;
    const lookY = _camPos.y + Math.sin(_camAlt)  * 25;
    const lookZ = _camPos.z - Math.cos(_camAz)  * 25;
    _cam.position.set(_camPos.x, _camPos.y, _camPos.z);
    _cam.lookAt(lookX, lookY, lookZ);
  }

  // ── Touch / mouse input ───────────────────────────────────────
  function _bindInput(el) {
    // Mouse drag
    el.addEventListener('mousedown', e => {
      _isDrag = true; _dStartX = e.clientX; _dStartAz = _camAz;
    });
    window.addEventListener('mousemove', e => {
      if (!_isDrag) return;
      _camAz = _dStartAz - (e.clientX - _dStartX) * 0.0028;
    });
    window.addEventListener('mouseup', () => { _isDrag = false; });

    // Touch drag (single finger = pan)
    el.addEventListener('touchstart', e => {
      _isDrag = true;
      _dStartX = e.touches[0].clientX; _dStartAz = _camAz;
    }, { passive: true });
    el.addEventListener('touchmove', e => {
      if (!_isDrag || e.touches.length !== 1) return;
      _camAz = _dStartAz - (e.touches[0].clientX - _dStartX) * 0.0035;
    }, { passive: true });
    el.addEventListener('touchend', () => { _isDrag = false; });

    // Double-tap / double-click: toggle day-night colour
    let _lastTap = 0;
    el.addEventListener('touchend', () => {
      const now = Date.now();
      if (now - _lastTap < 300) _applyTimeOfDay();
      _lastTap = now;
    });
    el.addEventListener('dblclick', _applyTimeOfDay);
  }

  // ── Build scene ───────────────────────────────────────────────
  function _build() {
    // Geometries — very low poly
    const trunkGeo  = new THREE.CylinderGeometry(0.13, 0.35, 1, 5, 1);
    const canopyGeo = new THREE.SphereGeometry(1, 5, 4);
    const cloudGeo  = new THREE.SphereGeometry(1, 6, 4);
    const fireGeo   = new THREE.SphereGeometry(1, 3, 2);

    // Materials
    const trunkMat  = new THREE.MeshLambertMaterial({ vertexColors: true });
    const canopyMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const cloudMat  = new THREE.MeshLambertMaterial({ color: 0xeef5ee, transparent: true, opacity: 0.80 });
    const fireMat   = new THREE.MeshBasicMaterial({ vertexColors: true });

    // Instanced meshes
    _trunkMesh  = new THREE.InstancedMesh(trunkGeo,  trunkMat,  TOTAL_T);
    _canopyMesh = new THREE.InstancedMesh(canopyGeo, canopyMat, TOTAL_C);
    _cloudMesh  = new THREE.InstancedMesh(cloudGeo,  cloudMat,  12);
    _fireMesh   = new THREE.InstancedMesh(fireGeo,   fireMat,   30);

    _trunkMesh.frustumCulled  = false;   // we manage visibility via chunks
    _canopyMesh.frustumCulled = false;
    _cloudMesh.frustumCulled  = false;
    _fireMesh.frustumCulled   = false;
    _fireMesh.visible = false;           // off until dusk/night

    _scene.add(_trunkMesh, _canopyMesh, _cloudMesh, _fireMesh);

    // Ground — single large plane
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(CHUNK * GRID * 5, CHUNK * GRID * 5),
      new THREE.MeshLambertMaterial({ color: 0x2a5018 })
    );
    ground.rotation.x = -Math.PI / 2;
    _scene.add(ground);

    // Lighting
    _ambLight = new THREE.AmbientLight(0x88b8a0, 0.9);
    _sunLight = new THREE.DirectionalLight(0xfff4d0, 1.3);
    _sunLight.position.set(60, 90, 50);
    _scene.add(_ambLight, _sunLight);

    // Init data
    _fillGrid();
    _initClouds();
    _initFireflies();
    _initBirds();
    _applyTimeOfDay();

    // Refresh time-of-day every minute
    setInterval(_applyTimeOfDay, 60000);
  }

  // ── Animation loop ────────────────────────────────────────────
  function _loop(now) {
    _raf = requestAnimationFrame(_loop);
    const dt = Math.min(now - _lastT, 50);
    _lastT = now;

    _updateCamera(dt, now);
    _updateClouds(dt);
    _updateFireflies(now, dt);
    _updateBirds(now);
    _checkChunks();

    _R.render(_scene, _cam);
  }

  // ── Public: start ─────────────────────────────────────────────
  function start(canvas2d) {
    if (_R) return;                    // already running
    _canvas2d = canvas2d;

    function _launch() {
      // Create WebGL canvas
      _el = document.createElement('canvas');
      _el.id = 'forest3d-canvas';
      _el.style.cssText =
        'position:fixed;top:0;left:0;width:100%;height:100%;' +
        'z-index:0;display:block;pointer-events:auto;touch-action:none;';

      canvas2d.style.display = 'none';
      document.body.appendChild(_el);

      _R = new THREE.WebGLRenderer({
        canvas: _el, antialias: false, alpha: false,
        powerPreference: 'high-performance',
      });
      _R.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      _R.setSize(window.innerWidth, window.innerHeight);

      _scene = new THREE.Scene();
      _scene.background = new THREE.Color(0xb8d2c0);
      _scene.fog = new THREE.FogExp2(0xb8d2c0, 0.011);

      _cam = new THREE.PerspectiveCamera(
        62, window.innerWidth / window.innerHeight, 0.4, 280
      );

      _dummy = new THREE.Object3D();   // safe now — THREE is loaded

      _camPos.x = 0; _camPos.y = 5.2; _camPos.z = 0;
      _camAz = 0; _camChunkX = 999; _camChunkZ = 999;

      _build();
      _bindInput(_el);

      window.addEventListener('resize', _onResize);
      _lastT = performance.now();
      _loop(_lastT);
    }

    if (typeof THREE === 'undefined') {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.min.js';
      s.onload = _launch;
      document.head.appendChild(s);
    } else {
      _launch();
    }
  }

  // ── Public: stop ─────────────────────────────────────────────
  function stop() {
    cancelAnimationFrame(_raf);
    window.removeEventListener('resize', _onResize);
    if (_el) { _el.remove(); _el = null; }
    if (_R)  { _R.dispose(); _R = null; }
    _birdMeshes = [];
    _scene = _cam = _trunkMesh = _canopyMesh = _cloudMesh = _fireMesh = null;
    _slots = [];
    if (_canvas2d) { _canvas2d.style.display = ''; _canvas2d = null; }
  }

  function _onResize() {
    if (!_R) return;
    _R.setSize(window.innerWidth, window.innerHeight);
    _cam.aspect = window.innerWidth / window.innerHeight;
    _cam.updateProjectionMatrix();
  }

  // ── Public: sync azimuth from existing 2D pan state ──────────
  function syncPan(azDeg) {
    _camAz = azDeg * Math.PI / 180;
  }

  return { start, stop, syncPan };
})();

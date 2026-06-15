/* ══════════════════════════════════════════════════════════
   Forest3D — Three.js infinite procedural forest
   Mobile-optimised: instancing, fog, ~15k triangles
   Controls: drag to pan/tilt · pinch to zoom · scroll to walk
   ══════════════════════════════════════════════════════════ */

const Forest3D = (() => {
  'use strict';

  // ── World constants ──────────────────────────────────────────
  const CHUNK   = 48;
  const GRID    = 5;
  const HALF    = 2;
  const TREES   = 8;
  const TOTAL_T = GRID * GRID * TREES;
  const TOTAL_C = TOTAL_T * 3;

  // ── Module state ─────────────────────────────────────────────
  let _R, _scene, _cam, _raf;
  let _trunkMesh, _canopyMesh, _cloudMesh, _fireMesh;
  let _sunLight, _ambLight;
  let _canvas2d = null;
  let _el = null;

  let _slots = [];
  let _camChunkX = 999, _camChunkZ = 999;

  // Camera state
  const _camPos = { x: 0, y: 5.2, z: 0 };
  let _camAz   = 0;       // horizontal look (radians)
  let _camAlt  = 0.08;    // vertical tilt (radians, + = look up)
  let _camFov  = 62;      // field of view
  let _walkSpd = 0;       // manual walk impulse (decays)
  let _lastT   = 0;
  let _nightMode = false;

  // Pointer state (mouse & touch)
  let _ptr = { down: false, x: 0, y: 0, az0: 0, alt0: 0 };
  let _pinch = { active: false, dist0: 0, fov0: 0 };

  const _clouds   = [];
  const _birds    = [];
  let   _birdMeshes = [];
  let   _dummy = null;

  // ── Seeded random ─────────────────────────────────────────────
  function rng(seed) {
    let s = ((seed * 9301 + 49297) | 0) % 233280;
    return () => { s = ((s * 9301 + 49297) | 0) % 233280; return s / 233280; };
  }

  // ── Tree data ─────────────────────────────────────────────────
  function _treeData(cx, cz) {
    const r = rng(cx * 9973 + cz * 9871 + 4567);
    const out = [];
    for (let i = 0; i < TREES; i++) {
      const angle = r() * Math.PI * 2;
      const dist  = CHUNK * (0.18 + r() * 0.38);
      out.push({
        lx  : Math.cos(angle) * dist + (r() - 0.5) * CHUNK * 0.22,
        lz  : Math.sin(angle) * dist + (r() - 0.5) * CHUNK * 0.22,
        h   : 12 + r() * 24,
        cr  : 2.4 + r() * 3.2,
        lean: (r() - 0.5) * 0.07,
        gv  : r(),
      });
    }
    return out;
  }

  // ── Update one chunk ──────────────────────────────────────────
  function _updateSlot(slotIdx, cx, cz) {
    const trees  = _treeData(cx, cz);
    const tBase  = slotIdx * TREES;
    const cBase  = slotIdx * TREES * 3;
    const worldX = cx * CHUNK;
    const worldZ = cz * CHUNK;
    const c3     = new THREE.Color();

    trees.forEach((tr, ti) => {
      const wx = worldX + tr.lx;
      const wz = worldZ + tr.lz;

      // Trunk
      _dummy.position.set(wx, tr.h * 0.5, wz);
      _dummy.scale.set(1, tr.h, 1);
      _dummy.rotation.set(0, 0, tr.lean);
      _dummy.updateMatrix();
      _trunkMesh.setMatrixAt(tBase + ti, _dummy.matrix);
      const tv = 0.85 + tr.gv * 0.2;
      c3.setRGB(0.45 * tv, 0.30 * tv, 0.14 * tv);
      _trunkMesh.setColorAt(tBase + ti, c3);

      // Canopy: 3 blobs
      const r2 = rng(cx * 71 + cz * 53 + ti * 17);
      for (let ci = 0; ci < 3; ci++) {
        const offX = (r2() - 0.5) * tr.cr * 0.7;
        const offZ = (r2() - 0.5) * tr.cr * 0.7;
        const offY = ci === 0 ? 0 : ci === 1 ? -tr.cr * 0.38 : tr.cr * 0.28;
        const sxy  = tr.cr * (0.72 + r2() * 0.44);
        const sy   = sxy * (0.58 + r2() * 0.36);
        _dummy.position.set(wx + offX, tr.h + offY, wz + offZ);
        _dummy.scale.set(sxy, sy, sxy);
        _dummy.rotation.set(0, r2() * Math.PI, 0);
        _dummy.updateMatrix();
        _canopyMesh.setMatrixAt(cBase + ti * 3 + ci, _dummy.matrix);
        // Brighter, more vivid greens
        const gBase = 0.30 + tr.gv * 0.18;
        const ghi   = ci === 2 ? 0.10 : 0;
        c3.setRGB(gBase * 0.42 + ghi * 0.2, gBase + ghi, gBase * 0.38 + ghi * 0.1);
        _canopyMesh.setColorAt(cBase + ti * 3 + ci, c3);
      }
    });

    _trunkMesh.instanceMatrix.needsUpdate  = true;
    _trunkMesh.instanceColor.needsUpdate   = true;
    _canopyMesh.instanceMatrix.needsUpdate = true;
    _canopyMesh.instanceColor.needsUpdate  = true;
  }

  // ── Chunk management ──────────────────────────────────────────
  function _checkChunks() {
    const cx = Math.round(_camPos.x / CHUNK);
    const cz = Math.round(_camPos.z / CHUNK);
    if (cx === _camChunkX && cz === _camChunkZ) return;
    _camChunkX = cx; _camChunkZ = cz;

    const desired = new Map();
    for (let gz = -HALF; gz <= HALF; gz++)
      for (let gx = -HALF; gx <= HALF; gx++)
        desired.set(`${cx+gx},${cz+gz}`, { cx: cx+gx, cz: cz+gz });

    const staleSlots = [];
    _slots.forEach((sl, idx) => {
      if (desired.has(`${sl.cx},${sl.cz}`)) desired.delete(`${sl.cx},${sl.cz}`);
      else staleSlots.push(idx);
    });

    const missing = [...desired.values()];
    staleSlots.forEach((slotIdx, i) => {
      if (i >= missing.length) return;
      _slots[slotIdx] = { cx: missing[i].cx, cz: missing[i].cz };
      _updateSlot(slotIdx, missing[i].cx, missing[i].cz);
    });
  }

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
        x: (r() - 0.5) * CHUNK * GRID * 0.9,
        y: 30 + r() * 22,
        z: (r() - 0.5) * CHUNK * GRID * 0.9,
        sx: 10 + r() * 18, sy: 2.2 + r() * 2.8, sz: 6 + r() * 12,
        vx: 0.006 + r() * 0.010,
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
    _clouds.forEach(cl => {
      cl.x += cl.vx * dt * 0.06;
      if (cl.x > worldW * 0.6) cl.x -= worldW * 1.2;
    });
    _refreshClouds();
  }

  // ── Fireflies ─────────────────────────────────────────────────
  const _fireData = [];
  function _initFireflies() {
    const r = rng(11111);
    _fireData.length = 0;
    for (let i = 0; i < 30; i++) {
      _fireData.push({
        x: (r() - 0.5) * CHUNK * 2, y: 0.8 + r() * 3.5,
        z: (r() - 0.5) * CHUNK * 2,
        vx: (r() - 0.5) * 0.012, vz: (r() - 0.5) * 0.012,
        phase: r() * Math.PI * 2, speed: 0.8 + r() * 1.2,
      });
    }
  }

  function _updateFireflies(t, dt) {
    const c3 = new THREE.Color();
    _fireData.forEach((f, i) => {
      f.x += f.vx * dt * 0.04;
      f.y += Math.sin(t * 0.0008 * f.speed + f.phase) * 0.008;
      f.z += f.vz * dt * 0.04;
      const wrap = CHUNK * 1.5;
      if (f.x < _camPos.x - wrap) f.x += wrap * 2;
      if (f.x > _camPos.x + wrap) f.x -= wrap * 2;
      if (f.z < _camPos.z - wrap) f.z += wrap * 2;
      if (f.z > _camPos.z + wrap) f.z -= wrap * 2;
      _dummy.position.set(f.x, f.y, f.z);
      _dummy.scale.setScalar(0.18);
      _dummy.updateMatrix();
      _fireMesh.setMatrixAt(i, _dummy.matrix);
      const bri = 0.4 + 0.6 * Math.sin(t * 0.003 * f.speed + f.phase);
      c3.setRGB(bri * 0.8, bri, bri * 0.3);
      _fireMesh.setColorAt(i, c3);
    });
    _fireMesh.instanceMatrix.needsUpdate = true;
    _fireMesh.instanceColor.needsUpdate  = true;
  }

  // ── Birds ─────────────────────────────────────────────────────
  function _initBirds() {
    const r = rng(22222);
    _birds.length = 0;
    _birdMeshes.forEach(m => _scene.remove(m));
    _birdMeshes = [];
    const mat = new THREE.MeshBasicMaterial({ color: 0x333322 });
    for (let i = 0; i < 3; i++) {
      _birds.push({
        orbitR: 18 + r() * 24, orbitY: 18 + r() * 16,
        speed: 0.0004 + r() * 0.0006, phase: r() * Math.PI * 2,
        tilt: (r() - 0.5) * 0.3,
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
      _scene.background.setStyle('#0d1a10');
      _scene.fog.color.setStyle('#0d1a10');
      _ambLight.color.setStyle('#203830');
      _ambLight.intensity = 0.7;
      _sunLight.color.setStyle('#4060ff');
      _sunLight.intensity = 0.4;
      _sunLight.position.set(-40, 60, -50);
    } else if (isDusk) {
      _scene.background.setStyle('#e8905a');
      _scene.fog.color.setStyle('#d07844');
      _ambLight.color.setStyle('#d08858');
      _ambLight.intensity = 1.2;
      _sunLight.color.setStyle('#ffb060');
      _sunLight.intensity = 1.8;
      _sunLight.position.set(hr > 12 ? -80 : 80, 30, 40);
    } else {
      // Bright daytime — vivid blue sky
      _scene.background.setStyle('#74b8e8');
      _scene.fog.color.setStyle('#a8d0ea');
      _ambLight.color.setStyle('#c8e8d8');
      _ambLight.intensity = 1.6;
      _sunLight.color.setStyle('#fff8e8');
      _sunLight.intensity = 2.0;
      _sunLight.position.set(60, 90, 50);
    }

    _cloudMesh.material.opacity = _nightMode ? 0.45 : 0.92;
    _fireMesh.visible = _nightMode || isDusk;
  }

  // ── Camera update ─────────────────────────────────────────────
  function _updateCamera(dt, t) {
    // Auto-drift forward (slow)
    const autoSpd = 0.008;
    _camPos.x += Math.sin(_camAz) * autoSpd * dt;
    _camPos.z -= Math.cos(_camAz) * autoSpd * dt;

    // Manual walk impulse (from scroll/pinch)
    if (Math.abs(_walkSpd) > 0.001) {
      _camPos.x += Math.sin(_camAz) * _walkSpd * dt;
      _camPos.z -= Math.cos(_camAz) * _walkSpd * dt;
      _walkSpd *= Math.pow(0.88, dt / 16);  // decay
    }

    // Gentle breathing height
    _camPos.y = 5.2 + Math.sin(t * 0.00028) * 0.45;

    // Canopy gentle sway
    _canopyMesh.rotation.z = Math.sin(t * 0.00055) * 0.012;

    // Clamp tilt
    _camAlt = Math.max(-0.55, Math.min(0.55, _camAlt));

    const lookX = _camPos.x + Math.sin(_camAz) * Math.cos(_camAlt) * 25;
    const lookY = _camPos.y + Math.sin(_camAlt) * 25;
    const lookZ = _camPos.z - Math.cos(_camAz) * Math.cos(_camAlt) * 25;
    _cam.position.set(_camPos.x, _camPos.y, _camPos.z);
    _cam.lookAt(lookX, lookY, lookZ);
  }

  // ── Input binding ─────────────────────────────────────────────
  function _dist2(t1, t2) {
    const dx = t1.clientX - t2.clientX, dy = t1.clientY - t2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function _bindInput(el) {
    // ── Mouse ──────────────────────────────────────────────────
    el.addEventListener('mousedown', e => {
      _ptr.down = true;
      _ptr.x = e.clientX; _ptr.y = e.clientY;
      _ptr.az0 = _camAz; _ptr.alt0 = _camAlt;
    });
    window.addEventListener('mousemove', e => {
      if (!_ptr.down) return;
      const dx = e.clientX - _ptr.x;
      const dy = e.clientY - _ptr.y;
      _camAz  = _ptr.az0  - dx * 0.0030;
      _camAlt = _ptr.alt0 + dy * 0.0025;
    });
    window.addEventListener('mouseup', () => { _ptr.down = false; });

    // Scroll wheel → walk forward/back
    el.addEventListener('wheel', e => {
      e.preventDefault();
      _walkSpd -= e.deltaY * 0.0008;
      _walkSpd = Math.max(-0.35, Math.min(0.35, _walkSpd));
    }, { passive: false });

    // Double-click → cycle time of day (for fun)
    el.addEventListener('dblclick', _applyTimeOfDay);

    // ── Touch ──────────────────────────────────────────────────
    el.addEventListener('touchstart', e => {
      e.preventDefault();
      if (e.touches.length === 1) {
        _ptr.down = true;
        _ptr.x = e.touches[0].clientX; _ptr.y = e.touches[0].clientY;
        _ptr.az0 = _camAz; _ptr.alt0 = _camAlt;
        _pinch.active = false;
      } else if (e.touches.length === 2) {
        _ptr.down = false;
        _pinch.active = true;
        _pinch.dist0 = _dist2(e.touches[0], e.touches[1]);
        _pinch.fov0  = _camFov;
        // mid-point Y for two-finger swipe
        _ptr.y = (e.touches[0].clientY + e.touches[1].clientY) * 0.5;
        _ptr.alt0 = _camAlt;
      }
    }, { passive: false });

    el.addEventListener('touchmove', e => {
      e.preventDefault();
      if (e.touches.length === 1 && _ptr.down) {
        const dx = e.touches[0].clientX - _ptr.x;
        const dy = e.touches[0].clientY - _ptr.y;
        _camAz  = _ptr.az0  - dx * 0.0035;
        _camAlt = _ptr.alt0 + dy * 0.0028;
      } else if (e.touches.length === 2 && _pinch.active) {
        // Pinch to zoom (FOV)
        const d = _dist2(e.touches[0], e.touches[1]);
        const scale = _pinch.dist0 / Math.max(d, 10);
        _camFov = Math.max(28, Math.min(90, _pinch.fov0 * scale));
        _cam.fov = _camFov;
        _cam.updateProjectionMatrix();

        // Two-finger swipe up/down → walk
        const midY = (e.touches[0].clientY + e.touches[1].clientY) * 0.5;
        const dy   = _ptr.y - midY;
        _walkSpd = dy * 0.0018;
      }
    }, { passive: false });

    el.addEventListener('touchend', e => {
      if (e.touches.length < 2) _pinch.active = false;
      if (e.touches.length === 0) _ptr.down = false;
    }, { passive: true });

    // Double-tap → cycle time of day
    let _lastTap = 0;
    el.addEventListener('touchend', () => {
      const now = Date.now();
      if (now - _lastTap < 300) _applyTimeOfDay();
      _lastTap = now;
    }, { passive: true });

    // ── Keyboard (desktop) ─────────────────────────────────────
    const _keys = {};
    window.addEventListener('keydown', e => { _keys[e.code] = true; });
    window.addEventListener('keyup',   e => { _keys[e.code] = false; });
    // Expose keys for camera update
    _bindInput._keys = _keys;
  }

  // ── Handle keyboard walk in camera update ─────────────────────
  function _applyKeys(dt) {
    const keys = _bindInput._keys;
    if (!keys) return;
    const spd = 0.024;
    if (keys['KeyW'] || keys['ArrowUp'])    { _camPos.x += Math.sin(_camAz) * spd * dt; _camPos.z -= Math.cos(_camAz) * spd * dt; }
    if (keys['KeyS'] || keys['ArrowDown'])  { _camPos.x -= Math.sin(_camAz) * spd * dt; _camPos.z += Math.cos(_camAz) * spd * dt; }
    if (keys['KeyA'] || keys['ArrowLeft'])  { _camPos.x -= Math.cos(_camAz) * spd * dt * 0.7; _camPos.z -= Math.sin(_camAz) * spd * dt * 0.7; }
    if (keys['KeyD'] || keys['ArrowRight']) { _camPos.x += Math.cos(_camAz) * spd * dt * 0.7; _camPos.z += Math.sin(_camAz) * spd * dt * 0.7; }
  }

  // ── Build scene ───────────────────────────────────────────────
  function _build() {
    const trunkGeo  = new THREE.CylinderGeometry(0.13, 0.35, 1, 5, 1);
    const canopyGeo = new THREE.SphereGeometry(1, 5, 4);
    const cloudGeo  = new THREE.SphereGeometry(1, 6, 4);
    const fireGeo   = new THREE.SphereGeometry(1, 3, 2);

    const trunkMat  = new THREE.MeshLambertMaterial({ vertexColors: true });
    const canopyMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const cloudMat  = new THREE.MeshLambertMaterial({ color: 0xf0f8f0, transparent: true, opacity: 0.92 });
    const fireMat   = new THREE.MeshBasicMaterial({ vertexColors: true });

    _trunkMesh  = new THREE.InstancedMesh(trunkGeo,  trunkMat,  TOTAL_T);
    _canopyMesh = new THREE.InstancedMesh(canopyGeo, canopyMat, TOTAL_C);
    _cloudMesh  = new THREE.InstancedMesh(cloudGeo,  cloudMat,  12);
    _fireMesh   = new THREE.InstancedMesh(fireGeo,   fireMat,   30);

    _trunkMesh.frustumCulled  = false;
    _canopyMesh.frustumCulled = false;
    _cloudMesh.frustumCulled  = false;
    _fireMesh.frustumCulled   = false;
    _fireMesh.visible = false;

    _scene.add(_trunkMesh, _canopyMesh, _cloudMesh, _fireMesh);

    // Ground — bright lush green
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(CHUNK * GRID * 5, CHUNK * GRID * 5),
      new THREE.MeshLambertMaterial({ color: 0x3a8020 })
    );
    ground.rotation.x = -Math.PI / 2;
    _scene.add(ground);

    _ambLight = new THREE.AmbientLight(0xc8e8d8, 1.6);
    _sunLight = new THREE.DirectionalLight(0xfff8e8, 2.0);
    _sunLight.position.set(60, 90, 50);
    _scene.add(_ambLight, _sunLight);

    _fillGrid();
    _initClouds();
    _initFireflies();
    _initBirds();
    _applyTimeOfDay();
    setInterval(_applyTimeOfDay, 60000);
  }

  // ── Animation loop ────────────────────────────────────────────
  function _loop(now) {
    _raf = requestAnimationFrame(_loop);
    const dt = Math.min(now - _lastT, 50);
    _lastT = now;

    _applyKeys(dt);
    _updateCamera(dt, now);
    _updateClouds(dt);
    _updateFireflies(now, dt);
    _updateBirds(now);
    _checkChunks();

    _R.render(_scene, _cam);
  }

  // ── Public: start ─────────────────────────────────────────────
  function start(canvas2d) {
    if (_R) return;
    _canvas2d = canvas2d;

    function _launch() {
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
      _scene.background = new THREE.Color(0x74b8e8);
      _scene.fog = new THREE.FogExp2(0xa8d0ea, 0.008);  // lighter, less dense

      _cam = new THREE.PerspectiveCamera(
        _camFov, window.innerWidth / window.innerHeight, 0.4, 320
      );

      _dummy = new THREE.Object3D();  // safe: THREE is loaded

      _camPos.x = 0; _camPos.y = 5.2; _camPos.z = 0;
      _camAz = 0; _camAlt = 0.08; _camChunkX = 999; _camChunkZ = 999;

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

  function syncPan(azDeg) {
    _camAz = azDeg * Math.PI / 180;
  }

  return { start, stop, syncPan };
})();

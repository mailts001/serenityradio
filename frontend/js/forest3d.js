/* ══════════════════════════════════════════════════════════
   Forest3D — Three.js infinite procedural forest
   Controls: drag pan/tilt · scroll/pinch zoom · WASD walk
   ══════════════════════════════════════════════════════════ */

const Forest3D = (() => {
  'use strict';

  // ── World constants ──────────────────────────────────────────
  const CHUNK   = 48;
  const GRID    = 5;
  const HALF    = 2;
  const TREES   = 10;              // more plants per chunk
  const TOTAL_T = GRID * GRID * TREES;
  const TOTAL_C = TOTAL_T * 3;
  const TOTAL_MUSH = 60;           // glowing mushrooms
  const TOTAL_FLOW = 80;           // luminous flowers

  // Plant archetypes: [hMin, hRange, trunkWidthMult, crXZmult, crYmult, r, g, b]
  const PTYPES = [
    [14, 26, 1.0, 0.65, 1.8,  0.10, 0.35, 0.10],  // 0: tall conifer
    [7,  12, 2.4, 1.7,  0.65, 0.22, 0.46, 0.14],  // 1: broad oak
    [2,   4, 0.5, 2.4,  0.45, 0.28, 0.52, 0.18],  // 2: ground shrub
    [9,  14, 0.8, 1.0,  1.3,  0.18, 0.48, 0.12],  // 3: palm-like
    [12, 14, 0.4, 0.65, 1.0,  0.36, 0.56, 0.24],  // 4: slim birch
  ];

  // ── Module state ─────────────────────────────────────────────
  let _R, _scene, _cam, _raf;
  let _trunkMesh, _canopyMesh, _cloudMesh, _fireMesh, _mushMesh, _flowMesh;
  let _sunLight, _ambLight, _hemiLight;
  let _canvas2d = null;
  let _el = null;
  let _dummy = null;

  let _slots = [];
  let _camChunkX = 999, _camChunkZ = 999;

  const _camPos = { x: 0, y: 5.2, z: 0 };
  let _camAz   = 0;
  let _camAlt  = 0.08;
  let _camFov  = 62;
  let _walkSpd = 0;
  let _lastT   = 0;
  let _nightMode = false;
  let _isDusk    = false;

  let _ptr   = { down: false, x: 0, y: 0, az0: 0, alt0: 0 };
  let _pinch = { active: false, dist0: 0, fov0: 0, midY: 0 };

  const _clouds   = [];
  const _birds    = [];
  const _fireData = [];
  const _mushData = [];
  const _flowData = [];
  let   _birdMeshes = [];
  let   _bindKeys   = {};

  // ── Seeded random ─────────────────────────────────────────────
  function rng(seed) {
    // Use Math.abs to guard against negative values from JS signed-int overflow
    let s = Math.abs(((seed * 9301 + 49297) | 0) % 233280);
    return () => {
      s = Math.abs(((s * 9301 + 49297) | 0) % 233280);
      return s / 233280;
    };
  }

  // ── Tree data ─────────────────────────────────────────────────
  function _treeData(cx, cz) {
    const r   = rng(cx * 9973 + cz * 9871 + 4567);
    const out = [];
    for (let i = 0; i < TREES; i++) {
      const angle = r() * Math.PI * 2;
      const dist  = CHUNK * (0.12 + r() * 0.42);
      const ptype = Math.min(PTYPES.length - 1, Math.max(0, Math.floor(r() * PTYPES.length)));
      const pt    = PTYPES[ptype];
      out.push({
        lx   : Math.cos(angle) * dist + (r() - 0.5) * CHUNK * 0.18,
        lz   : Math.sin(angle) * dist + (r() - 0.5) * CHUNK * 0.18,
        h    : pt[0] + r() * pt[1],
        cr   : 2.0 + r() * 3.5,
        lean : (r() - 0.5) * 0.06,
        gv   : r(),
        ptype: ptype,
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
      const pt = PTYPES[tr.ptype];

      // Trunk — vary width by archetype
      const trW = pt[2];
      _dummy.position.set(wx, tr.h * 0.5, wz);
      _dummy.scale.set(trW, tr.h, trW);
      _dummy.rotation.set(0, 0, tr.lean);
      _dummy.updateMatrix();
      _trunkMesh.setMatrixAt(tBase + ti, _dummy.matrix);
      // Trunk colour: warm brown, birch gets white-grey
      const isB = tr.ptype === 4;
      const tv  = 0.80 + tr.gv * 0.2;
      c3.setRGB(
        isB ? 0.85 * tv : 0.45 * tv,
        isB ? 0.85 * tv : 0.30 * tv,
        isB ? 0.82 * tv : 0.13 * tv
      );
      _trunkMesh.setColorAt(tBase + ti, c3);

      // Canopy blobs
      const r2   = rng(cx * 71 + cz * 53 + ti * 17);
      const crXZ = pt[3], crY = pt[4];
      for (let ci = 0; ci < 3; ci++) {
        const offX = (r2() - 0.5) * tr.cr * 0.6;
        const offZ = (r2() - 0.5) * tr.cr * 0.6;
        const offY = ci === 0 ? 0 : ci === 1 ? -tr.cr * 0.30 : tr.cr * 0.35;
        const sxy  = tr.cr * crXZ * (0.72 + r2() * 0.44);
        const sy   = sxy * crY * (0.55 + r2() * 0.30);
        _dummy.position.set(wx + offX, tr.h + offY, wz + offZ);
        _dummy.scale.set(sxy, sy, sxy);
        _dummy.rotation.set(0, r2() * Math.PI, 0);
        _dummy.updateMatrix();
        _canopyMesh.setMatrixAt(cBase + ti * 3 + ci, _dummy.matrix);
        // Vivid greens per archetype, bright highlight on top blob
        const gb  = pt[5], gg = pt[6], gblu = pt[7];
        const hi  = ci === 2 ? 0.12 : 0;
        const gv2 = 0.85 + tr.gv * 0.3;
        c3.setRGB((gb + hi * 0.15) * gv2, (gg + hi) * gv2, (gblu + hi * 0.05) * gv2);
        _canopyMesh.setColorAt(cBase + ti * 3 + ci, c3);
      }
    });

    _trunkMesh.instanceMatrix.needsUpdate  = true;
    _trunkMesh.instanceColor.needsUpdate   = true;
    _canopyMesh.instanceMatrix.needsUpdate = true;
    _canopyMesh.instanceColor.needsUpdate  = true;
  }

  // ── Chunks ────────────────────────────────────────────────────
  function _checkChunks() {
    const cx = Math.round(_camPos.x / CHUNK);
    const cz = Math.round(_camPos.z / CHUNK);
    if (cx === _camChunkX && cz === _camChunkZ) return;
    _camChunkX = cx; _camChunkZ = cz;

    const desired = new Map();
    for (let gz = -HALF; gz <= HALF; gz++)
      for (let gx = -HALF; gx <= HALF; gx++)
        desired.set(`${cx+gx},${cz+gz}`, { cx: cx+gx, cz: cz+gz });

    const stale = [];
    _slots.forEach((sl, i) => {
      if (desired.has(`${sl.cx},${sl.cz}`)) desired.delete(`${sl.cx},${sl.cz}`);
      else stale.push(i);
    });
    const missing = [...desired.values()];
    stale.forEach((idx, i) => {
      if (i >= missing.length) return;
      _slots[idx] = missing[i];
      _updateSlot(idx, missing[i].cx, missing[i].cz);
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
        x: (r()-0.5)*CHUNK*GRID*0.9, y: 30+r()*22, z: (r()-0.5)*CHUNK*GRID*0.9,
        sx: 10+r()*18, sy: 2.2+r()*2.8, sz: 6+r()*12,
        vx: 0.006+r()*0.010, phase: r()*Math.PI*2,
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

  // ── Glowing mushrooms (MeshBasicMaterial — always bright) ─────
  function _initMushrooms() {
    const r = rng(33333);
    _mushData.length = 0;
    for (let i = 0; i < TOTAL_MUSH; i++) {
      _mushData.push({
        x: (r()-0.5)*CHUNK*GRID*0.8, y: 0, z: (r()-0.5)*CHUNK*GRID*0.8,
        s: 0.18 + r() * 0.32,
        hue: r(),          // 0=orange 0.5=cyan 0.75=violet
        phase: r()*Math.PI*2,
      });
    }
    _refreshMushrooms(0);
  }
  function _refreshMushrooms(t) {
    const c3 = new THREE.Color();
    _mushData.forEach((m, i) => {
      _dummy.position.set(m.x, m.y + m.s * 0.5, m.z);
      _dummy.scale.setScalar(m.s);
      _dummy.updateMatrix();
      _mushMesh.setMatrixAt(i, _dummy.matrix);
      // Pulse glow
      const pulse = 0.65 + 0.35 * Math.sin(t * 0.0012 + m.phase);
      if (m.hue < 0.33)      c3.setRGB(pulse, pulse * 0.55, pulse * 0.1);   // orange
      else if (m.hue < 0.66) c3.setRGB(pulse * 0.2, pulse, pulse * 0.7);    // teal
      else                   c3.setRGB(pulse * 0.7, pulse * 0.2, pulse);     // violet
      _mushMesh.setColorAt(i, c3);
    });
    _mushMesh.instanceMatrix.needsUpdate = true;
    _mushMesh.instanceColor.needsUpdate  = true;
  }

  // ── Luminous flowers (tiny always-bright dots) ────────────────
  function _initFlowers() {
    const r = rng(44444);
    _flowData.length = 0;
    for (let i = 0; i < TOTAL_FLOW; i++) {
      _flowData.push({
        x: (r()-0.5)*CHUNK*GRID*0.9, z: (r()-0.5)*CHUNK*GRID*0.9,
        s: 0.08 + r() * 0.14,
        r: r(), g: r(), b: r(),
        phase: r()*Math.PI*2,
      });
    }
    _refreshFlowers(0);
  }
  function _refreshFlowers(t) {
    const c3 = new THREE.Color();
    _flowData.forEach((f, i) => {
      _dummy.position.set(f.x, 0.05, f.z);
      _dummy.scale.setScalar(f.s);
      _dummy.updateMatrix();
      _flowMesh.setMatrixAt(i, _dummy.matrix);
      // Bright saturated colours — unlit so always vivid
      const pulse = 0.75 + 0.25 * Math.sin(t * 0.0008 + f.phase);
      const mx = Math.max(f.r, f.g, f.b);
      c3.setRGB(f.r/mx * pulse, f.g/mx * pulse, f.b/mx * pulse);
      _flowMesh.setColorAt(i, c3);
    });
    _flowMesh.instanceMatrix.needsUpdate = true;
    _flowMesh.instanceColor.needsUpdate  = true;
  }

  // ── Fireflies ─────────────────────────────────────────────────
  function _initFireflies() {
    const r = rng(11111);
    _fireData.length = 0;
    for (let i = 0; i < 60; i++) {   // more fireflies
      _fireData.push({
        x: (r()-0.5)*CHUNK*2, y: 0.5+r()*4.0, z: (r()-0.5)*CHUNK*2,
        vx: (r()-0.5)*0.014, vz: (r()-0.5)*0.014,
        phase: r()*Math.PI*2, speed: 0.7+r()*1.4,
        cr: r(), cg: r(), cb: r(),   // per-firefly colour
      });
    }
  }
  function _updateFireflies(t, dt) {
    const c3 = new THREE.Color();
    const wrap = CHUNK * 1.6;
    _fireData.forEach((f, i) => {
      f.x += f.vx * dt * 0.04;
      f.y += Math.sin(t * 0.0008 * f.speed + f.phase) * 0.010;
      f.z += f.vz * dt * 0.04;
      if (f.x < _camPos.x-wrap) f.x += wrap*2;
      if (f.x > _camPos.x+wrap) f.x -= wrap*2;
      if (f.z < _camPos.z-wrap) f.z += wrap*2;
      if (f.z > _camPos.z+wrap) f.z -= wrap*2;
      _dummy.position.set(f.x, f.y, f.z);
      _dummy.scale.setScalar(0.20);
      _dummy.updateMatrix();
      _fireMesh.setMatrixAt(i, _dummy.matrix);
      // Night: bright pulsing; day: very faint (still visible)
      const nightBri = 0.45 + 0.55 * Math.sin(t * 0.0025 * f.speed + f.phase);
      const dayBri   = 0.08 + 0.06 * Math.sin(t * 0.0025 * f.speed + f.phase);
      const bri = _nightMode ? nightBri : (_isDusk ? nightBri * 0.5 : dayBri);
      const mx  = Math.max(f.cr, f.cg, f.cb, 0.01);
      c3.setRGB(f.cr/mx * bri, f.cg/mx * bri, f.cb/mx * bri);
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
    const mat = new THREE.MeshBasicMaterial({ color: 0x222211 });
    for (let i = 0; i < 5; i++) {
      _birds.push({
        orbitR: 18+r()*30, orbitY: 14+r()*20,
        speed: 0.0003+r()*0.0007, phase: r()*Math.PI*2,
        tilt: (r()-0.5)*0.3,
      });
      const geo = new THREE.ConeGeometry(0.20, 0.65, 3);
      geo.rotateX(Math.PI / 2);
      _birdMeshes.push(new THREE.Mesh(geo, mat));
      _scene.add(_birdMeshes[i]);
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

  // ── Lighting ──────────────────────────────────────────────────
  function _applyTimeOfDay() {
    const hr = new Date().getHours() + new Date().getMinutes() / 60;
    _nightMode = hr < 6 || hr >= 20;
    _isDusk    = !_nightMode && (hr < 7.5 || hr >= 17.5);

    if (_nightMode) {
      _scene.background.setStyle('#0b1612');
      _scene.fog.color.setStyle('#0b1612');
      _ambLight.color.setStyle('#1e3828');  _ambLight.intensity = 0.9;
      _sunLight.color.setStyle('#4060ff');  _sunLight.intensity = 0.5;
      _sunLight.position.set(-40, 60, -50);
      _hemiLight.color.setStyle('#1e4028'); _hemiLight.groundColor.setStyle('#0a200a');
      _hemiLight.intensity = 0.6;
      _cloudMesh.material.opacity = 0.30;
    } else if (_isDusk) {
      _scene.background.setStyle('#e8905a');
      _scene.fog.color.setStyle('#c87840');
      _ambLight.color.setStyle('#d09060');  _ambLight.intensity = 1.5;
      _sunLight.color.setStyle('#ffb060');  _sunLight.intensity = 2.0;
      _sunLight.position.set(hr > 12 ? -80 : 80, 30, 40);
      _hemiLight.color.setStyle('#e0a060'); _hemiLight.groundColor.setStyle('#503010');
      _hemiLight.intensity = 0.8;
      _cloudMesh.material.opacity = 0.85;
    } else {
      // Bright daytime
      _scene.background.setStyle('#5ab0e8');
      _scene.fog.color.setStyle('#8ecce8');
      _ambLight.color.setStyle('#d8f0e8');  _ambLight.intensity = 2.2;
      _sunLight.color.setStyle('#fff8e0');  _sunLight.intensity = 2.5;
      _sunLight.position.set(60, 90, 50);
      _hemiLight.color.setStyle('#90d8f0'); _hemiLight.groundColor.setStyle('#5a9c30');
      _hemiLight.intensity = 1.0;
      _cloudMesh.material.opacity = 0.95;
    }

    // Mushrooms & flowers glow stronger at night
    _mushMesh.material.opacity = _nightMode ? 1.0 : (_isDusk ? 0.85 : 0.65);
  }

  // ── Camera ────────────────────────────────────────────────────
  function _updateCamera(dt, t) {
    // WASD
    const spd = 0.022;
    if (_bindKeys['KeyW']||_bindKeys['ArrowUp'])    { _camPos.x += Math.sin(_camAz)*spd*dt; _camPos.z -= Math.cos(_camAz)*spd*dt; }
    if (_bindKeys['KeyS']||_bindKeys['ArrowDown'])  { _camPos.x -= Math.sin(_camAz)*spd*dt; _camPos.z += Math.cos(_camAz)*spd*dt; }
    if (_bindKeys['KeyA']||_bindKeys['ArrowLeft'])  { _camPos.x -= Math.cos(_camAz)*spd*dt*0.7; _camPos.z -= Math.sin(_camAz)*spd*dt*0.7; }
    if (_bindKeys['KeyD']||_bindKeys['ArrowRight']) { _camPos.x += Math.cos(_camAz)*spd*dt*0.7; _camPos.z += Math.sin(_camAz)*spd*dt*0.7; }

    // Manual walk impulse
    if (Math.abs(_walkSpd) > 0.001) {
      _camPos.x += Math.sin(_camAz) * _walkSpd * dt;
      _camPos.z -= Math.cos(_camAz) * _walkSpd * dt;
      _walkSpd *= Math.pow(0.88, dt / 16);
    }

    // Auto slow drift
    _camPos.x += Math.sin(_camAz) * 0.006 * dt;
    _camPos.z -= Math.cos(_camAz) * 0.006 * dt;
    _camPos.y = 5.2 + Math.sin(t * 0.00028) * 0.45;
    _camAlt   = Math.max(-0.60, Math.min(0.60, _camAlt));

    _canopyMesh.rotation.z = Math.sin(t * 0.00055) * 0.012;

    const lookX = _camPos.x + Math.sin(_camAz) * Math.cos(_camAlt) * 25;
    const lookY = _camPos.y + Math.sin(_camAlt) * 25;
    const lookZ = _camPos.z - Math.cos(_camAz) * Math.cos(_camAlt) * 25;
    _cam.position.set(_camPos.x, _camPos.y, _camPos.z);
    _cam.lookAt(lookX, lookY, lookZ);
  }

  // ── Input ─────────────────────────────────────────────────────
  function _dist2(a, b) {
    const dx = a.clientX - b.clientX, dy = a.clientY - b.clientY;
    return Math.sqrt(dx*dx + dy*dy);
  }

  function _bindInput(el) {
    el.addEventListener('mousedown', e => {
      _ptr.down = true;
      _ptr.x = e.clientX; _ptr.y = e.clientY;
      _ptr.az0 = _camAz; _ptr.alt0 = _camAlt;
    });
    window.addEventListener('mousemove', e => {
      if (!_ptr.down) return;
      _camAz  = _ptr.az0  - (e.clientX - _ptr.x) * 0.0030;
      _camAlt = _ptr.alt0 + (e.clientY - _ptr.y) * 0.0025;
    });
    window.addEventListener('mouseup', () => { _ptr.down = false; });

    el.addEventListener('wheel', e => {
      e.preventDefault();
      _walkSpd -= e.deltaY * 0.0008;
      _walkSpd = Math.max(-0.38, Math.min(0.38, _walkSpd));
    }, { passive: false });

    el.addEventListener('dblclick', _applyTimeOfDay);

    el.addEventListener('touchstart', e => {
      e.preventDefault();
      if (e.touches.length === 1) {
        _ptr.down = true; _pinch.active = false;
        _ptr.x = e.touches[0].clientX; _ptr.y = e.touches[0].clientY;
        _ptr.az0 = _camAz; _ptr.alt0 = _camAlt;
      } else if (e.touches.length === 2) {
        _ptr.down = false; _pinch.active = true;
        _pinch.dist0 = _dist2(e.touches[0], e.touches[1]);
        _pinch.fov0  = _camFov;
        _pinch.midY  = (e.touches[0].clientY + e.touches[1].clientY) * 0.5;
      }
    }, { passive: false });

    el.addEventListener('touchmove', e => {
      e.preventDefault();
      if (e.touches.length === 1 && _ptr.down) {
        _camAz  = _ptr.az0  - (e.touches[0].clientX - _ptr.x) * 0.0035;
        _camAlt = _ptr.alt0 + (e.touches[0].clientY - _ptr.y) * 0.0028;
      } else if (e.touches.length === 2 && _pinch.active) {
        const d = _dist2(e.touches[0], e.touches[1]);
        _camFov = Math.max(28, Math.min(90, _pinch.fov0 * (_pinch.dist0 / Math.max(d, 10))));
        _cam.fov = _camFov; _cam.updateProjectionMatrix();
        const midY = (e.touches[0].clientY + e.touches[1].clientY) * 0.5;
        _walkSpd = (_pinch.midY - midY) * 0.0018;
      }
    }, { passive: false });

    el.addEventListener('touchend', e => {
      if (e.touches.length < 2) _pinch.active = false;
      if (e.touches.length === 0) _ptr.down = false;
    }, { passive: true });

    let _lastTap = 0;
    el.addEventListener('touchend', () => {
      const now = Date.now();
      if (now - _lastTap < 300) _applyTimeOfDay();
      _lastTap = now;
    }, { passive: true });

    window.addEventListener('keydown', e => { _bindKeys[e.code] = true; });
    window.addEventListener('keyup',   e => { _bindKeys[e.code] = false; });
  }

  // ── Build scene ───────────────────────────────────────────────
  function _build() {
    const trunkGeo  = new THREE.CylinderGeometry(0.13, 0.38, 1, 6, 1);
    const canopyGeo = new THREE.SphereGeometry(1, 5, 4);
    const cloudGeo  = new THREE.SphereGeometry(1, 6, 4);
    const fireGeo   = new THREE.SphereGeometry(1, 4, 3);
    const mushGeo   = new THREE.SphereGeometry(1, 5, 4);   // mushroom cap
    const flowGeo   = new THREE.SphereGeometry(1, 4, 3);

    const trunkMat  = new THREE.MeshLambertMaterial({ vertexColors: true });
    const canopyMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const cloudMat  = new THREE.MeshLambertMaterial({ color: 0xf5faf5, transparent: true, opacity: 0.95 });
    const fireMat   = new THREE.MeshBasicMaterial({ vertexColors: true });         // unlit = always bright
    const mushMat   = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 1.0 });
    const flowMat   = new THREE.MeshBasicMaterial({ vertexColors: true });         // unlit flowers

    _trunkMesh  = new THREE.InstancedMesh(trunkGeo,  trunkMat,  TOTAL_T);
    _canopyMesh = new THREE.InstancedMesh(canopyGeo, canopyMat, TOTAL_C);
    _cloudMesh  = new THREE.InstancedMesh(cloudGeo,  cloudMat,  12);
    _fireMesh   = new THREE.InstancedMesh(fireGeo,   fireMat,   60);
    _mushMesh   = new THREE.InstancedMesh(mushGeo,   mushMat,   TOTAL_MUSH);
    _flowMesh   = new THREE.InstancedMesh(flowGeo,   flowMat,   TOTAL_FLOW);

    [_trunkMesh,_canopyMesh,_cloudMesh,_fireMesh,_mushMesh,_flowMesh]
      .forEach(m => { m.frustumCulled = false; });

    _scene.add(_trunkMesh, _canopyMesh, _cloudMesh, _fireMesh, _mushMesh, _flowMesh);

    // Ground
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(CHUNK * GRID * 6, CHUNK * GRID * 6),
      new THREE.MeshLambertMaterial({ color: 0x3c8a20 })
    );
    ground.rotation.x = -Math.PI / 2;
    _scene.add(ground);

    // Lights
    _ambLight  = new THREE.AmbientLight(0xd8f0e8, 2.2);
    _sunLight  = new THREE.DirectionalLight(0xfff8e0, 2.5);
    _sunLight.position.set(60, 90, 50);
    _hemiLight = new THREE.HemisphereLight(0x90d8f0, 0x5a9c30, 1.0);  // sky + ground bounce
    _scene.add(_ambLight, _sunLight, _hemiLight);

    _fillGrid();
    _initClouds();
    _initFireflies();
    _initMushrooms();
    _initFlowers();
    _initBirds();
    _applyTimeOfDay();
    setInterval(_applyTimeOfDay, 60000);
  }

  // ── Loop ─────────────────────────────────────────────────────
  function _loop(now) {
    _raf = requestAnimationFrame(_loop);
    const dt = Math.min(now - _lastT, 50);
    _lastT = now;

    _updateCamera(dt, now);
    _updateClouds(dt);
    _updateFireflies(now, dt);
    _refreshMushrooms(now);
    _refreshFlowers(now);
    _updateBirds(now);
    _checkChunks();
    _R.render(_scene, _cam);
  }

  // ── Resize (incl. fullscreen) ─────────────────────────────────
  function _onResize() {
    if (!_R || !_cam) return;
    const w = window.innerWidth, h = window.innerHeight;
    _R.setSize(w, h);
    _cam.aspect = w / h;
    _cam.updateProjectionMatrix();
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
      _scene.background = new THREE.Color(0x5ab0e8);
      _scene.fog = new THREE.FogExp2(0x8ecce8, 0.007);   // light, far horizon

      _cam = new THREE.PerspectiveCamera(
        _camFov, window.innerWidth / window.innerHeight, 0.4, 350
      );

      _dummy = new THREE.Object3D();

      _camPos.x = 0; _camPos.y = 5.2; _camPos.z = 0;
      _camAz = 0; _camAlt = 0.08; _camChunkX = 999; _camChunkZ = 999;

      _build();
      _bindInput(_el);

      window.addEventListener('resize', _onResize);
      // Fix blank screen on fullscreen toggle
      document.addEventListener('fullscreenchange', () => setTimeout(_onResize, 80));
      document.addEventListener('webkitfullscreenchange', () => setTimeout(_onResize, 80));

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
    document.removeEventListener('fullscreenchange', _onResize);
    document.removeEventListener('webkitfullscreenchange', _onResize);
    if (_el) { _el.remove(); _el = null; }
    if (_R)  { _R.dispose(); _R = null; }
    _birdMeshes = [];
    _scene = _cam = _trunkMesh = _canopyMesh = _cloudMesh =
      _fireMesh = _mushMesh = _flowMesh = null;
    _slots = [];
    _bindKeys = {};
    if (_canvas2d) { _canvas2d.style.display = ''; _canvas2d = null; }
  }

  function syncPan(azDeg) { _camAz = azDeg * Math.PI / 180; }

  return { start, stop, syncPan };
})();

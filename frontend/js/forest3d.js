/* ══════════════════════════════════════════════════════════
   Forest3D — Three.js infinite procedural forest
   All MeshBasicMaterial with solid material.color — no vertexColors
   Controls: drag pan/tilt · pinch zoom · scroll/WASD walk
   ══════════════════════════════════════════════════════════ */

const Forest3D = (() => {
  'use strict';

  const CHUNK = 48, GRID = 5, HALF = 2, TREES = 10;
  const CHUNKS_N = GRID * GRID;           // 25
  const MAX_PER  = CHUNKS_N * TREES;      // 250 worst-case per type

  // Plant archetypes  [hMin, hRange, trunkW, crXZ, crY, hexColor, hexTrunk]
  const PTYPES = [
    [14, 26, 1.0, 0.65, 1.8,  0x2a6e18, 0x5c3010],  // tall conifer   dark green
    [7,  12, 2.4, 1.7,  0.65, 0x3a8a20, 0x6a3a12],  // broad oak      medium green
    [2,   4, 0.5, 2.4,  0.45, 0x4aa028, 0x4a2e0e],  // shrub          lime
    [9,  14, 0.8, 1.0,  1.3,  0x228c1c, 0x5a3414],  // palm           tropical
    [12, 14, 0.4, 0.65, 1.0,  0x7ab840, 0xc8b090],  // birch          light + pale trunk
  ];
  const N = PTYPES.length;

  // ── Module state ─────────────────────────────────────────────
  let _R, _scene, _cam, _raf;
  // Per-archetype instanced meshes (trunk + canopy × N types)
  let _trunkMeshes = [], _canopyMeshes = [];
  let _cloudMesh, _fireMesh, _mushMeshes = [], _flowMeshes = [];
  let _birdMeshes = [];
  let _canvas2d = null, _el = null, _dummy = null;

  // Slot tracking — one entry per slot × per type
  // _typeCounts[slotIdx][typeIdx] = how many trees of that type in slot
  let _slots = [];
  // Global instance counters per type (trunk & canopy)
  let _tCount = new Int32Array(N);
  let _cCount = new Int32Array(N);
  let _camChunkX = 999, _camChunkZ = 999;

  const _camPos = { x:0, y:5.2, z:0 };
  let _camAz = 0, _camAlt = 0.08, _camFov = 62, _walkSpd = 0, _lastT = 0;
  let _nightMode = false, _isDusk = false;
  let _lastW = 0, _lastH = 0;

  let _ptr   = { down:false, x:0, y:0, az0:0, alt0:0 };
  let _pinch = { active:false, dist0:0, fov0:0, midY:0 };
  let _bindKeys = {};

  const _clouds = [], _birds = [], _fireData = [];
  const _mushData = [[], [], []];    // 3 colour groups
  const _flowData = [[], [], [], []] // 4 colour groups

  // ── Seeded random ─────────────────────────────────────────────
  function rng(seed) {
    let s = Math.abs(((seed * 9301 + 49297) | 0) % 233280);
    return () => {
      s = Math.abs(((s * 9301 + 49297) | 0) % 233280);
      return s / 233280;
    };
  }

  // ── Tree placement data ───────────────────────────────────────
  function _treeData(cx, cz) {
    const r = rng(cx * 9973 + cz * 9871 + 4567);
    return Array.from({ length: TREES }, () => {
      const angle = r() * Math.PI * 2;
      const dist  = CHUNK * (0.12 + r() * 0.42);
      return {
        lx   : Math.cos(angle) * dist + (r()-0.5) * CHUNK * 0.18,
        lz   : Math.sin(angle) * dist + (r()-0.5) * CHUNK * 0.18,
        h    : 0, cr: 0, lean: 0, gv: 0, ptype: 0,  // filled below
        _r   : r,
      };
    }).map(tr => {
      const r2 = tr._r;
      const pt = Math.min(N-1, Math.max(0, Math.floor(r2() * N)));
      const p  = PTYPES[pt];
      return {
        lx: tr.lx, lz: tr.lz,
        h   : p[0] + r2() * p[1],
        cr  : 2.0  + r2() * 3.5,
        lean: (r2()-0.5) * 0.06,
        gv  : r2(),
        ptype: pt,
      };
    });
  }

  // ── Update one chunk's instances ──────────────────────────────
  function _updateSlot(slotIdx, cx, cz) {
    const trees  = _treeData(cx, cz);
    const worldX = cx * CHUNK, worldZ = cz * CHUNK;

    // Clear old instances for this slot (set scale to 0)
    if (_slots[slotIdx] && _slots[slotIdx].ranges) {
      _slots[slotIdx].ranges.forEach(({ type, tStart, tEnd, cStart, cEnd }) => {
        for (let i = tStart; i < tEnd; i++) _hideInstance(_trunkMeshes[type], i);
        for (let i = cStart; i < cEnd; i++) _hideInstance(_canopyMeshes[type], i);
      });
    }

    // Group trees by type
    const byType = Array.from({ length: N }, () => []);
    trees.forEach(tr => byType[tr.ptype].push(tr));

    const ranges = [];
    byType.forEach((group, pt) => {
      if (!group.length) return;
      const p      = PTYPES[pt];
      const tStart = _tCount[pt];
      const cStart = _cCount[pt];
      const r2     = rng(cx * 71 + cz * 53 + pt * 17);

      group.forEach(tr => {
        const wx = worldX + tr.lx, wz = worldZ + tr.lz;

        // Trunk
        const ti = _tCount[pt]++;
        if (ti < MAX_PER) {
          _dummy.position.set(wx, tr.h * 0.5, wz);
          _dummy.scale.set(p[2], tr.h, p[2]);
          _dummy.rotation.set(0, 0, tr.lean);
          _dummy.updateMatrix();
          _trunkMeshes[pt].setMatrixAt(ti, _dummy.matrix);
        }

        // Canopy: 3 blobs
        for (let ci = 0; ci < 3; ci++) {
          const offX = (r2()-0.5) * tr.cr * 0.6;
          const offZ = (r2()-0.5) * tr.cr * 0.6;
          const offY = ci === 0 ? 0 : ci === 1 ? -tr.cr*0.30 : tr.cr*0.35;
          const sxy  = tr.cr * p[3] * (0.72 + r2()*0.44);
          const sy   = sxy   * p[4] * (0.55 + r2()*0.30);
          const idx  = _cCount[pt]++;
          if (idx < MAX_PER * 3) {
            _dummy.position.set(wx+offX, tr.h+offY, wz+offZ);
            _dummy.scale.set(sxy, sy, sxy);
            _dummy.rotation.set(0, r2()*Math.PI, 0);
            _dummy.updateMatrix();
            _canopyMeshes[pt].setMatrixAt(idx, _dummy.matrix);
          }
        }
      });

      ranges.push({ type: pt, tStart, tEnd: _tCount[pt], cStart, cEnd: _cCount[pt] });
    });

    _slots[slotIdx] = { cx, cz, ranges };

    // Mark update
    for (let pt = 0; pt < N; pt++) {
      _trunkMeshes[pt].instanceMatrix.needsUpdate  = true;
      _canopyMeshes[pt].instanceMatrix.needsUpdate = true;
      _trunkMeshes[pt].count  = _tCount[pt];
      _canopyMeshes[pt].count = _cCount[pt];
    }
  }

  function _hideInstance(mesh, i) {
    _dummy.scale.setScalar(0);
    _dummy.updateMatrix();
    mesh.setMatrixAt(i, _dummy.matrix);
    mesh.instanceMatrix.needsUpdate = true;
  }

  function _fillGrid() {
    _slots = new Array(CHUNKS_N);
    _tCount.fill(0); _cCount.fill(0);
    for (let gz = -HALF; gz <= HALF; gz++)
      for (let gx = -HALF; gx <= HALF; gx++) {
        const i = (gz+HALF)*GRID + (gx+HALF);
        _updateSlot(i, gx, gz);
      }
    _camChunkX = 0; _camChunkZ = 0;
  }

  // ── Chunk streaming ───────────────────────────────────────────
  function _checkChunks() {
    const cx = Math.round(_camPos.x / CHUNK);
    const cz = Math.round(_camPos.z / CHUNK);
    if (cx === _camChunkX && cz === _camChunkZ) return;
    _camChunkX = cx; _camChunkZ = cz;

    const desired = new Map();
    for (let gz = -HALF; gz <= HALF; gz++)
      for (let gx = -HALF; gx <= HALF; gx++) {
        const key = `${cx+gx},${cz+gz}`;
        desired.set(key, { cx: cx+gx, cz: cz+gz });
      }

    const stale = [];
    _slots.forEach((sl, i) => {
      if (!sl) { stale.push(i); return; }
      const key = `${sl.cx},${sl.cz}`;
      if (desired.has(key)) desired.delete(key);
      else stale.push(i);
    });

    const missing = [...desired.values()];
    stale.forEach((idx, i) => {
      if (i >= missing.length) return;
      _updateSlot(idx, missing[i].cx, missing[i].cz);
    });
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

  // ── Glowing mushrooms — 3 colour groups ──────────────────────
  const MUSH_COLORS = [0xff7020, 0x20d0a0, 0xb040f0]; // orange, teal, violet
  const MUSH_EACH   = 20;

  function _initMushrooms() {
    const r = rng(33333);
    for (let g = 0; g < 3; g++) {
      _mushData[g].length = 0;
      for (let i = 0; i < MUSH_EACH; i++) {
        _mushData[g].push({
          x: (r()-0.5)*CHUNK*GRID*0.8, z: (r()-0.5)*CHUNK*GRID*0.8,
          s: 0.18 + r() * 0.32, phase: r() * Math.PI * 2,
        });
      }
    }
    _placeMushrooms();
  }
  function _placeMushrooms() {
    for (let g = 0; g < 3; g++) {
      _mushData[g].forEach((m, i) => {
        _dummy.position.set(m.x, m.s*0.5, m.z);
        _dummy.scale.setScalar(m.s);
        _dummy.updateMatrix();
        _mushMeshes[g].setMatrixAt(i, _dummy.matrix);
      });
      _mushMeshes[g].instanceMatrix.needsUpdate = true;
    }
  }
  function _updateMushrooms(t) {
    for (let g = 0; g < 3; g++) {
      const base = MUSH_COLORS[g];
      const br   = ((base >> 16) & 0xff) / 255;
      const bg   = ((base >>  8) & 0xff) / 255;
      const bb   = ( base        & 0xff) / 255;
      // Pulse the whole group's material color
      const pulse = 0.6 + 0.4 * Math.sin(t * 0.0012 + g * 1.2);
      _mushMeshes[g].material.color.setRGB(br*pulse, bg*pulse, bb*pulse);
    }
  }

  // ── Luminous flowers — 4 colour groups ───────────────────────
  const FLOW_COLORS = [0xff4488, 0x4488ff, 0xffee22, 0xaa44ff];
  const FLOW_EACH   = 20;

  function _initFlowers() {
    const r = rng(44444);
    for (let g = 0; g < 4; g++) {
      _flowData[g].length = 0;
      for (let i = 0; i < FLOW_EACH; i++) {
        _flowData[g].push({
          x: (r()-0.5)*CHUNK*GRID*0.9, z: (r()-0.5)*CHUNK*GRID*0.9,
          s: 0.08 + r() * 0.14, phase: r() * Math.PI * 2,
        });
      }
    }
    _placeFlowers();
  }
  function _placeFlowers() {
    for (let g = 0; g < 4; g++) {
      _flowData[g].forEach((f, i) => {
        _dummy.position.set(f.x, 0.05, f.z);
        _dummy.scale.setScalar(f.s);
        _dummy.updateMatrix();
        _flowMeshes[g].setMatrixAt(i, _dummy.matrix);
      });
      _flowMeshes[g].instanceMatrix.needsUpdate = true;
    }
  }
  function _updateFlowers(t) {
    for (let g = 0; g < 4; g++) {
      const base  = FLOW_COLORS[g];
      const br    = ((base >> 16) & 0xff) / 255;
      const bg    = ((base >>  8) & 0xff) / 255;
      const bb    = ( base        & 0xff) / 255;
      const pulse = 0.7 + 0.3 * Math.sin(t * 0.0009 + g * 0.8);
      _flowMeshes[g].material.color.setRGB(br*pulse, bg*pulse, bb*pulse);
    }
  }

  // ── Fireflies ─────────────────────────────────────────────────
  const FIRE_N = 60;
  function _initFireflies() {
    const r = rng(11111);
    _fireData.length = 0;
    for (let i = 0; i < FIRE_N; i++) {
      _fireData.push({
        x: (r()-0.5)*CHUNK*2, y: 0.5+r()*4, z: (r()-0.5)*CHUNK*2,
        vx: (r()-0.5)*0.014,  vz: (r()-0.5)*0.014,
        phase: r()*Math.PI*2,  speed: 0.7+r()*1.4,
      });
    }
    _placeFireflies();
  }
  function _placeFireflies() {
    _fireData.forEach((f, i) => {
      _dummy.position.set(f.x, f.y, f.z);
      _dummy.scale.setScalar(0.20);
      _dummy.updateMatrix();
      _fireMesh.setMatrixAt(i, _dummy.matrix);
    });
    _fireMesh.instanceMatrix.needsUpdate = true;
  }
  function _updateFireflies(t, dt) {
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
      _dummy.scale.setScalar(0.22);
      _dummy.updateMatrix();
      _fireMesh.setMatrixAt(i, _dummy.matrix);
    });
    _fireMesh.instanceMatrix.needsUpdate = true;
    // Whole group pulses warm yellow-green
    const bri = (_nightMode || _isDusk)
      ? 0.45 + 0.55 * Math.sin(t * 0.0025)
      : 0.08 + 0.05 * Math.sin(t * 0.0025);
    _fireMesh.material.color.setRGB(bri, bri*0.9, bri*0.2);
  }

  // ── Birds ─────────────────────────────────────────────────────
  function _initBirds() {
    const r = rng(22222);
    _birds.length = 0;
    _birdMeshes.forEach(m => _scene.remove(m));
    _birdMeshes = [];
    for (let i = 0; i < 5; i++) {
      _birds.push({
        orbitR: 18+r()*30, orbitY: 14+r()*20,
        speed: 0.0003+r()*0.0007, phase: r()*Math.PI*2, tilt: (r()-0.5)*0.3,
      });
      const geo  = new THREE.ConeGeometry(0.20, 0.65, 3);
      geo.rotateX(Math.PI / 2);
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x222211 }));
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

  // ── Time of day ───────────────────────────────────────────────
  function _applyTimeOfDay() {
    const hr = new Date().getHours() + new Date().getMinutes() / 60;
    _nightMode = hr < 6 || hr >= 20;
    _isDusk    = !_nightMode && (hr < 7.5 || hr >= 17.5);

    if (_nightMode) {
      _scene.background.setStyle('#0d1e2a');
      _scene.fog.color.setStyle('#0d1e2a');
      // Blue-moonlit tint on canopy and trunks
      for (let pt = 0; pt < N; pt++) {
        const cc = PTYPES[pt][5];
        _canopyMeshes[pt].material.color.setRGB(
          _mixNight((cc>>16&0xff)/255, 0.5), _mixNight((cc>>8&0xff)/255, 0.6), _mixNight((cc&0xff)/255, 1.0));
        const tc = PTYPES[pt][6];
        _trunkMeshes[pt].material.color.setRGB(
          _mixNight((tc>>16&0xff)/255, 0.5), _mixNight((tc>>8&0xff)/255, 0.6), _mixNight((tc&0xff)/255, 1.0));
      }
      _cloudMesh.material.color.setStyle('#3a5878');
      _cloudMesh.material.opacity = 0.50;
    } else if (_isDusk) {
      _scene.background.setStyle('#e8905a');
      _scene.fog.color.setStyle('#c87840');
      for (let pt = 0; pt < N; pt++) {
        const cc = PTYPES[pt][5];
        _canopyMeshes[pt].material.color.setRGB(
          _mixDusk((cc>>16&0xff)/255,1.1), _mixDusk((cc>>8&0xff)/255,0.82), _mixDusk((cc&0xff)/255,0.45));
        const tc = PTYPES[pt][6];
        _trunkMeshes[pt].material.color.setRGB(
          _mixDusk((tc>>16&0xff)/255,1.1), _mixDusk((tc>>8&0xff)/255,0.82), _mixDusk((tc&0xff)/255,0.45));
      }
      _cloudMesh.material.color.setStyle('#f0c090');
      _cloudMesh.material.opacity = 0.88;
    } else {
      _scene.background.setStyle('#4eb8f0');
      _scene.fog.color.setStyle('#88cce8');
      for (let pt = 0; pt < N; pt++) {
        const cc = PTYPES[pt][5];
        _canopyMeshes[pt].material.color.setHex(cc);
        _trunkMeshes[pt].material.color.setHex(PTYPES[pt][6]);
      }
      _cloudMesh.material.color.setStyle('#ffffff');
      _cloudMesh.material.opacity = 0.96;
    }

    _fireMesh.visible = true; // always show, just very dim in day
  }

  // tint helpers
  function _mixNight(v, boost) { return Math.min(1, v * 0.4 * boost + 0.05); }
  function _mixDusk(v, mult)   { return Math.min(1, v * mult); }

  // ── Camera ────────────────────────────────────────────────────
  function _updateCamera(dt, t) {
    const spd = 0.022;
    if (_bindKeys['KeyW']||_bindKeys['ArrowUp'])    { _camPos.x += Math.sin(_camAz)*spd*dt; _camPos.z -= Math.cos(_camAz)*spd*dt; }
    if (_bindKeys['KeyS']||_bindKeys['ArrowDown'])  { _camPos.x -= Math.sin(_camAz)*spd*dt; _camPos.z += Math.cos(_camAz)*spd*dt; }
    if (_bindKeys['KeyA']||_bindKeys['ArrowLeft'])  { _camPos.x -= Math.cos(_camAz)*spd*0.7*dt; _camPos.z -= Math.sin(_camAz)*spd*0.7*dt; }
    if (_bindKeys['KeyD']||_bindKeys['ArrowRight']) { _camPos.x += Math.cos(_camAz)*spd*0.7*dt; _camPos.z += Math.sin(_camAz)*spd*0.7*dt; }
    if (Math.abs(_walkSpd) > 0.001) {
      _camPos.x += Math.sin(_camAz) * _walkSpd * dt;
      _camPos.z -= Math.cos(_camAz) * _walkSpd * dt;
      _walkSpd *= Math.pow(0.88, dt/16);
    }
    _camPos.x += Math.sin(_camAz) * 0.006 * dt;  // gentle auto-drift
    _camPos.z -= Math.cos(_camAz) * 0.006 * dt;
    _camPos.y = 5.2 + Math.sin(t * 0.00028) * 0.45;
    _camAlt   = Math.max(-0.6, Math.min(0.6, _camAlt));
    const lx  = _camPos.x + Math.sin(_camAz) * Math.cos(_camAlt) * 25;
    const ly  = _camPos.y + Math.sin(_camAlt) * 25;
    const lz  = _camPos.z - Math.cos(_camAz) * Math.cos(_camAlt) * 25;
    _cam.position.set(_camPos.x, _camPos.y, _camPos.z);
    _cam.lookAt(lx, ly, lz);
  }

  // ── Input ─────────────────────────────────────────────────────
  function _dist2(a, b) {
    const dx=a.clientX-b.clientX, dy=a.clientY-b.clientY;
    return Math.sqrt(dx*dx+dy*dy);
  }
  function _bindInput(el) {
    el.addEventListener('mousedown', e => {
      _ptr.down=true; _ptr.x=e.clientX; _ptr.y=e.clientY;
      _ptr.az0=_camAz; _ptr.alt0=_camAlt;
    });
    window.addEventListener('mousemove', e => {
      if (!_ptr.down) return;
      _camAz  = _ptr.az0  - (e.clientX-_ptr.x)*0.003;
      _camAlt = _ptr.alt0 + (e.clientY-_ptr.y)*0.0025;
    });
    window.addEventListener('mouseup', () => { _ptr.down=false; });
    el.addEventListener('wheel', e => {
      e.preventDefault();
      _walkSpd -= e.deltaY * 0.0008;
      _walkSpd = Math.max(-0.38, Math.min(0.38, _walkSpd));
    }, { passive:false });
    el.addEventListener('dblclick', _applyTimeOfDay);
    el.addEventListener('touchstart', e => {
      e.preventDefault();
      if (e.touches.length===1) {
        _ptr.down=true; _pinch.active=false;
        _ptr.x=e.touches[0].clientX; _ptr.y=e.touches[0].clientY;
        _ptr.az0=_camAz; _ptr.alt0=_camAlt;
      } else if (e.touches.length===2) {
        _ptr.down=false; _pinch.active=true;
        _pinch.dist0=_dist2(e.touches[0],e.touches[1]);
        _pinch.fov0=_camFov;
        _pinch.midY=(e.touches[0].clientY+e.touches[1].clientY)*0.5;
      }
    }, { passive:false });
    el.addEventListener('touchmove', e => {
      e.preventDefault();
      if (e.touches.length===1 && _ptr.down) {
        _camAz  = _ptr.az0  - (e.touches[0].clientX-_ptr.x)*0.0035;
        _camAlt = _ptr.alt0 + (e.touches[0].clientY-_ptr.y)*0.0028;
      } else if (e.touches.length===2 && _pinch.active) {
        const d = _dist2(e.touches[0],e.touches[1]);
        _camFov = Math.max(28, Math.min(90, _pinch.fov0*(_pinch.dist0/Math.max(d,10))));
        _cam.fov=_camFov; _cam.updateProjectionMatrix();
        const midY=(e.touches[0].clientY+e.touches[1].clientY)*0.5;
        _walkSpd=(_pinch.midY-midY)*0.0018;
      }
    }, { passive:false });
    el.addEventListener('touchend', e => {
      if (e.touches.length<2) _pinch.active=false;
      if (e.touches.length===0) _ptr.down=false;
    }, { passive:true });
    let _lt=0;
    el.addEventListener('touchend', () => {
      const n=Date.now(); if(n-_lt<300) _applyTimeOfDay(); _lt=n;
    }, { passive:true });
    window.addEventListener('keydown', e => { _bindKeys[e.code]=true; });
    window.addEventListener('keyup',   e => { _bindKeys[e.code]=false; });
  }

  // ── Per-frame resize ──────────────────────────────────────────
  function _checkResize() {
    const w=window.innerWidth, h=window.innerHeight;
    if (w!==_lastW || h!==_lastH) {
      _lastW=w; _lastH=h;
      _R.setSize(w,h); _cam.aspect=w/h; _cam.updateProjectionMatrix();
    }
  }

  // ── Build scene ───────────────────────────────────────────────
  function _build() {
    const trunkGeo  = new THREE.CylinderGeometry(0.13, 0.38, 1, 6, 1);
    const canopyGeo = new THREE.SphereGeometry(1, 5, 4);
    const cloudGeo  = new THREE.SphereGeometry(1, 6, 4);
    const fireGeo   = new THREE.SphereGeometry(1, 4, 3);
    const mushGeo   = new THREE.SphereGeometry(1, 5, 4);
    const flowGeo   = new THREE.SphereGeometry(1, 4, 3);

    // Per-type solid-colour meshes — NO vertexColors, proven reliable
    _trunkMeshes  = PTYPES.map((p, i) =>
      new THREE.InstancedMesh(trunkGeo,  new THREE.MeshBasicMaterial({ color: p[6] }), MAX_PER));
    _canopyMeshes = PTYPES.map((p, i) =>
      new THREE.InstancedMesh(canopyGeo, new THREE.MeshBasicMaterial({ color: p[5] }), MAX_PER * 3));

    _cloudMesh = new THREE.InstancedMesh(cloudGeo,
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 }), 12);
    _fireMesh  = new THREE.InstancedMesh(fireGeo,
      new THREE.MeshBasicMaterial({ color: 0xffd050 }), FIRE_N);
    _mushMeshes = MUSH_COLORS.map(c =>
      new THREE.InstancedMesh(mushGeo,  new THREE.MeshBasicMaterial({ color: c }), MUSH_EACH));
    _flowMeshes = FLOW_COLORS.map(c =>
      new THREE.InstancedMesh(flowGeo,  new THREE.MeshBasicMaterial({ color: c }), FLOW_EACH));

    const all = [..._trunkMeshes, ..._canopyMeshes,
                 _cloudMesh, _fireMesh, ..._mushMeshes, ..._flowMeshes];
    all.forEach(m => { m.frustumCulled = false; });
    all.forEach(m => _scene.add(m));

    // Ground — vivid green, no lights needed
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(CHUNK*GRID*6, CHUNK*GRID*6),
      new THREE.MeshBasicMaterial({ color: 0x4a9c28 })
    );
    ground.rotation.x = -Math.PI / 2;
    _scene.add(ground);

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
    if (!_cam || !_R || !_scene) return;   // guard: stop() may have run between RAF queue and fire
    const dt = Math.min(now - _lastT, 50);
    _lastT = now;
    _checkResize();
    _updateCamera(dt, now);
    _updateClouds(dt);
    _updateFireflies(now, dt);
    _updateMushrooms(now);
    _updateFlowers(now);
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
      if (THREE.sRGBEncoding   !== undefined) _R.outputEncoding   = THREE.sRGBEncoding;
      if (THREE.SRGBColorSpace !== undefined) _R.outputColorSpace = THREE.SRGBColorSpace;

      _scene = new THREE.Scene();
      _scene.background = new THREE.Color(0x4eb8f0);
      _scene.fog = new THREE.FogExp2(0x88cce8, 0.007);

      _cam = new THREE.PerspectiveCamera(_camFov, window.innerWidth/window.innerHeight, 0.4, 350);
      _dummy = new THREE.Object3D();

      _camPos.x=0; _camPos.y=5.2; _camPos.z=0;
      _camAz=0; _camAlt=0.08; _camChunkX=999; _camChunkZ=999;
      _lastW=window.innerWidth; _lastH=window.innerHeight;

      _build();
      _bindInput(_el);
      window.addEventListener('resize', () => _checkResize());
      _lastT = performance.now();
      _loop(_lastT);
    }

    if (typeof THREE === 'undefined') {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js';
      s.onload = _launch;
      document.head.appendChild(s);
    } else {
      _launch();
    }
  }

  // ── Public: stop ─────────────────────────────────────────────
  function stop() {
    cancelAnimationFrame(_raf);
    if (_el) { _el.remove(); _el = null; }
    if (_R)  { _R.dispose(); _R = null; }
    _trunkMeshes=[]; _canopyMeshes=[]; _birdMeshes=[];
    _mushMeshes=[]; _flowMeshes=[];
    _scene=_cam=_cloudMesh=_fireMesh=null;
    _slots=[]; _bindKeys={};
    _tCount.fill(0); _cCount.fill(0);
    if (_canvas2d) { _canvas2d.style.display=''; _canvas2d=null; }
  }

  function syncPan(azDeg) { _camAz = azDeg * Math.PI / 180; }

  return { start, stop, syncPan };
})();

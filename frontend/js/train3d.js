'use strict';
/* ═══════════════════════════════════════════════════════════════════
   TRAIN3D  —  Vintage railway carriage interior
   Three.js r149  ·  scene.background CanvasTexture from bg-canvas
   ───────────────────────────────────────────────────────────────────
   Approach: Opaque WebGLRenderer. scene.background is set to a
   CanvasTexture wrapping the bg-canvas element (which canvas_scenes.js
   animates with the exterior scenery each frame). The texture is
   marked needsUpdate=true every frame so Three.js re-uploads it.
   Opaque 3D geometry (walls, seats, ceiling) covers the background;
   the window opening has NO geometry → the background texture shows
   through, giving the illusion of looking out at the moving landscape.
   This avoids any CSS-compositing / premultipliedAlpha quirks.
   ═══════════════════════════════════════════════════════════════════ */
const Train3D = (() => {

  const CDN         = 'https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js';
  const ORBIT_CDN   = 'https://cdn.jsdelivr.net/npm/three@0.149.0/examples/js/controls/OrbitControls.js';
  // DEBUG: press O to toggle orbit controls (lets you rotate camera to inspect geometry)
  let _orbit = null;

  // ── Carriage dimensions (half-units)
  const RW = 2.2;   // room half-width  (X: -RW … +RW)
  const RH = 3.0;   // room height      (Y: 0 … RH)
  const RD = 5.0;   // room half-depth  (Z: +RD … -RD)
  const WIN_Z   = -RD + 0.06;    // window wall Z
  const WIN_W   = 2.6;           // window opening half-width
  const WIN_BOT = 0.58;          // window bottom Y
  const WIN_TOP = 2.20;          // window top Y
  const WIN_DIV = 1.38;          // divider bar Y
  const FRAME_T = 0.11;          // frame bar thickness

  // ── State
  let _el      = null;   // WebGL canvas (opaque, z-index:1 covers bg-canvas)
  let _R       = null;
  let _scene   = null;
  let _cam     = null;
  let _raf     = null;
  let _W=0, _H=0;
  let _running = false;
  let _swayT   = 0;
  let _lastNow = 0;
  let _carriageGroup = null;
  let _bgCanvas = null;  // reference to bg-canvas element (exterior animation)
  let _bgTex    = null;  // THREE.CanvasTexture wrapping _bgCanvas

  // ─────────────────────────────────────────────────────────────────
  //  PUBLIC API
  // ─────────────────────────────────────────────────────────────────
  function start(canvas2d) {
    if (_running) return;
    _running  = true;
    // bg-canvas (canvas2d) is animated by canvas_scenes.js with the exterior
    // scenery. We wrap it in a CanvasTexture and use it as scene.background so
    // the exterior is visible through the window opening in the 3D carriage.
    _bgCanvas = document.getElementById('bg-canvas') || canvas2d || null;

    _el = document.createElement('canvas');
    _el.id = 'train3d-canvas';
    _el.style.cssText = 'position:fixed;inset:0;z-index:1;width:100%;height:100%;pointer-events:none;display:block;';
    // Insert immediately after bg-canvas so it sits in the correct layer
    const bg = document.getElementById('bg-canvas');
    if (bg && bg.nextSibling) {
      document.body.insertBefore(_el, bg.nextSibling);
    } else {
      document.body.appendChild(_el);
    }

    if (typeof THREE !== 'undefined') {
      _launch();
    } else {
      const s = document.createElement('script');
      s.src    = CDN;
      s.onload = _launch;
      document.head.appendChild(s);
    }
  }

  function stop() {
    _running = false;
    cancelAnimationFrame(_raf);
    _raf = null;
    if (_orbit) { _orbit.dispose(); _orbit = null; }
    if (_scene) {
      _scene.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          const ms = Array.isArray(o.material) ? o.material : [o.material];
          ms.forEach(m => m.dispose());
        }
      });
      _scene = null;
    }
    if (_bgTex)  { _bgTex.dispose();  _bgTex  = null; }
    if (_R)      { _R.dispose();      _R      = null; }
    _cam = null;
    _carriageGroup = null;
    _bgCanvas = null;
    const c = document.getElementById('train3d-canvas');
    if (c) c.remove();
    _el = null;
  }

  // ─────────────────────────────────────────────────────────────────
  //  LAUNCH
  // ─────────────────────────────────────────────────────────────────
  function _launch() {
    if (!_running || !_el) return;

    // ── Renderer — opaque canvas; exterior shown via scene.background ──
    _R = new THREE.WebGLRenderer({
      canvas:          _el,
      antialias:       true,
      powerPreference: 'high-performance',
    });
    _R.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    _R.shadowMap.enabled = false;

    // ── Scene background — CanvasTexture from bg-canvas ──────────────
    // canvas_scenes.js animates the exterior scenery onto bg-canvas each
    // frame. We wrap it in a CanvasTexture so Three.js renders it as the
    // scene background. The window opening (no 3D geometry) lets the
    // background show through, giving a realistic exterior view.
    _scene = new THREE.Scene();
    if (_bgCanvas) {
      _bgTex = new THREE.CanvasTexture(_bgCanvas);
      _scene.background = _bgTex;
    } else {
      // Fallback: dark sky colour if bg-canvas not found
      _scene.background = new THREE.Color(0x0a1520);
    }

    // ── Camera ────────────────────────────────────────────────────
    // Eye-level from passenger seat, looking toward the window wall
    _cam = new THREE.PerspectiveCamera(56, 1, 0.05, 60);
    _cam.position.set(0, 1.15, RD - 0.5);
    _cam.lookAt(0, 1.02, WIN_Z);

    _buildLights();
    _buildCarriage();

    // ── Debug orbit controls (press O to toggle) ──────────────────
    // Loads OrbitControls and allows free camera rotation to inspect geometry.
    // Remove or disable for production.
    const _loadOrbit = () => {
      if (typeof THREE.OrbitControls !== 'undefined') {
        _orbit = new THREE.OrbitControls(_cam, _el);
        _orbit.target.set(0, 1.0, WIN_Z);
        _orbit.update();
        console.log('[Train3D] OrbitControls active — drag to rotate, scroll to zoom');
      }
    };
    const _orbitScript = document.createElement('script');
    _orbitScript.src    = ORBIT_CDN;
    _orbitScript.onload = _loadOrbit;
    document.head.appendChild(_orbitScript);

    window.addEventListener('keydown', e => {
      if (e.key === 'o' || e.key === 'O') {
        if (_orbit) {
          _orbit.enabled = !_orbit.enabled;
          console.log('[Train3D] OrbitControls', _orbit.enabled ? 'ON' : 'OFF');
        }
      }
      // W = toggle wireframe on all geometry to see hidden surfaces
      if (e.key === 'w' || e.key === 'W') {
        _scene && _scene.traverse(obj => {
          if (obj.material) {
            const ms = Array.isArray(obj.material) ? obj.material : [obj.material];
            ms.forEach(m => { if (m.wireframe !== undefined) m.wireframe = !m.wireframe; });
          }
        });
      }
    });

    _checkResize();

    _lastNow = performance.now();
    _loop(_lastNow);
  }

  function _checkResize() {
    const cw = (_el.clientWidth  || window.innerWidth)  | 0;
    const ch = (_el.clientHeight || window.innerHeight) | 0;
    if (cw !== _W || ch !== _H) {
      _W = cw; _H = ch;
      _R.setSize(cw, ch, false);
      _cam.aspect = cw / ch;
      _cam.updateProjectionMatrix();
    }
  }

  // ─────────────────────────────────────────────────────────────────
  //  LIGHTS
  // ─────────────────────────────────────────────────────────────────
  function _buildLights() {
    // Warm ambient — carriage interior glow
    _scene.add(new THREE.AmbientLight(0xfff0d8, 0.55));

    // Ceiling strip lights — 3 along Z axis
    const ceilCols = [0xffe8a0, 0xfff0c0, 0xffe8a0];
    [-1.8, 0, 1.8].forEach((z, i) => {
      const pl = new THREE.PointLight(ceilCols[i], 1.1, 6.5);
      pl.position.set(0, RH - 0.22, z);
      _scene.add(pl);
    });

    // Gentle fill from the window (cool daylight from outside)
    const winFill = new THREE.DirectionalLight(0xc8e0ff, 0.28);
    winFill.position.set(0, 2, -8);
    _scene.add(winFill);
  }

  // ─────────────────────────────────────────────────────────────────
  //  CARRIAGE GEOMETRY
  // ─────────────────────────────────────────────────────────────────
  function _buildCarriage() {
    _carriageGroup = new THREE.Group();
    _scene.add(_carriageGroup);

    _buildFloor();
    _buildWalls();
    _buildWindowWall();    // opaque panels around opening — covers backdrop in wall areas
    _buildWindowFrame();   // decorative brass+green frame bars
    // Glass pane removed: window opening is clear → backdrop plane shows through directly
    _buildCeiling();
    _buildSeats();
    _buildLuggageRacks();
    _buildCeilingFixtures();
  }

  // ── Shared materials ────────────────────────────────────────────
  function _wallMat()    { return new THREE.MeshStandardMaterial({ color:0x1a3320, roughness:0.68, metalness:0.05, side: THREE.DoubleSide }); }
  function _brassMat()   { return new THREE.MeshStandardMaterial({ color:0x9a7830, roughness:0.38, metalness:0.75 }); }
  function _leatherMat() { return new THREE.MeshStandardMaterial({ color:0x7a3e18, roughness:0.82, metalness:0.02 }); }
  function _creamMat()   { return new THREE.MeshStandardMaterial({ color:0xf2eddf, roughness:0.88, metalness:0.00 }); }
  function _woodMat()    { return new THREE.MeshStandardMaterial({ color:0x2a1a0c, roughness:0.90, metalness:0.00 }); }
  function _metalMat()   { return new THREE.MeshStandardMaterial({ color:0x4a5a4a, roughness:0.55, metalness:0.55 }); }

  function _add(geo, mat, x, y, z, rx, ry, rz) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x ?? 0, y ?? 0, z ?? 0);
    if (rx) m.rotation.x = rx;
    if (ry) m.rotation.y = ry;
    if (rz) m.rotation.z = rz;
    _carriageGroup.add(m);
    return m;
  }

  // ── Floor ────────────────────────────────────────────────────────
  function _buildFloor() {
    const geo = new THREE.PlaneGeometry(RW * 2, RD * 2);
    _add(geo, _woodMat(), 0, 0, 0, -Math.PI / 2);
    // Centre aisle runner (slightly different tone)
    const runnerMat = new THREE.MeshStandardMaterial({ color:0x1e1208, roughness:0.95 });
    _add(new THREE.PlaneGeometry(0.8, RD * 2), runnerMat, 0, 0.001, 0, -Math.PI / 2);
  }

  // ── Side walls & ceiling end walls ───────────────────────────────
  function _buildWalls() {
    const wm = _wallMat();

    // Left wall (X = -RW)
    _add(new THREE.PlaneGeometry(RD * 2, RH), wm,
      -RW, RH / 2, 0, 0, Math.PI / 2);

    // Right wall (X = +RW)
    _add(new THREE.PlaneGeometry(RD * 2, RH), wm,
      RW, RH / 2, 0, 0, -Math.PI / 2);

    // Rear wall (behind camera — never seen, but closes the room)
    _add(new THREE.PlaneGeometry(RW * 2, RH), wm,
      0, RH / 2, RD, 0, Math.PI);

    // Brass divider strips on side walls (horizontal rail at seat-back height)
    const bm = _brassMat();
    const railY = 1.05;
    [-RW + 0.01, RW - 0.01].forEach((x, si) => {
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(0.018, 0.055, RD * 2),
        bm,
      );
      strip.position.set(x, railY, 0);
      _carriageGroup.add(strip);
    });

    // Upper brass strip (picture-rail height)
    const picY = RH - 0.42;
    [-RW + 0.01, RW - 0.01].forEach(x => {
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(0.015, 0.04, RD * 2),
        bm,
      );
      strip.position.set(x, picY, 0);
      _carriageGroup.add(strip);
    });

    // Vertical support pilasters on each side (every 1.8 units along Z)
    const pilW = 0.06, pilD = 0.04;
    for (let z = -RD + 1.0; z <= RD - 0.5; z += 1.8) {
      [-RW + 0.02, RW - 0.02].forEach(x => {
        const pil = new THREE.Mesh(
          new THREE.BoxGeometry(pilD, RH, pilW),
          _metalMat(),
        );
        pil.position.set(x, RH / 2, z);
        _carriageGroup.add(pil);
        // Brass cap at top & bottom
        [0, RH].forEach(py => {
          const cap = new THREE.Mesh(new THREE.BoxGeometry(pilD * 1.4, 0.05, pilW * 1.4), bm);
          cap.position.set(x, py, z);
          _carriageGroup.add(cap);
        });
      });
    }
  }

  // ── Window wall — 4 panels around the opening ───────────────────
  function _buildWindowWall() {
    const wm = _wallMat();
    const z  = WIN_Z;

    // Panels face the camera at +Z  (no rotation needed for PlaneGeometry —
    // default normal is +Z which points toward camera).  DoubleSide on wm
    // ensures they block the bg plane from both sides too.

    // Top panel (above window)
    _add(new THREE.PlaneGeometry(RW * 2, RH - WIN_TOP), wm,
      0, WIN_TOP + (RH - WIN_TOP) / 2, z);

    // Bottom panel (sill area below window)
    _add(new THREE.PlaneGeometry(RW * 2, WIN_BOT), wm,
      0, WIN_BOT / 2, z);

    // Left column (WIN_W > RW so these are very narrow / outside room — harmless)
    _add(new THREE.PlaneGeometry(Math.max(0.01, RW - WIN_W), WIN_TOP - WIN_BOT), wm,
      -(WIN_W + Math.max(0.01, RW - WIN_W) / 2), WIN_BOT + (WIN_TOP - WIN_BOT) / 2, z);

    // Right column
    _add(new THREE.PlaneGeometry(Math.max(0.01, RW - WIN_W), WIN_TOP - WIN_BOT), wm,
      WIN_W + Math.max(0.01, RW - WIN_W) / 2, WIN_BOT + (WIN_TOP - WIN_BOT) / 2, z);
  }

  // ── Window frame (dark green with brass inlay) ──────────────────
  function _buildWindowFrame() {
    const z     = WIN_Z + 0.04;   // slightly in front of wall
    const wm    = _wallMat();
    const bm    = _brassMat();
    const openW = WIN_W * 2;      // full opening width
    const openH = WIN_TOP - WIN_BOT;

    // ── Outer frame bars ─────────────────────────────────────────
    // Top bar
    _add(new THREE.BoxGeometry(openW + FRAME_T * 2, FRAME_T, 0.12), wm,
      0, WIN_TOP + FRAME_T / 2, z);
    // Bottom bar / sill
    const sillH = 0.22;
    _add(new THREE.BoxGeometry(openW + FRAME_T * 2, sillH, 0.18), wm,
      0, WIN_BOT - sillH / 2 + 0.04, z);
    // Left column
    _add(new THREE.BoxGeometry(FRAME_T, openH + FRAME_T, 0.12), wm,
      -WIN_W - FRAME_T / 2, WIN_BOT + openH / 2, z);
    // Right column
    _add(new THREE.BoxGeometry(FRAME_T, openH + FRAME_T, 0.12), wm,
      WIN_W + FRAME_T / 2, WIN_BOT + openH / 2, z);

    // ── Horizontal divider bar ────────────────────────────────────
    const divT = 0.065;
    _add(new THREE.BoxGeometry(openW, divT, 0.10), wm,
      0, WIN_DIV, z);

    // ── Brass inlay strips on frame edges ─────────────────────────
    const bInlay = 0.012;
    // Top brass strip
    _add(new THREE.BoxGeometry(openW + FRAME_T * 2, bInlay, 0.01), bm,
      0, WIN_TOP + FRAME_T - bInlay / 2, z + 0.07);
    // Bottom brass strip
    _add(new THREE.BoxGeometry(openW + FRAME_T * 2, bInlay, 0.01), bm,
      0, WIN_BOT - bInlay / 2, z + 0.07);
    // Left brass strip
    _add(new THREE.BoxGeometry(bInlay, openH, 0.01), bm,
      -WIN_W + bInlay / 2, WIN_BOT + openH / 2, z + 0.07);
    // Right brass strip
    _add(new THREE.BoxGeometry(bInlay, openH, 0.01), bm,
      WIN_W - bInlay / 2, WIN_BOT + openH / 2, z + 0.07);
    // Divider brass strip
    _add(new THREE.BoxGeometry(openW, bInlay, 0.01), bm,
      0, WIN_DIV - bInlay / 2, z + 0.06);

    // ── Corner hex bolt details ────────────────────────────────────
    const boltMat = new THREE.MeshStandardMaterial({ color:0xb8982a, roughness:0.3, metalness:0.8 });
    [
      [-WIN_W - FRAME_T * 0.5,  WIN_BOT + openH - FRAME_T * 0.5],
      [ WIN_W + FRAME_T * 0.5,  WIN_BOT + openH - FRAME_T * 0.5],
      [-WIN_W - FRAME_T * 0.5,  WIN_BOT + FRAME_T * 0.5],
      [ WIN_W + FRAME_T * 0.5,  WIN_BOT + FRAME_T * 0.5],
    ].forEach(([bx, by]) => {
      const bolt = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.035, 0.02, 6),
        boltMat,
      );
      bolt.rotation.x = Math.PI / 2;
      bolt.position.set(bx, by, z + 0.10);
      _carriageGroup.add(bolt);
    });

    // ── Window sill ledge (interior ledge below window) ───────────
    _add(new THREE.BoxGeometry(openW + FRAME_T * 2.5, 0.06, 0.22), wm,
      0, WIN_BOT - 0.02, z + 0.14);

    // ── Vertical support columns flanking window ──────────────────
    const colW = 0.10, colD = 0.14;
    [-WIN_W - FRAME_T - colW / 2, WIN_W + FRAME_T + colW / 2].forEach(cx => {
      const col = new THREE.Mesh(
        new THREE.BoxGeometry(colW, RH, colD),
        _metalMat(),
      );
      col.position.set(cx, RH / 2, z + colD / 2);
      _carriageGroup.add(col);
      // Brass cap bands at thirds
      [RH * 0.25, RH * 0.5, RH * 0.75].forEach(cy => {
        const band = new THREE.Mesh(new THREE.BoxGeometry(colW * 1.3, 0.04, colD * 1.3), bm);
        band.position.set(cx, cy, z + colD / 2);
        _carriageGroup.add(band);
      });
    });
  }

  // ── Glass pane — very subtle tint only (window shows bg plane behind)
  function _buildGlassPane() {
    const openW = WIN_W * 2;
    // Extremely low-opacity tinted planes — just enough to hint at glass
    // but not enough to obscure the bg-texture scenery behind
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xa8c8e0, transparent: true, opacity: 0.025,
      roughness: 0.02, metalness: 0.0, side: THREE.DoubleSide,
      depthWrite: false,
    });
    [[WIN_BOT + (WIN_DIV - WIN_BOT) / 2, WIN_DIV - WIN_BOT - 0.04],
     [WIN_DIV + (WIN_TOP - WIN_DIV) / 2, WIN_TOP - WIN_DIV  - 0.04]
    ].forEach(([py, ph]) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(openW - 0.02, ph), glassMat);
      m.position.set(0, py, WIN_Z + 0.015);
      _carriageGroup.add(m);
    });
  }

  // ── Curved ceiling ───────────────────────────────────────────────
  function _buildCeiling() {
    const cm = _creamMat();

    // Curved arch: open cylinder, top portion only
    // CylinderGeometry(radiusTop, radiusBottom, height, radialSegments, heightSegments, openEnded, thetaStart, thetaLength)
    const archR   = RW * 1.08;
    const archGeo = new THREE.CylinderGeometry(
      archR, archR,
      RD * 2,       // length along Z (cylinder axis = Z after rotation)
      20, 1,
      true,
      Math.PI * 0.08, Math.PI * 0.84,  // ~150° arc across the top
    );
    const arch = new THREE.Mesh(archGeo, cm);
    arch.rotation.z = Math.PI / 2;    // lay cylinder on its side (axis along Z)
    arch.rotation.x = Math.PI / 2;    // align with room
    arch.position.y = RH - 0.02;
    _carriageGroup.add(arch);

    // Ceiling end caps (flat panels at front/back ends for the arch gap areas)
    const capMat = cm;
    // Flat centre ceiling strip
    _add(new THREE.PlaneGeometry(RW * 0.6, RD * 2), capMat,
      0, RH + archR * 0.06 - 0.01, 0, Math.PI / 2);  // slightly above arch centre

    // Cornice trim where ceiling meets walls
    const corniceGeo = new THREE.BoxGeometry(0.06, 0.08, RD * 2);
    const cornMat    = _brassMat();
    [-RW + 0.08, RW - 0.08].forEach(x => {
      const c = new THREE.Mesh(corniceGeo, cornMat);
      c.position.set(x, RH - 0.02, 0);
      _carriageGroup.add(c);
    });
  }

  // ── Bench seats ──────────────────────────────────────────────────
  function _buildSeats() {
    const lm  = _leatherMat();
    const bm  = _brassMat();
    const wm  = _wallMat();
    const seatLength = RD * 1.85;   // bench extends most of room depth
    const seatZ = -0.3;             // bench centre Z (slightly back from centre)

    [-RW, RW].forEach(side => {
      const sx = side < 0 ? -RW + 0.38 : RW - 0.38;
      const seatW = 0.72;
      const seatH = 0.13;
      const seatY = 0.46;

      // ── Seat cushion ──────────────────────────────────────────
      const cushGeo = new THREE.BoxGeometry(seatW, seatH, seatLength);
      const cush = new THREE.Mesh(cushGeo, lm);
      cush.position.set(sx, seatY, seatZ);
      _carriageGroup.add(cush);

      // Cushion bevelled edge (rounded appearance)
      const edgeMat = new THREE.MeshStandardMaterial({
        color: 0x6a3414, roughness: 0.85, metalness: 0.0,
      });
      const edgeGeo = new THREE.BoxGeometry(seatW * 0.95, seatH * 0.3, seatLength);
      const edge = new THREE.Mesh(edgeGeo, edgeMat);
      edge.position.set(sx, seatY + seatH * 0.55, seatZ);
      _carriageGroup.add(edge);

      // Stitching seams (thin dark strips across the seat)
      const seamMat = new THREE.MeshStandardMaterial({ color: 0x3a1a08, roughness: 0.9 });
      for (let sz = -seatLength / 2 + 0.4; sz < seatLength / 2 - 0.2; sz += 0.42) {
        const seam = new THREE.Mesh(new THREE.BoxGeometry(seatW * 0.97, 0.008, 0.01), seamMat);
        seam.position.set(sx, seatY + seatH / 2 + 0.005, seatZ + sz);
        _carriageGroup.add(seam);
      }

      // ── Seat base / plinth ────────────────────────────────────
      const plinthGeo = new THREE.BoxGeometry(seatW + 0.04, seatY, seatLength + 0.04);
      const plinth = new THREE.Mesh(plinthGeo, wm);
      plinth.position.set(sx, seatY / 2, seatZ);
      _carriageGroup.add(plinth);

      // Brass plinth trim
      const trimGeo = new THREE.BoxGeometry(seatW + 0.06, 0.025, seatLength + 0.06);
      const trim = new THREE.Mesh(trimGeo, bm);
      trim.position.set(sx, seatY - 0.01, seatZ);
      _carriageGroup.add(trim);

      // ── Seat back ─────────────────────────────────────────────
      const backH  = 0.68;
      const backW  = seatW;
      const backT  = 0.10;
      // Slight recline angle
      const backAng = side < 0 ? 0.14 : -0.14;   // tilt toward wall

      const backGeo = new THREE.BoxGeometry(backW, backH, backT);
      const back = new THREE.Mesh(backGeo, lm);
      back.position.set(
        sx + Math.sin(backAng) * (backH / 2 + seatH),
        seatY + seatH / 2 + backH / 2,
        seatZ,
      );
      back.rotation.z = backAng;
      _carriageGroup.add(back);

      // Seat back stitching
      for (let sz = -seatLength / 2 + 0.35; sz < seatLength / 2 - 0.15; sz += 0.38) {
        const seam = new THREE.Mesh(new THREE.BoxGeometry(0.008, backH * 0.9, 0.012), seamMat);
        seam.position.set(sx - (side < 0 ? -1 : 1) * backT * 0.52, seatY + seatH / 2 + backH / 2, seatZ + sz);
        _carriageGroup.add(seam);
      }

      // Brass tack rail at top of seat back
      const tackRail = new THREE.Mesh(
        new THREE.BoxGeometry(backW + 0.02, 0.03, 0.025),
        bm,
      );
      tackRail.position.set(sx, seatY + seatH / 2 + backH + 0.015, seatZ);
      _carriageGroup.add(tackRail);
    });
  }

  // ── Luggage racks ────────────────────────────────────────────────
  function _buildLuggageRacks() {
    const mm  = _metalMat();
    const bm  = _brassMat();
    const ry  = RH - 0.42;   // rack height
    const rDepth  = RD * 1.85;
    const rackW   = 0.62;

    [-RW, RW].forEach(side => {
      const rx = side < 0 ? -RW + rackW / 2 + 0.04 : RW - rackW / 2 - 0.04;

      // Main rack bar (front edge)
      const bar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.018, 0.018, rDepth, 8),
        bm,
      );
      bar.rotation.x = Math.PI / 2;
      bar.position.set(rx + (side < 0 ? rackW / 2 : -rackW / 2) - 0.02, ry, -0.3);
      _carriageGroup.add(bar);

      // Cross bars (mesh / grid)
      for (let z = -RD + 0.5; z <= RD - 0.5; z += 0.38) {
        const cbar = new THREE.Mesh(
          new THREE.CylinderGeometry(0.01, 0.01, rackW, 6),
          mm,
        );
        cbar.rotation.z = Math.PI / 2;
        cbar.position.set(rx, ry, z);
        _carriageGroup.add(cbar);
      }

      // Diagonal support struts from wall
      const strutZ_list = [-RD + 0.8, -0.5, RD - 1.0];
      strutZ_list.forEach(sz => {
        const strutGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.48, 6);
        const strut = new THREE.Mesh(strutGeo, mm);
        strut.position.set(
          side < 0 ? -RW + 0.18 : RW - 0.18,
          ry + 0.15,
          sz,
        );
        strut.rotation.z = side < 0 ? -0.6 : 0.6;
        _carriageGroup.add(strut);
      });
    });
  }

  // ── Ceiling fixtures ─────────────────────────────────────────────
  function _buildCeilingFixtures() {
    const bm  = _brassMat();
    const cm  = _creamMat();

    // 3 pendant light fixtures along ceiling centre
    [-1.8, 0, 1.8].forEach(z => {
      // Mounting plate
      const plate = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.10, 0.025, 8),
        bm,
      );
      plate.position.set(0, RH - 0.06, z);
      _carriageGroup.add(plate);

      // Short stem
      const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.015, 0.015, 0.12, 6),
        bm,
      );
      stem.position.set(0, RH - 0.14, z);
      _carriageGroup.add(stem);

      // Shade (inverted cone)
      const shade = new THREE.Mesh(
        new THREE.ConeGeometry(0.18, 0.14, 10, 1, true),
        cm,
      );
      shade.rotation.x = Math.PI;
      shade.position.set(0, RH - 0.26, z);
      _carriageGroup.add(shade);

      // Glowing bulb (unlit sphere)
      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.055, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xffe8a0 }),
      );
      bulb.position.set(0, RH - 0.29, z);
      _carriageGroup.add(bulb);
    });

    // Coat hooks on side walls (near ceiling)
    [[-RW + 0.05, -1.5], [-RW + 0.05, 0.5],
     [RW - 0.05, -1.5],  [RW - 0.05, 0.5]].forEach(([hx, hz]) => {
      const hook = new THREE.Mesh(
        new THREE.TorusGeometry(0.04, 0.008, 6, 10, Math.PI * 1.5),
        bm,
      );
      hook.rotation.y = hx < 0 ? -Math.PI / 2 : Math.PI / 2;
      hook.position.set(hx, RH - 0.55, hz);
      _carriageGroup.add(hook);
    });
  }

  // ─────────────────────────────────────────────────────────────────
  //  ANIMATION LOOP
  // ─────────────────────────────────────────────────────────────────
  function _loop(now) {
    _raf = requestAnimationFrame(_loop);
    if (!_cam || !_R || !_scene || !_running) return;

    const dt = Math.min(now - _lastNow, 50);
    _lastNow = now;
    _swayT  += dt * 0.001;

    _checkResize();

    // ── Carriage sway (gentle rocking) ────────────────────────────
    if (_carriageGroup) {
      // Side-to-side tilt
      _carriageGroup.rotation.z = Math.sin(_swayT * 1.15) * 0.007
                                 + Math.sin(_swayT * 2.80) * 0.002;
      // Vertical bounce
      _carriageGroup.position.y = Math.sin(_swayT * 2.25) * 0.018
                                 + Math.sin(_swayT * 5.40) * 0.004;
      // Subtle longitudinal pitch
      _carriageGroup.rotation.x = Math.sin(_swayT * 0.85) * 0.0015;
    }

    // ── Camera movement — disabled when orbit controls are active ────
    if (!_orbit || !_orbit.enabled) {
      _cam.position.x = Math.sin(_swayT * 1.1)  * 0.04;
      _cam.position.y = 1.15 + Math.sin(_swayT * 2.2)  * 0.018
                             + Math.sin(_swayT * 5.5)  * 0.004;
      const lookY = 1.02 + Math.sin(_swayT * 0.7) * 0.008;
      _cam.lookAt(_cam.position.x * 0.08, lookY, WIN_Z);
    } else {
      _orbit.update();
    }

    // ── Refresh exterior texture & render ────────────────────────
    // bg-canvas was redrawn this frame by canvas_scenes._trainFrame();
    // mark the CanvasTexture dirty so Three.js re-uploads it to the GPU.
    if (_bgTex) _bgTex.needsUpdate = true;
    _R.render(_scene, _cam);
  }

  return { start, stop };
})();

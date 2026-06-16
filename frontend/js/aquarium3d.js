'use strict';
/* ═══════════════════════════════════════════════════════════════════════
   AQUARIUM3D  —  WebGL Samples–inspired Three.js underwater scene
   Serenity Radio  ·  2026

   Architecture
   ───────────
   • LatheGeometry fish bodies with per-species CanvasTexture skins
   • 7 species, ~90 fish total with boids + depth bands
   • Animated caustic floor (canvas texture, per-frame update)
   • Light shaft cones from water surface
   • Animated water surface (vertex displacement)
   • Seaweed: CatmullRomCurve3 Line meshes, per-frame vertex update
   • Bubbles: Points system (800 particles)
   • Coral structures: CylinderGeometry clusters
   • All geometry & materials disposed cleanly on stop()
   ═══════════════════════════════════════════════════════════════════════ */
const Aquarium3D = (() => {

  const CDN = 'https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js';

  // ── tank half-extents
  const TW = 14, TH = 7, TD = 11;

  // ── state
  let _canvas2d = null;
  let _el = null;
  let _R = null, _scene = null, _cam = null;
  let _raf = null, _running = false;
  let _W = 0, _H = 0;

  // scene objects
  let _fish = [];
  let _seaweeds = [];
  let _bubbleGeo = null;
  let _waterSurface = null;
  let _causticCanvas = null, _causticCtx = null, _causticTex = null;
  let _disposables = [];   // all meshes/geos/mats to dispose on stop
  let _t = 0;              // elapsed seconds

  // ── fish species ────────────────────────────────────────────────────
  // Each species: count, size (half-length), scaleX (flatness), scaleY (height ratio),
  //               color, speed, separationDist, depthY (preferred centre Y)
  const SPECIES = [
    {
      id: 'clownfish', count: 20, size: 0.45, scaleX: 0.32, scaleY: 1.05,
      speed: 2.4, sep: 1.4, depthY: -1.0,
      tex: (ctx) => {
        ctx.fillStyle = '#e85e00'; ctx.fillRect(0, 0, 128, 128);
        // 3 white bands
        [[14, 18], [54, 14], [98, 12]].forEach(([cx, w]) => {
          ctx.fillStyle = '#fff';
          ctx.fillRect(cx - w/2, 0, w, 128);
          ctx.fillStyle = '#111';
          ctx.fillRect(cx - w/2 - 2, 0, 2, 128);
          ctx.fillRect(cx + w/2,     0, 2, 128);
        });
        // Edge vignette
        const g = ctx.createRadialGradient(64,64,18,64,64,70);
        g.addColorStop(0,'rgba(0,0,0,0)'); g.addColorStop(1,'rgba(0,0,0,0.45)');
        ctx.fillStyle = g; ctx.fillRect(0,0,128,128);
      },
    },
    {
      id: 'bluetang', count: 14, size: 0.55, scaleX: 0.20, scaleY: 1.50,
      speed: 2.8, sep: 1.6, depthY: 0.5,
      tex: (ctx) => {
        // Royal blue body
        const bg = ctx.createLinearGradient(0,0,128,0);
        bg.addColorStop(0, '#0033cc'); bg.addColorStop(0.7, '#1a66ff');
        bg.addColorStop(1, '#ffcc00');  // yellow tail
        ctx.fillStyle = bg; ctx.fillRect(0,0,128,128);
        // black lateral stripe
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(0, 54, 128, 20);
        // edge vignette
        const g = ctx.createRadialGradient(64,64,20,64,64,68);
        g.addColorStop(0,'rgba(0,0,0,0)'); g.addColorStop(1,'rgba(0,0,50,0.5)');
        ctx.fillStyle = g; ctx.fillRect(0,0,128,128);
      },
    },
    {
      id: 'angelfish', count: 8, size: 0.60, scaleX: 0.16, scaleY: 2.20,
      speed: 1.8, sep: 2.0, depthY: 1.5,
      tex: (ctx) => {
        // Gold/silver base
        const bg = ctx.createLinearGradient(0,0,128,0);
        bg.addColorStop(0,'#c8a000'); bg.addColorStop(0.5,'#f0e060'); bg.addColorStop(1,'#c8a000');
        ctx.fillStyle = bg; ctx.fillRect(0,0,128,128);
        // black vertical stripes
        [22, 64, 106].forEach(cx => {
          ctx.fillStyle = '#111';
          ctx.fillRect(cx-7, 0, 14, 128);
        });
        const g = ctx.createRadialGradient(64,64,15,64,64,68);
        g.addColorStop(0,'rgba(0,0,0,0)'); g.addColorStop(1,'rgba(0,0,0,0.35)');
        ctx.fillStyle = g; ctx.fillRect(0,0,128,128);
      },
    },
    {
      id: 'shark', count: 2, size: 1.80, scaleX: 0.70, scaleY: 0.72,
      speed: 3.5, sep: 6.0, depthY: -0.5,
      tex: (ctx) => {
        // Grey gradient (dark back, light belly)
        const bg = ctx.createLinearGradient(0,0,0,128);
        bg.addColorStop(0,'#5a6a70'); bg.addColorStop(0.5,'#8a9aa0');
        bg.addColorStop(1,'#d0dde0');
        ctx.fillStyle = bg; ctx.fillRect(0,0,128,128);
        // subtle striation
        for (let y=0;y<128;y+=16){
          ctx.fillStyle='rgba(0,0,0,0.04)'; ctx.fillRect(0,y,128,8);
        }
      },
    },
    {
      id: 'yellowtail', count: 18, size: 0.50, scaleX: 0.28, scaleY: 0.90,
      speed: 3.0, sep: 1.5, depthY: 0.0,
      tex: (ctx) => {
        const bg = ctx.createLinearGradient(0,0,128,0);
        bg.addColorStop(0,'#e0e8f0'); bg.addColorStop(0.6,'#c8d8e8');
        bg.addColorStop(1,'#ffdd00');
        ctx.fillStyle = bg; ctx.fillRect(0,0,128,128);
        // silver sheen
        const g = ctx.createLinearGradient(0,0,0,128);
        g.addColorStop(0,'rgba(255,255,255,0.3)'); g.addColorStop(0.5,'rgba(255,255,255,0)');
        ctx.fillStyle = g; ctx.fillRect(0,0,128,128);
      },
    },
    {
      id: 'chromis', count: 22, size: 0.28, scaleX: 0.30, scaleY: 1.10,
      speed: 3.6, sep: 1.0, depthY: 2.0,
      tex: (ctx) => {
        const bg = ctx.createLinearGradient(0,0,128,128);
        bg.addColorStop(0,'#00bbaa'); bg.addColorStop(0.5,'#00ddcc');
        bg.addColorStop(1,'#00aaff');
        ctx.fillStyle = bg; ctx.fillRect(0,0,128,128);
        // iridescent highlight
        const g = ctx.createRadialGradient(55,45,5,55,45,50);
        g.addColorStop(0,'rgba(255,255,255,0.45)'); g.addColorStop(1,'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.fillRect(0,0,128,128);
      },
    },
    {
      id: 'moorish', count: 6, size: 0.65, scaleX: 0.14, scaleY: 2.80,
      speed: 1.6, sep: 2.2, depthY: 1.0,
      tex: (ctx) => {
        // White/black/yellow dramatic pattern
        ctx.fillStyle = '#f5f5f0'; ctx.fillRect(0,0,128,128);
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, 40, 128);
        ctx.fillRect(88, 0, 40, 128);
        ctx.fillStyle = '#f5c200';
        ctx.fillRect(60, 0, 28, 128);
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, 128, 20);  // top band
        const g = ctx.createRadialGradient(64,64,20,64,64,68);
        g.addColorStop(0,'rgba(0,0,0,0)'); g.addColorStop(1,'rgba(0,0,0,0.3)');
        ctx.fillStyle = g; ctx.fillRect(0,0,128,128);
      },
    },
  ];

  // ────────────────────────────────────────────────────────────────────
  // Texture factory
  // ────────────────────────────────────────────────────────────────────
  function _makeTex(drawFn) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    drawFn(c.getContext('2d'));
    const t = new THREE.CanvasTexture(c);
    _disposables.push(t);
    return t;
  }

  // ────────────────────────────────────────────────────────────────────
  // Fish geometry per species
  // LatheGeometry profile is revolved around Y axis.
  // After rotateX(PI/2) the spine runs along +Z (fish "looks" along +Z).
  // scaleX flattens side-to-side; scaleY sets body height relative to length.
  // ────────────────────────────────────────────────────────────────────
  function _fishGeo(size, scaleY) {
    const s = size;
    // Profile: Vector2(radius, y_along_spine)  nose→tail
    const pts = [
      new THREE.Vector2(0.01, -s * 0.50),
      new THREE.Vector2(s * 0.10, -s * 0.38),
      new THREE.Vector2(s * 0.16 * scaleY, -s * 0.20),
      new THREE.Vector2(s * 0.22 * scaleY,  s * 0.08),
      new THREE.Vector2(s * 0.20 * scaleY,  s * 0.28),
      new THREE.Vector2(s * 0.14 * scaleY,  s * 0.42),
      new THREE.Vector2(s * 0.06,  s * 0.48),
      new THREE.Vector2(0.01,  s * 0.50),
    ];
    const geo = new THREE.LatheGeometry(pts, 10);
    geo.rotateX(Math.PI / 2);  // spine → Z axis
    return geo;
  }

  // Forked tail fin geometry
  function _tailGeo(size) {
    const s = size;
    const verts = new Float32Array([
      // upper lobe
       0.02 * s,  0.04 * s, 0,
       0.02 * s, -0.04 * s, 0,
      -0.30 * s,  0.22 * s, 0,
      // upper lobe 2
       0.02 * s, -0.04 * s, 0,
      -0.30 * s,  0.08 * s, 0,
      -0.30 * s,  0.22 * s, 0,
      // lower lobe
       0.02 * s,  0.04 * s, 0,
       0.02 * s, -0.04 * s, 0,
      -0.30 * s, -0.22 * s, 0,
      // lower lobe 2
       0.02 * s, -0.04 * s, 0,
      -0.30 * s, -0.08 * s, 0,
      -0.30 * s, -0.22 * s, 0,
    ]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    geo.computeVertexNormals();
    return geo;
  }

  // Dorsal/pectoral fin — planar quad in XY plane; caller rotates as needed
  function _dorsalGeo(size, heightMult) {
    const s = size; const hm = heightMult || 1.0;
    const geo = new THREE.BufferGeometry();
    const v = new Float32Array([
       s * 0.30,  0,           0,
       s * 0.30,  s*0.22*hm,  0,
      -s * 0.10,  0,           0,
      -s * 0.10,  s*0.10*hm,  0,
    ]);
    const idx = new Uint16Array([0,2,1, 2,3,1]);
    geo.setAttribute('position', new THREE.BufferAttribute(v, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeVertexNormals();
    return geo;
  }

  // ────────────────────────────────────────────────────────────────────
  // Build a fish group for one individual
  // ────────────────────────────────────────────────────────────────────
  function _buildFish(spec, tex) {
    const g = new THREE.Group();
    const s = spec.size;

    // Body
    const bodyGeo = _fishGeo(s, spec.scaleY);
    const bodyMat = new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.55,
      metalness: 0.05,
      side: THREE.DoubleSide,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.scale.set(spec.scaleX, 1, 1);
    g.add(body);
    _disposables.push(bodyGeo, bodyMat);

    // Tail fin
    const tg = _tailGeo(s);
    const tailMat = new THREE.MeshStandardMaterial({
      map: tex, roughness: 0.7, transparent: true, opacity: 0.85,
      side: THREE.DoubleSide,
    });
    const tail = new THREE.Mesh(tg, tailMat);
    tail.position.z = -s * 0.46;
    g.add(tail);
    _disposables.push(tg, tailMat);

    // Dorsal fin — rotate PI/2 around Y so it lies in the YZ plane (along fish spine)
    const dg = _dorsalGeo(s * 0.8, spec.scaleY * 0.6);
    const dorsalMat = new THREE.MeshStandardMaterial({
      map: tex, roughness: 0.7, transparent: true, opacity: 0.80,
      side: THREE.DoubleSide,
    });
    const dorsal = new THREE.Mesh(dg, dorsalMat);
    dorsal.rotation.y = Math.PI / 2;
    dorsal.position.set(0, s * spec.scaleY * 0.20, s * 0.10);
    g.add(dorsal);
    _disposables.push(dg, dorsalMat);

    // Pectoral fin
    const pg = _dorsalGeo(s * 0.55, 0.5);
    const pMat = new THREE.MeshStandardMaterial({
      map: tex, roughness: 0.7, transparent: true, opacity: 0.75,
      side: THREE.DoubleSide,
    });
    const pec = new THREE.Mesh(pg, pMat);
    pec.rotation.z = -Math.PI * 0.45;
    pec.rotation.y = Math.PI * 0.5;
    pec.position.set(s * spec.scaleX * 0.9, -s * 0.04, s * 0.05);
    g.add(pec);
    _disposables.push(pg, pMat);

    // Eye
    const eyeGeo = new THREE.SphereGeometry(s * 0.058, 6, 6);
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.1, metalness: 0.8 });
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(s * spec.scaleX * 0.78, s * spec.scaleY * 0.06, s * 0.38);
    g.add(eye);
    _disposables.push(eyeGeo, eyeMat);

    // Store references for animation
    g.userData = {
      tail,
      vel: new THREE.Vector3(
        (Math.random() - 0.5) * spec.speed,
        (Math.random() - 0.5) * 0.3,
        (Math.random() - 0.5) * spec.speed,
      ),
      speed: spec.speed,
      sep: spec.sep,
      specIdx: SPECIES.indexOf(spec),
      tailPhase: Math.random() * Math.PI * 2,
    };

    return g;
  }

  // ────────────────────────────────────────────────────────────────────
  // Caustic floor
  // ────────────────────────────────────────────────────────────────────
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
    // Sand base
    ctx.fillStyle = '#c0a064';
    ctx.fillRect(0, 0, W, H);
    // Sandy texture
    ctx.fillStyle = 'rgba(180,145,80,0.3)';
    for (let i = 0; i < 40; i++) {
      const px = ((i * 37) % W), py = ((i * 61) % H);
      ctx.fillRect(px, py, 3, 2);
    }
    // Caustic blobs — shift with time
    for (let i = 0; i < 30; i++) {
      const a1 = t * 0.4 + i * 2.513;
      const a2 = t * 0.27 + i * 1.718;
      const cx = ((Math.sin(a1) * 0.42 + 0.5 + (i % 6) / 6.0) % 1.0) * W;
      const cy = ((Math.cos(a2) * 0.42 + 0.5 + Math.floor(i / 6) / 5.0) % 1.0) * H;
      const r = 7 + Math.sin(t * 0.8 + i * 0.9) * 4;
      const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      gr.addColorStop(0,   'rgba(255,245,190,0.80)');
      gr.addColorStop(0.5, 'rgba(255,230,140,0.40)');
      gr.addColorStop(1,   'rgba(0,0,0,0)');
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    _causticTex.needsUpdate = true;
  }

  // ────────────────────────────────────────────────────────────────────
  // Scene construction
  // ────────────────────────────────────────────────────────────────────
  function _buildScene() {
    // ── Underwater fog & background
    _scene.background = new THREE.Color(0x003550);
    _scene.fog = new THREE.Fog(0x003550, 18, 42);

    // ── Lighting
    _scene.add(new THREE.AmbientLight(0x004466, 0.7));

    const sun = new THREE.DirectionalLight(0x88ccff, 1.4);
    sun.position.set(2, 10, 4);
    _scene.add(sun);

    // Subtle fill lights for depth
    const fill1 = new THREE.PointLight(0x0066aa, 0.8, 20);
    fill1.position.set(-TW * 0.5, TH * 0.3, 0);
    _scene.add(fill1);
    const fill2 = new THREE.PointLight(0x004488, 0.6, 18);
    fill2.position.set(TW * 0.5, TH * 0.3, 0);
    _scene.add(fill2);

    // ── Caustic floor
    _initCaustics();
    _updateCaustics(0);
    const floorGeo = new THREE.PlaneGeometry(TW * 2, TD * 2);
    const floorMat = new THREE.MeshStandardMaterial({
      map: _causticTex,
      roughness: 0.95,
      metalness: 0.0,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -TH;
    _scene.add(floor);
    _disposables.push(floor, floorGeo, floorMat);

    // ── Back wall (blueish glass effect)
    const wallGeo = new THREE.PlaneGeometry(TW * 2, TH * 2.2);
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x002244,
      transparent: true,
      opacity: 0.45,
      roughness: 0.05,
      metalness: 0.3,
    });
    const wall = new THREE.Mesh(wallGeo, wallMat);
    wall.position.z = -TD;
    wall.position.y = -TH * 0.1;
    _scene.add(wall);
    _disposables.push(wall, wallGeo, wallMat);

    // ── Light shafts from surface
    const shaftMat = new THREE.MeshBasicMaterial({
      color: 0x80d8ff,
      transparent: true,
      opacity: 0.045,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    [-TW * 0.55, -TW * 0.18, TW * 0.18, TW * 0.55].forEach((x, i) => {
      const sg = new THREE.ConeGeometry(2.2, TH * 2.3, 6, 1, true);
      const shaft = new THREE.Mesh(sg, shaftMat);
      shaft.position.set(x, -TH * 0.15, (i % 2 === 0 ? -2 : 2));
      shaft.rotation.x = 0.08 + i * 0.02;
      _scene.add(shaft);
      _disposables.push(shaft, sg);
    });
    _disposables.push(shaftMat);

    // ── Water surface
    const surfGeo = new THREE.PlaneGeometry(TW * 2, TD * 2, 24, 24);
    const surfMat = new THREE.MeshStandardMaterial({
      color: 0x1a7aaa,
      transparent: true,
      opacity: 0.28,
      roughness: 0.05,
      metalness: 0.25,
      side: THREE.DoubleSide,
    });
    _waterSurface = new THREE.Mesh(surfGeo, surfMat);
    _waterSurface.rotation.x = -Math.PI / 2;
    _waterSurface.position.y = TH * 0.88;
    _scene.add(_waterSurface);
    _disposables.push(_waterSurface, surfGeo, surfMat);

    // ── Coral clusters on floor
    _buildCoral();

    // ── Seaweed
    _buildSeaweed();

    // ── Bubbles
    _buildBubbles();

    // ── Fish
    SPECIES.forEach(spec => {
      const tex = _makeTex(spec.tex);
      for (let i = 0; i < spec.count; i++) {
        const fish = _buildFish(spec, tex);
        fish.position.set(
          (Math.random() - 0.5) * TW * 1.6,
          spec.depthY + (Math.random() - 0.5) * 3.5,
          (Math.random() - 0.5) * TD * 1.6,
        );
        fish.rotation.y = Math.random() * Math.PI * 2;
        _scene.add(fish);
        _fish.push(fish);
        _disposables.push(fish);
      }
    });
  }

  // ────────────────────────────────────────────────────────────────────
  // Coral
  // ────────────────────────────────────────────────────────────────────
  function _buildCoral() {
    const coralColors = [0xdd4444, 0xee8800, 0xddaa00, 0xcc44aa, 0xff6655, 0x44cc88];
    const floorY = -TH + 0.05;
    for (let i = 0; i < 22; i++) {
      const x = (Math.random() - 0.5) * TW * 1.7;
      const z = (Math.random() - 0.5) * TD * 1.7;
      const h = 0.5 + Math.random() * 1.8;
      const r = 0.08 + Math.random() * 0.18;
      const col = coralColors[i % coralColors.length];
      const cg = new THREE.CylinderGeometry(r * 0.4, r, h, 5);
      const cm = new THREE.MeshStandardMaterial({
        color: col, roughness: 0.85, metalness: 0.0,
      });
      const c = new THREE.Mesh(cg, cm);
      c.position.set(x, floorY + h / 2, z);
      c.rotation.z = (Math.random() - 0.5) * 0.4;
      _scene.add(c);
      _disposables.push(c, cg, cm);
      // branches
      const nb = Math.floor(Math.random() * 3) + 1;
      for (let b = 0; b < nb; b++) {
        const bh = h * (0.4 + Math.random() * 0.5);
        const bg2 = new THREE.CylinderGeometry(r * 0.25, r * 0.4, bh, 4);
        const bm = new THREE.MeshStandardMaterial({color: col, roughness: 0.85});
        const branch = new THREE.Mesh(bg2, bm);
        branch.position.set(
          x + (Math.random()-0.5)*0.5,
          floorY + h * 0.6 + bh / 2,
          z + (Math.random()-0.5)*0.5,
        );
        branch.rotation.z = (Math.random()-0.5)*0.8;
        branch.rotation.x = (Math.random()-0.5)*0.5;
        _scene.add(branch);
        _disposables.push(branch, bg2, bm);
      }
    }
    // Rocks
    for (let i = 0; i < 14; i++) {
      const x = (Math.random()-0.5)*TW*1.8, z = (Math.random()-0.5)*TD*1.8;
      const r = 0.25 + Math.random() * 0.55;
      const rg = new THREE.SphereGeometry(r, 5, 4);
      // flatten rocks
      rg.scale(1, 0.55 + Math.random()*0.3, 1 + (Math.random()-0.5)*0.4);
      const rm = new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(0.07, 0.15, 0.3 + Math.random()*0.2),
        roughness: 0.95,
      });
      const rock = new THREE.Mesh(rg, rm);
      rock.position.set(x, floorY + r * 0.4, z);
      rock.rotation.y = Math.random() * Math.PI;
      _scene.add(rock);
      _disposables.push(rock, rg, rm);
    }
  }

  // ────────────────────────────────────────────────────────────────────
  // Seaweed
  // ────────────────────────────────────────────────────────────────────
  function _buildSeaweed() {
    const floorY = -TH;
    const swMat = new THREE.LineBasicMaterial({ color: 0x00aa44, linewidth: 2 });
    _disposables.push(swMat);
    for (let i = 0; i < 28; i++) {
      const baseX = (Math.random()-0.5)*TW*1.6;
      const baseZ = (Math.random()-0.5)*TD*1.6;
      const height = 1.2 + Math.random() * 2.8;
      const segs = 6;
      const pts = [];
      for (let s = 0; s <= segs; s++) {
        pts.push(new THREE.Vector3(
          baseX + Math.sin(s) * 0.2,
          floorY + (s / segs) * height,
          baseZ + Math.cos(s * 1.3) * 0.2,
        ));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      const geo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(20));
      const line = new THREE.Line(geo, swMat);
      _scene.add(line);
      _seaweeds.push({ line, geo, baseX, baseZ, floorY, height, segs, phase: Math.random()*Math.PI*2 });
      _disposables.push(line, geo);
    }
  }

  function _updateSeaweed(t) {
    _seaweeds.forEach(sw => {
      const pts = [];
      for (let s = 0; s <= sw.segs; s++) {
        const frac = s / sw.segs;
        const sway = Math.sin(t * 1.4 + sw.phase + frac * 2.5) * 0.25 * frac;
        const sway2 = Math.cos(t * 0.9 + sw.phase * 1.3 + frac * 1.8) * 0.15 * frac;
        pts.push(new THREE.Vector3(
          sw.baseX + sway,
          sw.floorY + frac * sw.height,
          sw.baseZ + sway2,
        ));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      const newPts = curve.getPoints(20);
      const pos = sw.geo.attributes.position;
      newPts.forEach((p, i) => { pos.setXYZ(i, p.x, p.y, p.z); });
      pos.needsUpdate = true;
    });
  }

  // ────────────────────────────────────────────────────────────────────
  // Bubbles
  // ────────────────────────────────────────────────────────────────────
  function _buildBubbles() {
    const N = 800;
    _bubbleGeo = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      pos[i*3]   = (Math.random()-0.5)*TW*1.8;
      pos[i*3+1] = -TH + Math.random()*TH*2;
      pos[i*3+2] = (Math.random()-0.5)*TD*1.8;
    }
    _bubbleGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xaaddff, size: 0.08, transparent: true, opacity: 0.5,
      sizeAttenuation: true,
    });
    const pts = new THREE.Points(_bubbleGeo, mat);
    _scene.add(pts);
    _disposables.push(pts, _bubbleGeo, mat);
  }

  function _updateBubbles() {
    const pos = _bubbleGeo.attributes.position;
    const top = TH * 0.9;
    for (let i = 0; i < pos.count; i++) {
      let y = pos.getY(i) + 0.022 + Math.random() * 0.008;
      if (y > top) {
        y = -TH + Math.random() * 0.5;
        pos.setX(i, (Math.random()-0.5)*TW*1.8);
        pos.setZ(i, (Math.random()-0.5)*TD*1.8);
      }
      pos.setY(i, y);
    }
    pos.needsUpdate = true;
  }

  // ────────────────────────────────────────────────────────────────────
  // Water surface animation
  // ────────────────────────────────────────────────────────────────────
  function _updateWater(t) {
    const pos = _waterSurface.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      pos.setY(i,
        Math.sin(x * 0.45 + t * 0.9) * 0.28 +
        Math.cos(z * 0.38 + t * 0.7) * 0.18,
      );
    }
    pos.needsUpdate = true;
    _waterSurface.geometry.computeVertexNormals();
  }

  // ────────────────────────────────────────────────────────────────────
  // Boids update
  // ────────────────────────────────────────────────────────────────────
  // Lazily initialised inside _launch() after THREE is available
  let _v3a = null;
  let _v3b = null;

  function _updateFish(dt) {
    const dt2 = Math.min(dt, 0.05);

    SPECIES.forEach((spec, si) => {
      const group = _fish.filter(f => f.userData.specIdx === si);
      if (group.length === 0) return;

      const preferY = spec.depthY;

      group.forEach(f => {
        const u = f.userData;
        const vel = u.vel;
        const pos = f.position;

        // Accumulate steering forces
        let steerX = 0, steerY = 0, steerZ = 0;
        let count = 0;
        let sepX = 0, sepY = 0, sepZ = 0, sepC = 0;

        group.forEach(other => {
          if (other === f) return;
          _v3a.subVectors(other.position, pos);
          const dist = _v3a.length();
          if (dist < 0.001) return;

          if (dist < spec.sep * 2.5) {
            // Alignment + cohesion
            steerX += other.userData.vel.x;
            steerY += other.userData.vel.y;
            steerZ += other.userData.vel.z;
            count++;
          }
          if (dist < spec.sep) {
            // Separation
            sepX -= _v3a.x / dist;
            sepY -= _v3a.y / dist;
            sepZ -= _v3a.z / dist;
            sepC++;
          }
        });

        if (count > 0) {
          steerX /= count; steerY /= count; steerZ /= count;
          vel.x += (steerX - vel.x) * 0.015;
          vel.y += (steerY - vel.y) * 0.012;
          vel.z += (steerZ - vel.z) * 0.015;
        }

        if (sepC > 0) {
          vel.x += sepX / sepC * 0.08;
          vel.y += sepY / sepC * 0.08;
          vel.z += sepZ / sepC * 0.08;
        }

        // Depth-band attraction
        vel.y += (preferY - pos.y) * 0.005;

        // Wall avoidance (soft boundaries)
        const margin = 2.5;
        if (pos.x >  TW - margin) vel.x -= 0.25;
        if (pos.x < -TW + margin) vel.x += 0.25;
        if (pos.y >  TH - 1.0)   vel.y -= 0.25;
        if (pos.y < -TH + 1.0)   vel.y += 0.25;
        if (pos.z >  TD - margin) vel.z -= 0.25;
        if (pos.z < -TD + margin) vel.z += 0.25;

        // Clamp speed
        const spd = vel.length();
        if (spd > spec.speed) vel.multiplyScalar(spec.speed / spd);
        if (spd < spec.speed * 0.35) vel.multiplyScalar(spec.speed * 0.35 / Math.max(spd, 0.001));

        // Move
        pos.x += vel.x * dt2;
        pos.y += vel.y * dt2;
        pos.z += vel.z * dt2;

        // Orient fish toward velocity
        if (spd > 0.1) {
          _v3b.copy(vel).normalize();
          const targetAngle = Math.atan2(-_v3b.x, _v3b.z);
          const da = targetAngle - f.rotation.y;
          // Wrap angle
          const da2 = ((da + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
          f.rotation.y += da2 * Math.min(dt2 * 4.5, 0.18);

          // Pitch (tilt up/down)
          const pitch = Math.atan2(-vel.y, Math.sqrt(vel.x*vel.x + vel.z*vel.z));
          f.rotation.x += (pitch - f.rotation.x) * 0.08;
        }

        // Tail wag
        u.tailPhase += dt2 * (4.5 + spd * 0.8);
        const wag = Math.sin(u.tailPhase) * 0.45;
        if (u.tail) u.tail.rotation.y = wag;
      });
    });
  }

  // ────────────────────────────────────────────────────────────────────
  // Render loop
  // ────────────────────────────────────────────────────────────────────
  let _lastNow = 0;
  let _causticFrame = 0;

  function _loop(now) {
    _raf = requestAnimationFrame(_loop);
    if (!_cam || !_R || !_scene) return;

    const dt = Math.min((now - _lastNow) / 1000, 0.08);
    _lastNow = now;
    _t += dt;

    // Resize
    const pw = window.innerWidth, ph = window.innerHeight;
    if (pw !== _W || ph !== _H) {
      _W = pw; _H = ph;
      _R.setSize(_W, _H);
      _cam.aspect = _W / _H;
      _cam.updateProjectionMatrix();
    }

    // Update caustics every 2 frames for performance
    if (++_causticFrame % 2 === 0) _updateCaustics(_t);

    _updateWater(_t);
    _updateSeaweed(_t);
    _updateBubbles();
    _updateFish(dt);

    // Camera gentle sway
    _cam.position.x = Math.sin(_t * 0.12) * 1.8;
    _cam.position.y = Math.sin(_t * 0.09) * 0.8;
    _cam.lookAt(0, 0, 0);

    _R.render(_scene, _cam);
  }

  // ────────────────────────────────────────────────────────────────────
  // Public API
  // ────────────────────────────────────────────────────────────────────
  function start(canvas2dRef) {
    if (_running) return;
    _running = true;
    _canvas2d = canvas2dRef;
    if (_canvas2d) _canvas2d.style.display = 'none';

    function _launch() {
      _el = document.getElementById('aquarium3d-canvas');
      if (!_el) {
        _el = document.createElement('canvas');
        _el.id = 'aquarium3d-canvas';
        Object.assign(_el.style, {
          position: 'fixed', inset: '0',
          width: '100%', height: '100%',
          zIndex: '3', display: 'block',
        });
        document.body.appendChild(_el);
      }

      _W = window.innerWidth;
      _H = window.innerHeight;

      _R = new THREE.WebGLRenderer({ canvas: _el, antialias: true });
      _R.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      _R.setSize(_W, _H);
      _R.outputEncoding = THREE.sRGBEncoding;

      _scene = new THREE.Scene();
      _cam = new THREE.PerspectiveCamera(60, _W / _H, 0.1, 80);
      _cam.position.set(0, 1.5, 16);
      _cam.lookAt(0, 0, 0);

      _fish = [];
      _seaweeds = [];
      _disposables = [];

      // Initialise reusable Vector3 scratch objects (needs THREE loaded)
      _v3a = new THREE.Vector3();
      _v3b = new THREE.Vector3();

      _buildScene();

      _lastNow = performance.now();
      _t = 0;
      _causticFrame = 0;
      _raf = requestAnimationFrame(_loop);
    }

    if (typeof THREE === 'undefined') {
      const s = document.createElement('script');
      s.src = CDN;
      s.onload = _launch;
      document.head.appendChild(s);
    } else {
      _launch();
    }
  }

  function stop() {
    _running = false;
    cancelAnimationFrame(_raf);
    _raf = null;

    // Dispose all Three.js objects
    _disposables.forEach(obj => {
      if (obj && obj.dispose) obj.dispose();
    });
    _disposables = [];
    _fish = [];
    _seaweeds = [];
    _bubbleGeo = null;
    _waterSurface = null;
    _causticCanvas = null;
    _causticCtx = null;
    _causticTex = null;

    if (_R) { _R.dispose(); _R = null; }
    _scene = null;
    _cam = null;

    if (_el) { _el.remove(); _el = null; }
    if (_canvas2d) { _canvas2d.style.display = ''; _canvas2d = null; }
  }

  return { start, stop };
})();

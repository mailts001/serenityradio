/* ══════════════════════════════════════════════════════════════
   SERENITY RADIO — canvas_scenes.js
   One continuous living world, mood shifts by channel.

   All / Default : full natural day-night cycle with birds,
                   mist, water shimmer, stars — driven by real clock
   Sleep  : deepen to night palette, ocean waves, moon, fireflies
   Focus  : clean crisp morning light, sparse elements, faint grid
   Yoga   : golden-hour warmth, slow breath-pulse glow, petals
   Nature : amplify all organic elements — more birds, butterflies,
            rain mist, richer foliage shimmer
   ═════════════════════════════════════════════════════════════ */

const CanvasScenes = (() => {
  let _canvas, _ctx, _raf, _current = null;

  // Shared particle pools (re-used across mode changes)
  let _birds      = [];
  let _fireflies  = [];
  let _petals     = [];
  let _stars      = null;   // generated once

  function init(canvasEl) {
    _canvas = canvasEl;
    _ctx    = _canvas.getContext('2d');
    _resize();
    window.addEventListener('resize', _resize);
    _initPools();
  }

  function _resize() {
    if (!_canvas) return;
    _canvas.width  = window.innerWidth;
    _canvas.height = window.innerHeight;
    _stars = null;  // regenerate on next frame
  }

  function _initPools() {
    _birds     = Array.from({length: 9},  () => _newBird(true));
    _fireflies = Array.from({length: 22}, () => _newFirefly(true));
    _petals    = Array.from({length: 18}, () => _newPetal(true));
  }

  // ── Sky colour by real hour ─────────────────────────────────
  // Calibrated for equatorial (Singapore) — full daylight by 7 am.
  // Colours are atmospheric watercolour tones, not pitch-black.
  function _skyPalette(hr, mode) {
    // Calibrated for equatorial tropics (Singapore):
    //   night = deep navy, day = genuine medium-bright blue.
    //   Top of sky is deep blue at zenith; horizon is lighter & warmer.
    // Real photographic sky colours for equatorial tropics.
    // Zenith is deep cobalt; horizon is light hazy blue; sunset/dawn are warm.
    const raw = (() => {
      if (hr < 4.5)  return { top:'#020610', mid:'#040a1e', bot:'#060e28' }; // deep night
      if (hr < 5.5)  return { top:'#0a0520', mid:'#1c0a2e', bot:'#30143e' }; // pre-dawn indigo
      if (hr < 6.2)  return { top:'#180a18', mid:'#3e0e1e', bot:'#782a28' }; // first light rose
      if (hr < 7.0)  return { top:'#1a1020', mid:'#4a2818', bot:'#c06838' }; // sunrise amber
      if (hr < 8.0)  return { top:'#1050a0', mid:'#2878c8', bot:'#60a8e8' }; // early morning — vivid blue
      if (hr < 10)   return { top:'#1460b8', mid:'#2e80d8', bot:'#68b0f0' }; // bright morning — sky blue
      if (hr < 13)   return { top:'#1258b0', mid:'#2a78d0', bot:'#62aae8' }; // midday — clear tropical blue
      if (hr < 16)   return { top:'#1460b8', mid:'#2c7cd4', bot:'#64a8ec' }; // hot afternoon — same vivid blue
      if (hr < 17.5) return { top:'#1e2040', mid:'#3c3020', bot:'#906030' }; // late afternoon turning golden
      if (hr < 18.5) return { top:'#200a10', mid:'#4e1808', bot:'#a04820' }; // golden hour
      if (hr < 19.5) return { top:'#16080e', mid:'#2c0e18', bot:'#4e1e2c' }; // dusk
      if (hr < 21)   return { top:'#0c0616', mid:'#160820', bot:'#200c2a' }; // twilight
      return { top:'#020610', mid:'#040a1e', bot:'#060e28' };                 // night
    })();

    // Mode tints — subtle shifts
    if (mode === 'sleep') {
      return { top: _tint(raw.top, 0, 0, 15), mid: _tint(raw.mid, 0, 5, 20), bot: _tint(raw.bot, 0, 10, 30) };
    }
    if (mode === 'yoga') {
      return { top: _tint(raw.top, 12, 0, 0), mid: _tint(raw.mid, 20, 5, 0), bot: _tint(raw.bot, 30, 10, 0) };
    }
    if (mode === 'nature') {
      return { top: _tint(raw.top, 0, 8, 0), mid: _tint(raw.mid, 0, 10, 0), bot: _tint(raw.bot, 0, 12, 5) };
    }
    return raw;
  }

  // Add r,g,b offsets to a hex colour (clamp 0–255)
  function _tint(hex, r, g, b) {
    const n = parseInt(hex.slice(1), 16);
    const clamp = v => Math.max(0, Math.min(255, v));
    const nr = clamp(((n >> 16) & 255) + r);
    const ng = clamp(((n >>  8) & 255) + g);
    const nb = clamp(( n        & 255) + b);
    return `#${nr.toString(16).padStart(2,'0')}${ng.toString(16).padStart(2,'0')}${nb.toString(16).padStart(2,'0')}`;
  }

  // ── Sky ────────────────────────────────────────────────────
  function _drawSky(hr, mode) {
    const w = _canvas.width, h = _canvas.height;
    const p = _skyPalette(hr, mode);
    // Sky gradient fills entire canvas — water is drawn ON TOP, not adjacent
    const g = _ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0,    p.top);
    g.addColorStop(0.42, p.mid);
    g.addColorStop(0.75, p.bot);
    g.addColorStop(1,    p.bot);   // hold horizon colour to very bottom
    _ctx.fillStyle = g;
    _ctx.fillRect(0, 0, w, h);

    // Horizon glow — dawn, full day atmospheric haze, dusk
    if (hr >= 5.5 && hr < 8) {
      // Sunrise warm band
      const t = (hr - 5.5) / 2.5;
      const i = Math.sin(t * Math.PI) * 0.32;
      const hg = _ctx.createLinearGradient(0, h * 0.42, 0, h * 0.72);
      hg.addColorStop(0,   `rgba(240,120,50,${i})`);
      hg.addColorStop(0.5, `rgba(220,90,30,${i * 0.5})`);
      hg.addColorStop(1,   'rgba(0,0,0,0)');
      _ctx.fillStyle = hg;
      _ctx.fillRect(0, h * 0.42, w, h * 0.3);
    } else if (hr >= 8 && hr < 17) {
      // Bright tropical day — strong light haze band at horizon
      const peak = 0.22 + 0.10 * Math.sin(((hr - 8) / 9) * Math.PI);
      const hg = _ctx.createLinearGradient(0, h * 0.48, 0, h * 0.80);
      hg.addColorStop(0,   `rgba(220,240,255,${peak})`);
      hg.addColorStop(0.4, `rgba(200,225,255,${peak * 0.55})`);
      hg.addColorStop(1,   'rgba(180,210,245,0)');
      _ctx.fillStyle = hg;
      _ctx.fillRect(0, h * 0.48, w, h * 0.32);
      // Extra sun-scattering brightness just above waterline
      const sg = _ctx.createLinearGradient(0, h * 0.70, 0, h * 0.85);
      sg.addColorStop(0, `rgba(255,248,230,${peak * 0.35})`);
      sg.addColorStop(1, 'rgba(255,240,200,0)');
      _ctx.fillStyle = sg;
      _ctx.fillRect(0, h * 0.70, w, h * 0.15);
    } else if (hr >= 17 && hr <= 20) {
      // Sunset warm band
      const i = Math.sin(((hr - 17) / 3) * Math.PI) * 0.38;
      const hg = _ctx.createLinearGradient(0, h * 0.40, 0, h * 0.72);
      hg.addColorStop(0,   `rgba(240,100,30,${i})`);
      hg.addColorStop(0.5, `rgba(200,60,20,${i * 0.5})`);
      hg.addColorStop(1,   'rgba(0,0,0,0)');
      _ctx.fillStyle = hg;
      _ctx.fillRect(0, h * 0.40, w, h * 0.32);
    }
  }

  // ── Sun arc ────────────────────────────────────────────────
  // Sun travels a semicircle: rises right-horizon at ~6am, peaks at noon, sets left at ~18:30
  function _drawSun(hr) {
    const w = _canvas.width, h = _canvas.height;

    // Sun visible 5.5 – 19 h; fade at edges
    if (hr < 5.5 || hr > 19.2) return;
    const fade = hr < 6.5  ? (hr - 5.5)        // fade in over 1 h at dawn
               : hr > 18.2 ? (19.2 - hr)        // fade out over 1 h at dusk
               : 1.0;
    const alpha = Math.max(0, Math.min(1, fade));

    // Map hour → angle along a semicircle (0 = right horizon, π = left horizon)
    // 6.0 h → angle 0 (east), 12.75 h → angle π/2 (zenith), 19.5 h → angle π (west)
    const dayStart = 6.0, dayEnd = 19.5;
    const progress = Math.max(0, Math.min(1, (hr - dayStart) / (dayEnd - dayStart)));
    const angle    = progress * Math.PI;  // 0 → π

    // Arc: centre below bottom of screen so it curves naturally
    const arcCx = w * 0.5;
    const arcCy = h * 0.94;                 // arc centre near bottom
    const arcR  = h * 0.88;

    const sx = arcCx - Math.cos(angle) * arcR * 0.92;  // flip: cos(0)=1 → right
    const sy = arcCy - Math.sin(angle) * arcR;

    // Only draw if above visible area
    if (sy > h * 0.96) return;

    // Sun size — smaller near horizon (atmospheric), bigger at altitude
    const altitude = Math.sin(angle);  // 0 at horizon, 1 at zenith
    const radius   = 10 + altitude * 8;

    // Colour: white-yellow at altitude, warm orange near horizon
    const sunR = Math.round(255);
    const sunG = Math.round(200 + altitude * 50);
    const sunB = Math.round(80  + altitude * 120);
    const col  = `rgba(${sunR},${sunG},${sunB},${alpha})`;

    // Outer atmospheric halo
    const haloR = radius * (altitude < 0.15 ? 5 : 3.5);
    const halo  = _ctx.createRadialGradient(sx, sy, 0, sx, sy, haloR);
    const haloAlpha = alpha * (altitude < 0.15 ? 0.22 : 0.14);
    halo.addColorStop(0,   `rgba(${sunR},${sunG},${sunB},${haloAlpha})`);
    halo.addColorStop(0.4, `rgba(${sunR},${Math.round(sunG*0.8)},${Math.round(sunB*0.5)},${haloAlpha * 0.4})`);
    halo.addColorStop(1,   `rgba(255,160,60,0)`);
    _ctx.fillStyle = halo;
    _ctx.fillRect(sx - haloR, sy - haloR, haloR * 2, haloR * 2);

    // Sun disc
    _ctx.beginPath();
    _ctx.arc(sx, sy, radius, 0, Math.PI * 2);
    _ctx.fillStyle = col;
    _ctx.fill();

    // Thin horizon reflection column on water (when near horizon)
    if (altitude < 0.25 && sy < h * 0.88) {
      const waterY = h * 0.82;
      const rg = _ctx.createLinearGradient(sx, waterY, sx, h);
      rg.addColorStop(0, `rgba(${sunR},${sunG},${sunB},${alpha * 0.12})`);
      rg.addColorStop(1, 'rgba(255,180,60,0)');
      _ctx.fillStyle = rg;
      _ctx.fillRect(sx - radius * 1.5, waterY, radius * 3, h - waterY);
    }
  }

  // ── Stars + Moon ───────────────────────────────────────────
  function _drawStarsAndMoon(t, hr, mode) {
    const w = _canvas.width, h = _canvas.height;

    // Stars visible at night or sleep mode
    const nightness = hr < 5.5 ? 1
      : hr < 7 ? 1 - (hr - 5.5) / 1.5
      : hr >= 20 ? (hr - 20) / 1.5
      : 0;
    const starAlpha = Math.min(1, nightness + (mode === 'sleep' ? 0.4 : 0));

    if (starAlpha > 0.02) {
      if (!_stars) {
        _stars = Array.from({length: 160}, () => ({
          x: Math.random(), y: Math.random() * 0.6,
          r: 0.4 + Math.random() * 1.1,
          phase: Math.random() * Math.PI * 2,
          speed: 0.008 + Math.random() * 0.012,
        }));
      }
      _stars.forEach(s => {
        const a = starAlpha * (0.45 + 0.45 * Math.sin(t * s.speed + s.phase));
        _ctx.beginPath();
        _ctx.arc(s.x * w, s.y * h, s.r, 0, Math.PI * 2);
        _ctx.fillStyle = `rgba(220,225,255,${a})`;
        _ctx.fill();
      });
    }

    // Moon arc — rises right ~20h, peaks ~1am, sets left ~6am
    const showMoon = mode === 'sleep' || nightness > 0.25;
    if (showMoon) {
      const moonAlpha = Math.min(0.92, (mode === 'sleep' ? 0.35 : 0) + nightness * 0.82);
      if (moonAlpha > 0.04) {
        // Map night hours → arc progress
        // 20h → 0, 1h (=25h) → 0.5, 6h → 1
        const nightHr = hr < 8 ? hr + 24 : hr;  // 20..30 range
        const progress = Math.max(0, Math.min(1, (nightHr - 20) / 10));
        const angle    = progress * Math.PI;

        const arcCx = w * 0.5, arcCy = h * 0.94, arcR = h * 0.82;
        const mx = arcCx - Math.cos(angle) * arcR * 0.80;
        const my = arcCy - Math.sin(angle) * arcR;
        if (my > h * 0.95) return;

        const mr = Math.min(w, h) * 0.048;
        // Glow
        const mg = _ctx.createRadialGradient(mx, my, 0, mx, my, mr * 4);
        mg.addColorStop(0, `rgba(200,215,255,${moonAlpha * 0.18})`);
        mg.addColorStop(1, 'rgba(200,215,255,0)');
        _ctx.fillStyle = mg; _ctx.fillRect(0, 0, w, h);
        // Disc
        _ctx.beginPath(); _ctx.arc(mx, my, mr, 0, Math.PI * 2);
        _ctx.fillStyle = `rgba(228,235,255,${moonAlpha})`;
        _ctx.fill();
        // Crescent shadow bite
        _ctx.beginPath(); _ctx.arc(mx + mr * 0.3, my - mr * 0.06, mr * 0.86, 0, Math.PI * 2);
        _ctx.fillStyle = _skyPalette(hr, mode).top;
        _ctx.fill();
        // Moon reflection on water at low altitude
        const altitude = Math.sin(angle);
        if (altitude < 0.3 && my < h * 0.85) {
          const waterY = h * 0.84;
          const rg = _ctx.createLinearGradient(mx, waterY, mx, h);
          rg.addColorStop(0, `rgba(200,215,255,${moonAlpha * 0.10})`);
          rg.addColorStop(1, 'rgba(200,215,255,0)');
          _ctx.fillStyle = rg;
          _ctx.fillRect(mx - mr * 1.2, waterY, mr * 2.4, h - waterY);
        }
      }
    }
  }

  // ── Mist / atmosphere ──────────────────────────────────────
  function _drawMist(t, hr, mode) {
    const w = _canvas.width, h = _canvas.height;
    const layers = mode === 'nature' ? 5 : mode === 'sleep' ? 4 : 3;
    const baseDensity = mode === 'nature' ? 0.055 : mode === 'sleep' ? 0.05 : 0.032;

    // Each mist layer is a sinuous blob path — not a rectangle
    for (let i = 0; i < layers; i++) {
      const cy    = h * (0.52 + i * 0.10);
      const drift = Math.sin(t * 0.003 + i * 1.8) * w * 0.015;
      const alpha = baseDensity * (0.6 + 0.4 * Math.sin(t * 0.004 + i * 2.1));
      const spread = h * (0.055 + i * 0.01);

      _ctx.save();
      _ctx.translate(drift, 0);
      // Build a wavy top and bottom edge for the mist ribbon
      _ctx.beginPath();
      const step = 18;
      // Top edge — gentle undulation
      _ctx.moveTo(-w * 0.05, cy - spread + Math.sin(0 * 0.012 + t * 0.004 + i) * 8);
      for (let x = step; x <= w * 1.1; x += step) {
        const yt = cy - spread + Math.sin(x * 0.009 + t * 0.004 + i * 1.3) * 10;
        _ctx.lineTo(x, yt);
      }
      // Bottom edge — different undulation, close path
      for (let x = w * 1.1; x >= -w * 0.05; x -= step) {
        const yb = cy + spread + Math.sin(x * 0.011 + t * 0.003 + i * 0.9) * 8;
        _ctx.lineTo(x, yb);
      }
      _ctx.closePath();

      // Radial-ish gradient across the blob height
      const mg = _ctx.createLinearGradient(0, cy - spread, 0, cy + spread);
      mg.addColorStop(0,    'rgba(190,215,200,0)');
      mg.addColorStop(0.35, `rgba(190,215,200,${alpha})`);
      mg.addColorStop(0.65, `rgba(190,215,200,${alpha * 0.7})`);
      mg.addColorStop(1,    'rgba(190,215,200,0)');
      _ctx.fillStyle = mg;
      _ctx.fill();
      _ctx.restore();
    }
  }

  // ── Ocean with perspective — solid base + crest strokes ──────
  // Approach: fill entire water area with one gradient, then draw
  // 50 wave crest LINES (strokes only) from horizon to foreground.
  // No fills between waves = no banding, continuous coverage.
  function _drawWater(t, hr, mode) {
    const w  = _canvas.width, h = _canvas.height;
    const hy = h * (mode === 'sleep' ? 0.68 : 0.75);
    const wH = h - hy;
    const mA = mode === 'sleep' ? 1.6 : 1.0;

    const isDawn = hr >= 5.5 && hr < 8;
    const isDusk = hr >= 17  && hr < 20;
    const isDay  = hr >= 8   && hr < 17;
    const sR = isDawn||isDusk ? 190 : isDay ? 70  : 22;
    const sG = isDawn||isDusk ? 130 : isDay ? 160 : 52;
    const sB = isDawn||isDusk ?  70 : isDay ? 225 : 130;

    // ── 1. One solid gradient fills the whole water region ───
    const wg = _ctx.createLinearGradient(0, hy, 0, h);
    wg.addColorStop(0,    `rgba(${sR},${sG},${sB},0.42)`); // sky mirror
    wg.addColorStop(0.06, 'rgba(14,42,95,0.75)');
    wg.addColorStop(0.28, 'rgba(7,22,62,0.90)');
    wg.addColorStop(1,    'rgba(2,7,24,0.97)');
    _ctx.fillStyle = wg;
    _ctx.fillRect(0, hy, w, wH);

    // ── 2. 50 crest STROKES — perspective-scaled, full coverage ─
    // Every strip is drawn as a stroke from x=0 to x=w.
    // p^1.6 spacing: many thin lines near horizon, fewer thick near viewer.
    const N = 50;
    for (let i = 0; i < N; i++) {
      const p   = (i / N) ** 1.6;         // perspective fraction 0→1
      const y   = hy + wH * p;            // Y position of this crest

      // Amplitude: almost zero at horizon, grows smoothly to foreground
      const amp  = p * p * 24 * mA;

      // Frequency: compressed at horizon, longer swells near viewer
      const freq = 0.014 * (1 - p * 0.87) + 0.0008;

      // Speed: faster toward viewer (perspective gives this illusion)
      const spd  = 0.005 + p * 0.022;

      // Two harmonics — prevents rigid single-period look
      const ph1  = i * 0.58 + t * spd;
      const ph2  = i * 1.05 + t * spd * 0.62 + 2.0;

      function wy(x) {
        return y + amp * (
          Math.sin(x * freq        + ph1) * 0.64 +
          Math.sin(x * freq * 1.75 + ph2) * 0.36
        );
      }

      // Crest brightness and thickness grow toward viewer
      const alpha = 0.025 + p * 0.28;
      const lw    = 0.4   + p * 3.0;

      _ctx.beginPath();
      _ctx.moveTo(0, wy(0));
      for (let x = 3; x <= w; x += 3) _ctx.lineTo(x, wy(x));
      _ctx.strokeStyle = `rgba(210,238,255,${alpha})`;
      _ctx.lineWidth   = lw;
      _ctx.stroke();

      // Foreground crests (p > 0.75): add a thin foam highlight on top
      if (p > 0.75) {
        _ctx.beginPath();
        _ctx.moveTo(0, wy(0) - lw * 0.4);
        for (let x = 3; x <= w; x += 3) _ctx.lineTo(x, wy(x) - lw * 0.4);
        _ctx.strokeStyle = `rgba(255,255,255,${alpha * 0.45})`;
        _ctx.lineWidth   = lw * 0.35;
        _ctx.stroke();
      }
    }

    // ── 3. Horizon feather — melts sky into sea ───────────────
    const melt = _ctx.createLinearGradient(0, hy - h*0.025, 0, hy + h*0.045);
    melt.addColorStop(0,   'rgba(0,0,0,0)');
    melt.addColorStop(0.5, 'rgba(5,15,45,0.10)');
    melt.addColorStop(1,   'rgba(5,15,45,0.32)');
    _ctx.fillStyle = melt;
    _ctx.fillRect(0, hy - h*0.025, w, h*0.07);
  }

  // ── Birds ──────────────────────────────────────────────────
  function _newBird(init) {
    const w = _canvas?.width || 1200;
    const h = _canvas?.height || 800;
    const fromLeft = Math.random() > 0.5;
    return {
      x:      fromLeft ? -60 : w + 60,
      y:      h * (0.08 + Math.random() * 0.42),
      dir:    fromLeft ? 1 : -1,
      speed:  0.18 + Math.random() * 0.28,
      size:   3.5 + Math.random() * 4,
      flock:  Math.random() < 0.35,     // part of a loose flock?
      flockOff: { x: (Math.random()-0.5)*80, y: (Math.random()-0.5)*30 },
      wingPhase: Math.random() * Math.PI * 2,
      wingSpeed: 0.04 + Math.random() * 0.03,
      yDrift:    (Math.random()-0.5) * 0.008,
      driftPhase: Math.random() * Math.PI * 2,
      alpha:  init ? 1 : 0,
      fadeIn: !init,
    };
  }

  function _drawBirds(t, hr, mode) {
    const w = _canvas.width, h = _canvas.height;
    // Birds active in daylight; fewer near dusk; none deep night except nature mode
    const dayBirds = hr >= 5 && hr <= 20;
    const nightBirds = mode === 'nature';
    if (!dayBirds && !nightBirds) {
      // Recycle positions for next appearance
      _birds.forEach(b => { if (b.x > w + 80 || b.x < -80) Object.assign(b, _newBird(false)); });
      return;
    }

    const density = mode === 'nature' ? 1.4 : mode === 'focus' ? 0.5 : 1.0;

    _birds.forEach((b, idx) => {
      // Fade in
      if (b.fadeIn) { b.alpha = Math.min(1, b.alpha + 0.01); if (b.alpha >= 1) b.fadeIn = false; }

      // Move
      b.x += b.dir * b.speed;
      b.y += b.yDrift + Math.sin(t * 0.018 + b.driftPhase) * 0.3;
      b.y  = Math.max(h * 0.04, Math.min(h * 0.55, b.y));

      // Recycle when off-screen
      if ((b.dir > 0 && b.x > w + 80) || (b.dir < 0 && b.x < -80)) {
        Object.assign(b, _newBird(false));
        b.alpha = 0; b.fadeIn = true;
      }

      // Wing angle — gentle sine oscillation
      const wingOpen = Math.sin(t * b.wingSpeed + b.wingPhase); // -1 to 1

      // Draw silhouette (M-shape two bezier curves)
      _ctx.save();
      _ctx.translate(b.x, b.y);
      _ctx.scale(b.dir, 1); // flip for direction
      const s = b.size;
      const wy = wingOpen * s * 0.55; // wing droop/lift
      _ctx.beginPath();
      // Left wing
      _ctx.moveTo(0, 0);
      _ctx.quadraticCurveTo(-s * 0.7, wy - s * 0.1, -s * 1.5, wy);
      // Right wing
      _ctx.moveTo(0, 0);
      _ctx.quadraticCurveTo( s * 0.7, wy - s * 0.1,  s * 1.5, wy);
      _ctx.strokeStyle = `rgba(20,25,35,${b.alpha * 0.75})`;
      _ctx.lineWidth   = Math.max(0.8, s * 0.18);
      _ctx.lineCap     = 'round';
      _ctx.stroke();
      _ctx.restore();
    });
  }

  // ── Fireflies ──────────────────────────────────────────────
  function _newFirefly(init) {
    const w = _canvas?.width || 1200;
    const h = _canvas?.height || 800;
    return {
      x: Math.random() * w,
      y: h * (0.45 + Math.random() * 0.45),
      vx: (Math.random()-0.5) * 0.4,
      vy: (Math.random()-0.5) * 0.3,
      phase: Math.random() * Math.PI * 2,
      speed: 0.02 + Math.random() * 0.025,
      r: 1.2 + Math.random() * 1.4,
    };
  }

  function _drawFireflies(t, hr, mode) {
    const w = _canvas.width, h = _canvas.height;
    // Active at night or in nature mode at dusk
    const nightness = hr < 5.5 ? 1 : hr < 7 ? 1 - (hr-5.5)/1.5 : hr >= 19 ? (hr-19)/1.5 : 0;
    const alpha = Math.min(1, nightness * 1.2 + (mode === 'nature' ? nightness * 0.5 : 0));
    if (alpha < 0.05 && mode !== 'sleep') return;
    const sleepBoost = mode === 'sleep' ? 0.5 : 0;

    _fireflies.forEach(f => {
      f.x += f.vx + Math.sin(t * 0.018 + f.phase) * 0.25;
      f.y += f.vy + Math.cos(t * 0.014 + f.phase * 0.7) * 0.2;
      if (f.x < 0) f.x = w; if (f.x > w) f.x = 0;
      if (f.y < h * 0.4) f.y = h * 0.95; if (f.y > h) f.y = h * 0.45;

      const glow = (Math.sin(t * f.speed + f.phase) + 1) / 2;
      const a    = (alpha + sleepBoost) * glow * 0.85;
      if (a < 0.02) return;

      const gr = _ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r * 4);
      gr.addColorStop(0, `rgba(180,255,140,${a})`);
      gr.addColorStop(1, 'rgba(180,255,140,0)');
      _ctx.fillStyle = gr;
      _ctx.fillRect(f.x - f.r*4, f.y - f.r*4, f.r*8, f.r*8);
    });
  }

  // ── Petals / butterflies ───────────────────────────────────
  function _newPetal(init) {
    const w = _canvas?.width || 1200;
    const h = _canvas?.height || 800;
    return {
      x: Math.random() * w,
      y: init ? Math.random() * h : -20,
      size: 4 + Math.random() * 7,
      speed: 0.18 + Math.random() * 0.22,
      drift: (Math.random()-0.5) * 0.4,
      rot: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random()-0.5) * 0.022,
      hue: 270 + Math.random() * 80,   // lavender to rose
      alpha: 0.15 + Math.random() * 0.22,
      driftPhase: Math.random() * Math.PI * 2,
    };
  }

  function _drawPetals(t, mode) {
    const w = _canvas.width, h = _canvas.height;
    if (mode !== 'yoga' && mode !== 'nature') return;
    const count = mode === 'nature' ? _petals.length : Math.floor(_petals.length * 0.6);

    for (let i = 0; i < count; i++) {
      const p = _petals[i];
      p.y    += p.speed;
      p.x    += p.drift + Math.sin(t * 0.012 + p.driftPhase) * 0.4;
      p.rot  += p.rotSpeed;
      if (p.y > h + 20) Object.assign(p, _newPetal(false));

      _ctx.save();
      _ctx.translate(p.x, p.y); _ctx.rotate(p.rot);
      _ctx.beginPath();
      _ctx.ellipse(0, 0, p.size, p.size * 0.42, 0, 0, Math.PI * 2);
      _ctx.fillStyle = `hsla(${p.hue},45%,72%,${p.alpha})`;
      _ctx.fill();
      _ctx.restore();
    }
  }

  // ── Focus veil — very faint geometric layer ────────────────
  function _drawFocusVeil(t) {
    const w = _canvas.width, h = _canvas.height;
    const spacing = 70;
    _ctx.strokeStyle = 'rgba(80,140,220,0.055)';
    _ctx.lineWidth   = 0.8;
    for (let x = 0; x < w; x += spacing) {
      _ctx.beginPath(); _ctx.moveTo(x, 0); _ctx.lineTo(x, h); _ctx.stroke();
    }
    for (let y = 0; y < h; y += spacing) {
      _ctx.beginPath(); _ctx.moveTo(0, y); _ctx.lineTo(w, y); _ctx.stroke();
    }
    // Subtle centre pulse
    const cx = w/2, cy = h/2;
    const pulse = Math.sin(t * 0.025);
    const cg = _ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(w,h) * 0.45);
    cg.addColorStop(0, `rgba(60,120,220,${0.05 + 0.025 * pulse})`);
    cg.addColorStop(1, 'rgba(60,120,220,0)');
    _ctx.fillStyle = cg; _ctx.fillRect(0, 0, w, h);
  }

  // ── Yoga breath glow ───────────────────────────────────────
  function _drawBreathGlow(t) {
    const w = _canvas.width, h = _canvas.height;
    // ~8s inhale/exhale cycle at 60fps
    const breath = (Math.sin(t * 0.013) + 1) / 2;
    const cx = w / 2, cy = h * 0.52;
    const gr = _ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(w,h) * (0.28 + 0.12 * breath));
    gr.addColorStop(0,   `rgba(255,200,130,${0.06 + 0.055 * breath})`);
    gr.addColorStop(0.5, `rgba(220,140,100,${0.03 + 0.03  * breath})`);
    gr.addColorStop(1,   'rgba(200,100,80,0)');
    _ctx.fillStyle = gr; _ctx.fillRect(0, 0, w, h);
  }

  // ── Weather system ────────────────────────────────────────
  // Seeded by day-of-year so weather is consistent within a day
  // but varies naturally across days.
  const _dayOfYear = (() => {
    const n = new Date(); return Math.floor((n - new Date(n.getFullYear(),0,0)) / 86400000);
  })();
  const _weatherSeed = Math.sin(_dayOfYear * 2.399) * 0.5 + 0.5; // 0–1 stable per day

  // Weather type for this hour
  function _weatherType(hr) {
    // Morning haze always present dawn-8am
    if (hr >= 5 && hr < 8)   return 'haze';
    // Afternoon tropical shower (seed determines if today has one)
    if (hr >= 13 && hr < 16 && _weatherSeed > 0.55) return 'shower';
    // Overcast on ~30% of days in the morning
    if (hr >= 9  && hr < 12 && _weatherSeed < 0.3)  return 'overcast';
    // Evening scattered clouds
    if (hr >= 16 && hr < 19) return 'clouds';
    // Otherwise clear or light clouds
    return _weatherSeed > 0.5 ? 'clear' : 'light-cloud';
  }

  // Cloud pool — reused across frames
  const _clouds = Array.from({length: 12}, (_, i) => ({
    x:     (i / 12) * 1.4 - 0.1,          // 0..1.3 as fraction of w
    y:     0.05 + Math.random() * 0.28,    // fraction of h, stays in sky
    w:     0.18 + Math.random() * 0.25,    // fraction of w
    h:     0.04 + Math.random() * 0.06,    // fraction of h
    speed: 0.000025 + Math.random() * 0.00003,
    puffs: Math.floor(3 + Math.random() * 4),
    alpha: 0.35 + Math.random() * 0.30,
    type:  Math.random() > 0.5 ? 'cumulus' : 'wispy',
  }));

  function _drawCloud(c, w, h, alpha) {
    const cx = c.x * w, cy = c.y * h;
    const cw = c.w * w, ch = c.h * h;

    if (c.type === 'wispy') {
      // Cirrus: soft elongated horizontal smear, tapered at both ends
      const g = _ctx.createLinearGradient(cx - cw*0.55, cy, cx + cw*0.55, cy);
      g.addColorStop(0,    'rgba(255,255,255,0)');
      g.addColorStop(0.25, `rgba(255,255,255,${alpha*0.25})`);
      g.addColorStop(0.75, `rgba(255,255,255,${alpha*0.25})`);
      g.addColorStop(1,    'rgba(255,255,255,0)');
      _ctx.fillStyle = g;
      _ctx.beginPath();
      _ctx.ellipse(cx, cy, cw * 0.55, ch * 0.18, 0, 0, Math.PI * 2);
      _ctx.fill();
      // Faint secondary wisp offset
      _ctx.beginPath();
      _ctx.ellipse(cx + cw*0.15, cy - ch*0.12, cw * 0.3, ch * 0.10, 0.1, 0, Math.PI * 2);
      _ctx.fillStyle = `rgba(255,255,255,${alpha*0.12})`;
      _ctx.fill();

    } else {
      // Cumulus: flat base + rounded bumps along the TOP edge only
      const left  = cx - cw * 0.48;
      const bumpR = ch * 0.38;                         // bump radius
      const nBump = Math.max(3, Math.round(cw / (bumpR * 1.6)));
      const bStep = (cw * 0.96) / nBump;

      // 1. Flat body — wide horizontal ellipse
      _ctx.beginPath();
      _ctx.ellipse(cx, cy + bumpR * 0.55, cw * 0.48, bumpR * 0.55, 0, 0, Math.PI * 2);
      _ctx.fillStyle = `rgba(240,245,255,${alpha * 0.48})`;
      _ctx.fill();

      // 2. Bumps — semicircles along top, heavily overlapping so no gaps
      for (let b = 0; b < nBump; b++) {
        const bx = left + bumpR * 0.5 + b * bStep;
        const br = bumpR * (0.85 + Math.sin(bx * 0.03 + c.y * 10) * 0.18);
        _ctx.beginPath();
        _ctx.arc(bx, cy + bumpR * 0.15, br, Math.PI, 0, false);
        _ctx.closePath();
        _ctx.fillStyle = `rgba(250,252,255,${alpha * 0.58})`;
        _ctx.fill();
      }

      // 3. Bright inner highlight (sun catch on upper-left)
      _ctx.beginPath();
      _ctx.ellipse(cx - cw*0.08, cy - bumpR*0.08, cw*0.22, bumpR*0.3, -0.3, 0, Math.PI*2);
      _ctx.fillStyle = `rgba(255,255,255,${alpha * 0.28})`;
      _ctx.fill();

      // 4. Flat grey-blue underside (shadow)
      _ctx.beginPath();
      _ctx.ellipse(cx, cy + bumpR * 0.95, cw * 0.44, bumpR * 0.18, 0, 0, Math.PI * 2);
      _ctx.fillStyle = `rgba(170,185,215,${alpha * 0.32})`;
      _ctx.fill();
    }
  }

  function _drawWeather(t, hr, mode) {
    const w = _canvas.width, h = _canvas.height;
    const type = _weatherType(hr);

    // Move clouds slowly across sky
    _clouds.forEach(c => {
      c.x += c.speed;
      if (c.x > 1.35) c.x = -0.35;
    });

    if (type === 'haze') {
      // Morning haze — white-ish veil over lower sky
      const fade = hr < 6.5 ? 1 : Math.max(0, 1 - (hr - 6.5) / 1.5);
      const hg = _ctx.createLinearGradient(0, h * 0.35, 0, h * 0.80);
      hg.addColorStop(0,   'rgba(220,230,240,0)');
      hg.addColorStop(0.4, `rgba(220,230,240,${fade * 0.22})`);
      hg.addColorStop(1,   'rgba(220,230,240,0)');
      _ctx.fillStyle = hg;
      _ctx.fillRect(0, h * 0.35, w, h * 0.45);
      // Draw a few wispy clouds
      _clouds.slice(0, 5).forEach(c => _drawCloud({...c, type:'wispy'}, w, h, fade * 0.5));

    } else if (type === 'shower') {
      // Afternoon tropical shower — dark clouds + rain streaks
      const hy = h * 0.72;
      // Overcast base
      const cg = _ctx.createLinearGradient(0, 0, 0, hy);
      cg.addColorStop(0,   'rgba(60,70,90,0.45)');
      cg.addColorStop(1,   'rgba(30,40,60,0.20)');
      _ctx.fillStyle = cg; _ctx.fillRect(0, 0, w, hy);
      // Storm clouds
      _clouds.slice(0, 8).forEach(c => _drawCloud({...c, type:'cumulus', alpha:0.65}, w, h, 0.7));
      // Rain streaks
      _ctx.save();
      _ctx.strokeStyle = 'rgba(180,210,240,0.18)';
      _ctx.lineWidth   = 0.8;
      const rainPhase = (t * 0.5) % 80;
      for (let i = 0; i < 120; i++) {
        const rx = ((i * 137.5 + rainPhase) % w);
        const ry = ((i * 53  + t * 1.2 ) % (h * 0.85));
        _ctx.beginPath();
        _ctx.moveTo(rx, ry);
        _ctx.lineTo(rx - 1, ry + 14);
        _ctx.stroke();
      }
      _ctx.restore();

    } else if (type === 'overcast') {
      // Overcast — uniform grey veil + low flat clouds
      const og = _ctx.createLinearGradient(0, 0, 0, h * 0.6);
      og.addColorStop(0,   'rgba(80,90,110,0.35)');
      og.addColorStop(1,   'rgba(50,60,80,0.10)');
      _ctx.fillStyle = og; _ctx.fillRect(0, 0, w, h * 0.6);
      _clouds.slice(0, 10).forEach(c => _drawCloud(c, w, h, 0.55));

    } else if (type === 'clouds') {
      // Scattered afternoon/evening clouds
      const count = Math.floor(4 + _weatherSeed * 4);
      _clouds.slice(0, count).forEach(c => _drawCloud(c, w, h, 0.40));

    } else {
      // Clear / light-cloud — just 2-3 distant wisps
      _clouds.slice(0, 3).forEach(c => _drawCloud({...c, type:'wispy'}, w, h, 0.22));
    }
  }

  // ── Mandarin ducks — float on the water surface ───────────
  const _ducks = Array.from({length: 3}, (_, i) => ({
    x:      0.15 + i * 0.28 + Math.random() * 0.12,  // 0..1 fraction of w
    vx:     (Math.random() > 0.5 ? 1 : -1) * (0.00008 + Math.random() * 0.00006),
    bob:    Math.random() * Math.PI * 2,              // bobbing phase
    paired: i < 2,                                    // first two are a pair
    wake:   [],                                        // trailing wake dots
  }));

  function _drawDuck(x, y, facing, alpha) {
    // Simplified mandarin duck silhouette — body + head + tail crest
    _ctx.save();
    _ctx.translate(x, y);
    _ctx.scale(facing, 1);  // flip for direction

    // Body — warm amber-chestnut oval
    _ctx.beginPath();
    _ctx.ellipse(0, 0, 18, 9, -0.1, 0, Math.PI * 2);
    _ctx.fillStyle = `rgba(160,80,30,${alpha * 0.85})`;
    _ctx.fill();

    // Wing highlight — teal-green patch
    _ctx.beginPath();
    _ctx.ellipse(-2, -2, 9, 5, 0.2, 0, Math.PI * 2);
    _ctx.fillStyle = `rgba(40,120,100,${alpha * 0.75})`;
    _ctx.fill();

    // Head — dark iridescent green
    _ctx.beginPath();
    _ctx.arc(14, -7, 7, 0, Math.PI * 2);
    _ctx.fillStyle = `rgba(20,80,50,${alpha * 0.90})`;
    _ctx.fill();

    // Orange bill
    _ctx.beginPath();
    _ctx.ellipse(21, -5, 5, 2.5, 0.2, 0, Math.PI * 2);
    _ctx.fillStyle = `rgba(220,130,30,${alpha * 0.9})`;
    _ctx.fill();

    // Tail crest — swept up
    _ctx.beginPath();
    _ctx.moveTo(-14, -3);
    _ctx.quadraticCurveTo(-22, -14, -18, -18);
    _ctx.quadraticCurveTo(-12, -10, -10, -3);
    _ctx.fillStyle = `rgba(80,40,15,${alpha * 0.7})`;
    _ctx.fill();

    _ctx.restore();
  }

  function _drawDucks(t, hr, mode) {
    const w = _canvas.width, h = _canvas.height;
    // Only show ducks in calm daytime — not in heavy rain or night
    const wtype = _weatherType(hr);
    if (wtype === 'shower' || hr < 6 || hr > 20) return;
    if (mode === 'focus') return;  // focus = minimal

    const hy = h * (mode === 'sleep' ? 0.68 : 0.75);
    // Ducks sit just below horizon, floating on near-surface water
    const duckY = hy + h * 0.04;

    _ducks.forEach((d, i) => {
      d.x  += d.vx;
      d.bob += 0.025;
      // Gentle turn at edges
      if (d.x < 0.04) d.vx =  Math.abs(d.vx);
      if (d.x > 0.96) d.vx = -Math.abs(d.vx);

      const px = d.x * w;
      const py = duckY + Math.sin(d.bob) * 2.5;   // gentle bobbing
      const facing = d.vx > 0 ? 1 : -1;

      // Appear gradually on calm days — fade in over first 30s
      const alpha = Math.min(0.75, t / 1800) * (mode === 'nature' ? 1 : 0.7);

      // Subtle wake — short V-lines behind duck
      _ctx.save();
      _ctx.strokeStyle = `rgba(200,230,250,${alpha * 0.18})`;
      _ctx.lineWidth = 0.8;
      for (let w2 = 1; w2 <= 3; w2++) {
        const wx = px - facing * w2 * 8;
        _ctx.beginPath();
        _ctx.moveTo(wx, py + 6);
        _ctx.lineTo(wx - facing * 6, py + 10);
        _ctx.stroke();
        _ctx.beginPath();
        _ctx.moveTo(wx, py + 6);
        _ctx.lineTo(wx + facing * 6, py + 10);
        _ctx.stroke();
      }
      _ctx.restore();

      _drawDuck(px, py, facing, alpha);
    });
  }

  // ── Fish glimpse — rare, subtle, transparent ─────────────
  let _fishTimer = 0;
  const _fish = { active: false, x: 0, y: 0, vx: 0, life: 0, maxLife: 0 };

  function _drawFish(t, hr, mode) {
    const w = _canvas.width, h = _canvas.height;
    if (mode === 'focus' || hr < 6 || hr > 20) return;

    const hy = h * (mode === 'sleep' ? 0.68 : 0.75);
    _fishTimer--;

    if (!_fish.active && _fishTimer <= 0) {
      // Spawn a fish every 15-45 s (900-2700 frames at 60fps)
      _fishTimer = 900 + Math.random() * 1800;
      _fish.active = true;
      _fish.x      = Math.random() > 0.5 ? -0.05 : 1.05;
      _fish.y      = hy + h * (0.06 + Math.random() * 0.12);
      _fish.vx     = _fish.x < 0 ? 0.0015 : -0.0015;
      _fish.life   = 0;
      _fish.maxLife = 200 + Math.random() * 200;
    }
    if (!_fish.active) return;

    _fish.x   += _fish.vx;
    _fish.life++;
    if (_fish.life > _fish.maxLife) { _fish.active = false; return; }

    const alpha = Math.min(_fish.life, _fish.maxLife - _fish.life, 40) / 40 * 0.32;
    const fx    = _fish.x * w;
    const fy    = _fish.y + Math.sin(_fish.life * 0.08) * 6; // gentle undulation
    const facing = _fish.vx > 0 ? 1 : -1;

    _ctx.save();
    _ctx.translate(fx, fy);
    _ctx.scale(facing, 1);
    // Semi-transparent fish body
    _ctx.beginPath();
    _ctx.ellipse(0, 0, 22, 7, 0, 0, Math.PI * 2);
    _ctx.fillStyle = `rgba(160,220,210,${alpha})`;
    _ctx.fill();
    // Tail
    _ctx.beginPath();
    _ctx.moveTo(-18, 0);
    _ctx.lineTo(-28, -8); _ctx.lineTo(-28, 8); _ctx.closePath();
    _ctx.fillStyle = `rgba(140,200,190,${alpha * 0.7})`;
    _ctx.fill();
    // Eye
    _ctx.beginPath();
    _ctx.arc(14, -2, 2.5, 0, Math.PI * 2);
    _ctx.fillStyle = `rgba(30,60,80,${alpha * 1.2})`;
    _ctx.fill();
    _ctx.restore();
  }

  // ── Main world frame ───────────────────────────────────────
  function _worldFrame(t, mode) {
    const hr = new Date().getHours() + new Date().getMinutes() / 60;
    _drawSky(hr, mode);
    _drawSun(hr);
    _drawStarsAndMoon(t, hr, mode);
    _drawWeather(t, hr, mode);
    _drawMist(t, hr, mode);
    _drawWater(t, hr, mode);
    _drawDucks(t, hr, mode);              // mandarin ducks on surface
    _drawFish(t, hr, mode);              // occasional transparent fish
    _drawFireflies(t, hr, mode);
    _drawBirds(t, hr, mode);
    _drawPetals(t, mode);
    if (mode === 'focus') _drawFocusVeil(t);
    if (mode === 'yoga')  _drawBreathGlow(t);
  }

  // ── Public API ─────────────────────────────────────────────
  function setScene(channel) {
    cancelAnimationFrame(_raf);
    _current = channel;
    if (!_canvas) return;

    const mode = (channel === 'default' || channel === 'auto') ? 'default' : channel;
    // Tell ambient audio to adjust its mix for this mode
    if (typeof AmbientAudio !== 'undefined') AmbientAudio.setMode(mode);

    let t = 0;
    function frame() {
      _raf = requestAnimationFrame(frame);
      t++;
      _worldFrame(t, mode);
    }
    frame();
  }

  function current() { return _current; }

  return { init, setScene, current };
})();

// ── Bootstrap ───────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const c = document.getElementById('bg-canvas') || document.getElementById('bg') || document.querySelector('canvas');
  if (!c) return;
  CanvasScenes.init(c);

  // Suppress inline starfield — it checks window._activeScene !== 'default' to exit
  window._activeScene = '__cs__';

  // Start with saved channel or time-based default
  const saved = localStorage.getItem('sr_channel') || 'default';
  CanvasScenes.setScene(saved);

  // Channel switches
  document.addEventListener('channel:changed', e => {
    CanvasScenes.setScene(e.detail || 'default');
  });

  // Refresh sky/mood every hour (real time drives it automatically via new Date())
  setInterval(() => {
    if (CanvasScenes.current() === 'default') CanvasScenes.setScene('default');
  }, 60 * 60 * 1000);
});

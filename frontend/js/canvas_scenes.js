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
    g.addColorStop(0.36, p.mid);
    g.addColorStop(0.65, p.bot);   // horizon at 65% — more sky, less mid-screen seam
    g.addColorStop(1,    p.bot);   // hold colour to bottom (water covers this)
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
    // Horizon at 65% — matches where sky gradient ends; sleep shifts slightly lower
    const hy = h * (mode === 'sleep' ? 0.60 : 0.65);
    const wH = h - hy;
    const mA = mode === 'sleep' ? 1.6 : 1.0;

    const isDawn = hr >= 5.5 && hr < 8;
    const isDusk = hr >= 17  && hr < 20;
    const isDay  = hr >= 8   && hr < 17;
    // Sky-reflection tint at horizon matches sky bot palette
    const sR = isDawn||isDusk ? 200 : isDay ? 80  : 22;
    const sG = isDawn||isDusk ? 120 : isDay ? 155 : 48;
    const sB = isDawn||isDusk ?  55 : isDay ? 220 : 125;

    // ── 1. One solid gradient — no hard-edge seam at horizon ─
    // Top is nearly transparent (sky shows through), darkens smoothly downward.
    const wg = _ctx.createLinearGradient(0, hy, 0, h);
    wg.addColorStop(0,    `rgba(${sR},${sG},${sB},0.06)`);  // almost invisible at seam
    wg.addColorStop(0.05, `rgba(${sR},${sG},${sB},0.30)`);  // gentle sky-color tint
    wg.addColorStop(0.18, `rgba(${Math.round(sR*0.45)},${Math.round(sG*0.40)},${Math.round(sB*0.60)},0.82)`);
    wg.addColorStop(0.45, 'rgba(5,18,58,0.94)');
    wg.addColorStop(1,    'rgba(2,6,20,0.98)');
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

    // ── 3. Horizon feather — sky bleeds gently into sea ─────
    // Span 4% above and 6% below the horizon line
    const melt = _ctx.createLinearGradient(0, hy - h*0.04, 0, hy + h*0.06);
    melt.addColorStop(0,    'rgba(0,0,0,0)');
    melt.addColorStop(0.42, `rgba(${sR},${sG},${sB},0.06)`);
    melt.addColorStop(0.60, `rgba(${sR},${sG},${sB},0.04)`);
    melt.addColorStop(1,    'rgba(0,0,0,0)');
    _ctx.fillStyle = melt;
    _ctx.fillRect(0, hy - h*0.04, w, h*0.10);
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
  // Types: wispy | cumulus | backlit | cumulonimbus
  // 'backlit' and 'cumulonimbus' appear on dramatic/shower days; others daily.
  const _cloudTypes = ['wispy','wispy','cumulus','cumulus','cumulus','backlit','cumulonimbus'];
  const _clouds = Array.from({length: 14}, (_, i) => {
    const t = _cloudTypes[i % _cloudTypes.length];
    return {
      x:     (i / 14) * 1.6 - 0.15,
      y:     0.04 + Math.random() * (t === 'cumulonimbus' ? 0.12 : 0.26),
      w:     (t === 'cumulonimbus' ? 0.10 : 0.16) + Math.random() * 0.18,
      h:     (t === 'cumulonimbus' ? 0.10 : 0.04) + Math.random() * 0.05,
      speed: 0.000018 + Math.random() * 0.000025,
      alpha: (t === 'backlit' ? 0.45 : 0.32) + Math.random() * 0.28,
      type:  t,
      seed:  Math.random(),  // per-cloud random seed for shape variation
    };
  });

  function _drawCloud(c, w, h, alpha) {
    const cx = c.x * w, cy = c.y * h;
    const cw = c.w * w, ch = c.h * h;
    const type = c.type || 'cumulus';

    if (type === 'wispy') {
      // ── Cirrus: elongated horizontal smear — sometimes slight diagonal ──
      // Natural diagonal tilt ±8° makes overlapping wisps look organic
      const tilt = (c.seed - 0.5) * 0.28;  // slight diagonal variation
      _ctx.save();
      _ctx.translate(cx, cy);
      _ctx.rotate(tilt);
      const g = _ctx.createLinearGradient(-cw*0.55, 0, cw*0.55, 0);
      g.addColorStop(0,    'rgba(255,255,255,0)');
      g.addColorStop(0.2,  `rgba(255,255,255,${alpha*0.22})`);
      g.addColorStop(0.5,  `rgba(255,255,255,${alpha*0.30})`);
      g.addColorStop(0.8,  `rgba(255,255,255,${alpha*0.22})`);
      g.addColorStop(1,    'rgba(255,255,255,0)');
      _ctx.fillStyle = g;
      _ctx.beginPath();
      _ctx.ellipse(0, 0, cw * 0.55, ch * 0.16, 0, 0, Math.PI * 2);
      _ctx.fill();
      // Secondary streamer — offset, different tilt — gives layered depth
      _ctx.beginPath();
      _ctx.ellipse(cw*0.18, -ch*0.15, cw*0.32, ch*0.09, 0.15, 0, Math.PI * 2);
      _ctx.fillStyle = `rgba(255,255,255,${alpha*0.14})`;
      _ctx.fill();
      _ctx.restore();

    } else if (type === 'cumulus') {
      // ── Fair-weather cumulus: flat base, fluffy rounded top ──
      const left   = cx - cw * 0.46;
      const bumpR  = ch * 0.42;
      const nBump  = Math.max(3, Math.round(cw / (bumpR * 1.55)));
      const bStep  = (cw * 0.92) / nBump;

      // Flat body
      _ctx.beginPath();
      _ctx.ellipse(cx, cy + bumpR * 0.52, cw * 0.46, bumpR * 0.52, 0, 0, Math.PI * 2);
      _ctx.fillStyle = `rgba(238,244,255,${alpha * 0.46})`;
      _ctx.fill();

      // Bumps — semicircles along top
      for (let b = 0; b < nBump; b++) {
        const bx = left + bumpR * 0.48 + b * bStep;
        const br = bumpR * (0.82 + Math.sin(bx * 0.025 + c.seed * 8) * 0.20);
        _ctx.beginPath();
        _ctx.arc(bx, cy + bumpR * 0.12, br, Math.PI, 0, false);
        _ctx.closePath();
        _ctx.fillStyle = `rgba(252,254,255,${alpha * 0.60})`;
        _ctx.fill();
      }
      // Bright highlight (sun catch, upper-left of cloud mass)
      _ctx.beginPath();
      _ctx.ellipse(cx - cw*0.10, cy - bumpR*0.10, cw*0.20, bumpR*0.28, -0.25, 0, Math.PI*2);
      _ctx.fillStyle = `rgba(255,255,255,${alpha * 0.30})`;
      _ctx.fill();
      // Grey-blue flat underside shadow
      _ctx.beginPath();
      _ctx.ellipse(cx, cy + bumpR * 0.90, cw * 0.42, bumpR * 0.16, 0, 0, Math.PI * 2);
      _ctx.fillStyle = `rgba(165,180,210,${alpha * 0.30})`;
      _ctx.fill();

    } else if (type === 'backlit') {
      // ── "Sculpted in florets of cream and pearl, backlit lavender shadows" ──
      // Each floret: lavender shadow offset behind, cream pearl face, bright edge glow
      const nFlorets = 4 + Math.round(c.seed * 3);
      const fr0 = ch * 0.62;

      for (let fi = 0; fi < nFlorets; fi++) {
        const t  = fi / (nFlorets - 1);
        const fx = cx + (t - 0.5) * cw * 0.82;
        const fy = cy + Math.sin(fi * 1.5 + c.seed * 3) * ch * 0.22 - ch * 0.10;
        const fr = fr0 * (0.72 + Math.sin(fi * 0.88 + c.seed * 5) * 0.28);

        // Lavender shadow (slightly behind and below — like backlit depth)
        _ctx.beginPath();
        _ctx.arc(fx + fr*0.14, fy + fr*0.14, fr, 0, Math.PI * 2);
        _ctx.fillStyle = `rgba(175,155,220,${alpha * 0.40})`;
        _ctx.fill();

        // Cream-pearl main body
        _ctx.beginPath();
        _ctx.arc(fx, fy, fr * 0.88, 0, Math.PI * 2);
        _ctx.fillStyle = `rgba(252,248,255,${alpha * 0.62})`;
        _ctx.fill();

        // Luminous backlit edge — brighter upper-left rim
        const eg = _ctx.createRadialGradient(fx - fr*0.25, fy - fr*0.25, fr*0.1, fx, fy, fr);
        eg.addColorStop(0,   `rgba(255,255,255,${alpha * 0.50})`);
        eg.addColorStop(0.55,`rgba(255,252,255,${alpha * 0.12})`);
        eg.addColorStop(1,   'rgba(255,255,255,0)');
        _ctx.fillStyle = eg;
        _ctx.beginPath();
        _ctx.arc(fx, fy, fr, 0, Math.PI * 2);
        _ctx.fill();
      }
      // Flat shadow underside across whole cloud mass
      _ctx.beginPath();
      _ctx.ellipse(cx, cy + fr0*0.7, cw*0.44, fr0*0.14, 0, 0, Math.PI*2);
      _ctx.fillStyle = `rgba(140,120,190,${alpha * 0.22})`;
      _ctx.fill();

    } else if (type === 'cumulonimbus') {
      // ── Thunderhead: "white-hot mountains on the horizon" ──
      // Towering vertical column with anvil top; dark base; lavender mid-shadow
      const base  = cy + ch * 0.55;
      const tower = ch * 3.8;   // tall — extends well above nominal cloud y
      const towerW = cw * 0.38;

      // Dark rain-bearing base — heavy, anvil-flat
      const baseG = _ctx.createRadialGradient(cx, base, 0, cx, base, cw * 0.5);
      baseG.addColorStop(0,   `rgba(55,62,88,${alpha * 0.88})`);
      baseG.addColorStop(0.6, `rgba(38,44,68,${alpha * 0.70})`);
      baseG.addColorStop(1,   'rgba(30,38,60,0)');
      _ctx.fillStyle = baseG;
      _ctx.beginPath();
      _ctx.ellipse(cx, base, cw * 0.50, ch * 0.28, 0, 0, Math.PI * 2);
      _ctx.fill();

      // Tower — stacked cauliflower tiers, each slightly offset
      const nTier = 6;
      for (let ti = 0; ti < nTier; ti++) {
        const p   = ti / (nTier - 1);
        const ty  = base - tower * (p * 0.75 + 0.08);
        const tr  = towerW * (1.0 - p * 0.32) * (0.80 + Math.sin(ti * 1.4 + c.seed * 4) * 0.20);
        // Darker at base, brilliant white at crown
        const lum = Math.round(160 + p * 90);
        const blu = Math.round(lum + p * 10);
        _ctx.beginPath();
        _ctx.ellipse(cx + (c.seed - 0.5) * 8 * p, ty, tr, tr * 0.58, 0, 0, Math.PI * 2);
        _ctx.fillStyle = `rgba(${lum},${lum},${blu},${alpha * (0.45 + p * 0.30)})`;
        _ctx.fill();
      }

      // Lavender mid-shadow — "a labyrinth of vapor and shadow"
      _ctx.beginPath();
      _ctx.ellipse(cx, base - tower * 0.45, towerW * 0.55, tower * 0.30, 0, 0, Math.PI * 2);
      _ctx.fillStyle = `rgba(155,135,200,${alpha * 0.20})`;
      _ctx.fill();

      // Anvil top — flat stratospheric spread, backlit bright
      _ctx.beginPath();
      _ctx.ellipse(cx, base - tower * 0.78, cw * 0.62, ch * 0.22, 0, 0, Math.PI * 2);
      _ctx.fillStyle = `rgba(248,250,255,${alpha * 0.58})`;
      _ctx.fill();
      // Anvil bright highlight
      _ctx.beginPath();
      _ctx.ellipse(cx - cw*0.08, base - tower*0.80, cw*0.30, ch*0.08, 0, 0, Math.PI*2);
      _ctx.fillStyle = `rgba(255,255,255,${alpha * 0.36})`;
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
      // Morning haze — soft veil + gentle wisps
      const fade = hr < 6.5 ? 1 : Math.max(0, 1 - (hr - 6.5) / 1.5);
      const hg = _ctx.createLinearGradient(0, h * 0.32, 0, h * 0.72);
      hg.addColorStop(0,   'rgba(220,230,240,0)');
      hg.addColorStop(0.38,`rgba(220,230,240,${fade * 0.18})`);
      hg.addColorStop(1,   'rgba(220,230,240,0)');
      _ctx.fillStyle = hg;
      _ctx.fillRect(0, h * 0.32, w, h * 0.40);
      // Backlit wisps — dawn light gives pearl-lavender tones
      _clouds.slice(0, 4).forEach(c => _drawCloud({...c, type:'wispy'}, w, h, fade * 0.40));
      _clouds.slice(4, 6).forEach(c => _drawCloud({...c, type:'backlit'}, w, h, fade * 0.28));

    } else if (type === 'shower') {
      // Afternoon tropical shower — "advancing like a slow-motion avalanche"
      // Dark overcast veil + towering cumulonimbus + backlit drama + rain
      const hy = h * 0.65;
      const cg = _ctx.createLinearGradient(0, 0, 0, hy);
      cg.addColorStop(0,   'rgba(50,58,82,0.52)');
      cg.addColorStop(0.7, 'rgba(28,36,58,0.25)');
      cg.addColorStop(1,   'rgba(20,28,50,0.08)');
      _ctx.fillStyle = cg;
      _ctx.fillRect(0, 0, w, hy);

      // Cumulonimbus thunderheads — the "white-hot mountains"
      _clouds.filter(c => c.type === 'cumulonimbus').forEach(c =>
        _drawCloud(c, w, h, 0.80));
      // Dense cumulus advancing like avalanche — packed left-to-right
      _clouds.filter(c => c.type === 'cumulus').slice(0, 5).forEach(c =>
        _drawCloud({...c, y: c.y * 0.8}, w, h, 0.68));
      // A few backlit patches where light breaks through
      _clouds.filter(c => c.type === 'backlit').slice(0, 2).forEach(c =>
        _drawCloud(c, w, h, 0.42));

      // Rain streaks — diagonal, wind-driven
      _ctx.save();
      _ctx.strokeStyle = 'rgba(175,208,240,0.16)';
      _ctx.lineWidth   = 0.7;
      const rainPhase = (t * 0.55) % 90;
      for (let i = 0; i < 130; i++) {
        const rx = ((i * 139.3 + rainPhase) % w);
        const ry = ((i * 57   + t * 1.3  ) % (h * 0.88));
        _ctx.beginPath();
        _ctx.moveTo(rx, ry);
        _ctx.lineTo(rx - 2.5, ry + 16);  // slight diagonal = wind
        _ctx.stroke();
      }
      _ctx.restore();

    } else if (type === 'overcast') {
      // Overcast — "a labyrinth of vapour and shadow, endless and deliberate"
      // Dense layered cloud cover, advancing uniformly
      const og = _ctx.createLinearGradient(0, 0, 0, h * 0.65);
      og.addColorStop(0,   'rgba(72,80,102,0.38)');
      og.addColorStop(0.6, 'rgba(48,56,78,0.18)');
      og.addColorStop(1,   'rgba(35,42,62,0.06)');
      _ctx.fillStyle = og;
      _ctx.fillRect(0, 0, w, h * 0.65);
      // All cloud types layered — backlit gives lavender pearl shadows
      _clouds.filter(c => c.type === 'cumulus').forEach(c  => _drawCloud(c, w, h, 0.52));
      _clouds.filter(c => c.type === 'backlit').forEach(c  => _drawCloud(c, w, h, 0.45));
      _clouds.filter(c => c.type === 'wispy').slice(0, 3).forEach(c =>
        _drawCloud(c, w, h, 0.28));

    } else if (type === 'clouds') {
      // Scattered afternoon/evening — mix of fair cumulus + occasional drama
      const count = Math.floor(4 + _weatherSeed * 3);
      _clouds.filter(c => c.type === 'cumulus').slice(0, count).forEach(c =>
        _drawCloud(c, w, h, 0.42));
      // Occasional backlit where sun catches cloud edge
      _clouds.filter(c => c.type === 'backlit').slice(0, 2).forEach(c =>
        _drawCloud(c, w, h, 0.35));
      _clouds.filter(c => c.type === 'wispy').slice(0, 2).forEach(c =>
        _drawCloud(c, w, h, 0.22));

    } else {
      // Clear / light-cloud — distant wisps + maybe one cumulus on the horizon
      _clouds.filter(c => c.type === 'wispy').slice(0, 3).forEach(c =>
        _drawCloud(c, w, h, 0.20));
      if (_weatherSeed > 0.6) {
        _clouds.filter(c => c.type === 'cumulus').slice(0, 2).forEach(c =>
          _drawCloud(c, w, h, 0.25));
      }
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

    const hy = h * (mode === 'sleep' ? 0.60 : 0.65);
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

  // ── Fish school — slow, semi-transparent, zen ────────────
  // A quiet school drifts through every 40-80 seconds.
  // They move very slowly — this is NOT an aquarium screensaver.
  let _fishSpawnTimer = 1200; // initial delay before first school
  const _fishPool = [];       // active fish in current school

  function _spawnSchool(hy, h) {
    _fishPool.length = 0;
    const count   = 3 + Math.floor(Math.random() * 3);   // 3–5 fish
    const fromLeft = Math.random() > 0.5;
    // Very slow: cross screen in ~90s at 60fps (90*60 = 5400 frames, w/5400 per frame)
    const baseVx = (fromLeft ? 1 : -1) * (0.00018 + Math.random() * 0.00010);

    for (let i = 0; i < count; i++) {
      const offset = i * (fromLeft ? -0.045 : 0.045);  // stagger start positions
      _fishPool.push({
        x:       fromLeft ? (-0.06 + offset) : (1.06 + offset),
        yFrac:   hy / h + 0.06 + Math.random() * 0.13,  // below horizon
        yOff:    (Math.random() - 0.5) * h * 0.045,      // vertical scatter in school
        vx:      baseVx * (0.88 + Math.random() * 0.24), // slight individual variation
        life:    0,
        maxLife: 3600 + Math.random() * 1800,             // 60-90 s visible
        phase:   Math.random() * Math.PI * 2,
        size:    0.72 + Math.random() * 0.55,             // size variety
      });
    }
    // Next school in 40-80 s
    _fishSpawnTimer = 2400 + Math.random() * 2400;
  }

  function _drawFish(t, hr, mode) {
    const w = _canvas.width, h = _canvas.height;
    if (mode === 'focus' || hr < 6 || hr > 20) return;

    const hy = h * (mode === 'sleep' ? 0.60 : 0.65);
    _fishSpawnTimer--;

    // Spawn a new school when timer expires and pool is empty or finished
    if (_fishSpawnTimer <= 0 && _fishPool.every(f => !f.active && f.life >= f.maxLife)) {
      _spawnSchool(hy, h);
    }
    // Also spawn initially
    if (_fishPool.length === 0 && _fishSpawnTimer <= 0) _spawnSchool(hy, h);

    _fishPool.forEach(fish => {
      fish.x    += fish.vx;
      fish.life++;

      // Deactivate when off screen or exceeded life
      if (fish.life > fish.maxLife) return;
      if (fish.x < -0.15 || fish.x > 1.15) return;

      // Fade in first 3s, fade out last 3s
      const fadeFrames = 180;
      const fadeIn  = Math.min(fish.life, fadeFrames) / fadeFrames;
      const fadeOut = Math.min(fish.maxLife - fish.life, fadeFrames) / fadeFrames;
      const alpha   = Math.min(fadeIn, fadeOut) * 0.28;
      if (alpha < 0.01) return;

      const fx     = fish.x * w;
      const fy     = fish.yFrac * h + fish.yOff + Math.sin(fish.life * 0.04 + fish.phase) * 4;
      const facing = fish.vx > 0 ? 1 : -1;
      const sz     = fish.size;

      _ctx.save();
      _ctx.translate(fx, fy);
      _ctx.scale(facing, 1);

      // Body — soft teal, very transparent
      _ctx.beginPath();
      _ctx.ellipse(0, 0, 22 * sz, 7 * sz, 0, 0, Math.PI * 2);
      _ctx.fillStyle = `rgba(155,215,205,${alpha})`;
      _ctx.fill();

      // Subtle iridescent sheen on upper body
      _ctx.beginPath();
      _ctx.ellipse(-2 * sz, -2 * sz, 14 * sz, 3.5 * sz, -0.2, 0, Math.PI * 2);
      _ctx.fillStyle = `rgba(200,240,230,${alpha * 0.5})`;
      _ctx.fill();

      // Tail — forked, slightly more opaque
      _ctx.beginPath();
      _ctx.moveTo(-18 * sz, 0);
      _ctx.lineTo(-27 * sz, -7 * sz); _ctx.lineTo(-24 * sz, 0);
      _ctx.lineTo(-27 * sz,  7 * sz); _ctx.closePath();
      _ctx.fillStyle = `rgba(130,195,185,${alpha * 0.75})`;
      _ctx.fill();

      // Eye — dark, just visible
      _ctx.beginPath();
      _ctx.arc(14 * sz, -2 * sz, 2.2 * sz, 0, Math.PI * 2);
      _ctx.fillStyle = `rgba(25,55,75,${alpha * 1.5})`;
      _ctx.fill();

      _ctx.restore();
    });
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

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
    _initPan();
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
      if (hr < 11)   return { top:'#1258b0', mid:'#2a78d0', bot:'#62aae8' }; // late morning — clear blue
      if (hr < 12)   return { top:'#1a5898', mid:'#3870b8', bot:'#78a8d8' }; // approaching noon — slight warm haze
      if (hr < 13)   return { top:'#284870', mid:'#507090', bot:'#8898a8' }; // high noon — bleached, warm-white glare
      if (hr < 14)   return { top:'#2c5080', mid:'#4878a0', bot:'#7898b8' }; // early afternoon — still warm
      if (hr < 15)   return { top:'#1a5898', mid:'#3878c0', bot:'#70a8e0' }; // mid afternoon — blue returning
      if (hr < 16)   return { top:'#1460b8', mid:'#2c7cd4', bot:'#64a8ec' }; // hot afternoon — vivid blue
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
    const hy = h * (mode === 'sleep' ? 0.60 : 0.65);  // horizon Y — same as water
    const p = _skyPalette(hr, mode);

    // Fill ONLY the sky area (0..hy). Water fills below independently.
    // Never fill past the horizon — any colour held below will bleed through
    // the semi-transparent water gradient and create a coloured block.
    const g = _ctx.createLinearGradient(0, 0, 0, hy);
    g.addColorStop(0,    p.top);
    g.addColorStop(0.55, p.mid);
    g.addColorStop(1,    p.bot);   // ends exactly at horizon
    _ctx.fillStyle = g;
    _ctx.fillRect(0, 0, w, hy);

    // Below horizon: fill with near-black so water gradient blends into darkness
    // (not into sky colour). This is invisible once water is drawn on top.
    _ctx.fillStyle = '#010508';
    _ctx.fillRect(0, hy, w, h - hy);

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
      // Daytime atmospheric haze — very faint, entirely within sky, fades to 0 at horizon
      const peak = 0.06 + 0.03 * Math.sin(((hr - 8) / 9) * Math.PI);
      const hg = _ctx.createLinearGradient(0, h * 0.35, 0, h * 0.63);
      hg.addColorStop(0,   'rgba(210,232,255,0)');
      hg.addColorStop(0.4, `rgba(210,232,255,${peak})`);
      hg.addColorStop(1,   'rgba(210,232,255,0)');
      _ctx.fillStyle = hg;
      _ctx.fillRect(0, h * 0.35, w, h * 0.28);

      // Noon glare — warm yellow-white bloom at high noon (11:30–14:30)
      // Peaks at 13:00 SGT (sun is almost exactly overhead in Singapore)
      if (hr >= 11.5 && hr < 14.5) {
        const noonT = Math.sin(((hr - 11.5) / 3.0) * Math.PI);  // 0→1→0 bell
        const glare = noonT * 0.18;
        // Wide radial from sun position (upper-middle sky)
        const sunX = w * 0.5;
        const sunY = h * 0.18;
        const ng = _ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, w * 0.65);
        ng.addColorStop(0,   `rgba(255,248,200,${glare * 0.9})`);
        ng.addColorStop(0.3, `rgba(255,230,140,${glare * 0.4})`);
        ng.addColorStop(0.6, `rgba(255,210,80,${glare * 0.10})`);
        ng.addColorStop(1,   'rgba(255,200,60,0)');   // fades to 0 — no edge
        _ctx.fillStyle = ng;
        // Draw as a circle arc so no rectangular edge is visible
        _ctx.beginPath();
        _ctx.arc(sunX, sunY, w * 0.65, 0, Math.PI * 2);
        _ctx.fill();
      }
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
      _drawRealStars(t, hr, mode, nightness);
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
    const horizonY = h * 0.65;  // hard ceiling — mist never crosses into water
    for (let i = 0; i < layers; i++) {
      const cy    = h * (0.36 + i * 0.07);  // stays in upper sky, well above horizon
      if (cy > horizonY * 0.90) continue;   // skip any layer that would bleed over
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
    // Horizon position responds to vertical tilt: look up = horizon drops down
    const hyBase = h * (mode === 'sleep' ? 0.60 : 0.65);
    const hy = Math.min(h * 0.92, Math.max(h * 0.20,
      hyBase + _panAlt * (hyBase / 90)));  // each degree shifts ~1% of sky height
    const wH = h - hy;
    const mA = mode === 'sleep' ? 1.6 : 1.0;

    const isDawn = hr >= 5.5 && hr < 8;
    const isDusk = hr >= 17  && hr < 20;
    const isDay  = hr >= 8   && hr < 17;
    // Sky-reflection tint at horizon matches sky bot palette
    const sR = isDawn||isDusk ? 200 : isDay ? 80  : 22;
    const sG = isDawn||isDusk ? 120 : isDay ? 155 : 48;
    const sB = isDawn||isDusk ?  55 : isDay ? 220 : 125;

    // ── 1. Water gradient — derives top colour from live sky palette ──
    // Reading the exact sky-bot hex and starting from it at alpha 0
    // means the water begins as an invisible continuation of the sky,
    // with zero visible seam at the horizon line.
    const skyBot = _skyPalette(hr, mode).bot;
    const bn = parseInt(skyBot.slice(1), 16);
    const bR = (bn >> 16) & 255, bG = (bn >> 8) & 255, bB = bn & 255;

    const wg = _ctx.createLinearGradient(0, hy, 0, h);
    wg.addColorStop(0,    `rgba(${bR},${bG},${bB},0.00)`);   // exact sky colour, invisible
    wg.addColorStop(0.06, `rgba(${bR},${bG},${bB},0.22)`);   // gentle tint appears
    wg.addColorStop(0.20, `rgba(${Math.round(bR*0.42)},${Math.round(bG*0.38)},${Math.round(bB*0.62)},0.78)`);
    wg.addColorStop(0.50, 'rgba(4,15,50,0.94)');
    wg.addColorStop(1,    'rgba(1,5,18,0.98)');
    _ctx.fillStyle = wg;
    _ctx.fillRect(0, hy, w, wH);

    // ── 2. Wave crests — three depth bands, perspective-correct spacing ──
    // Band A (far / horizon):  many thin hairlines, tightly packed, very slow
    // Band B (mid / open sea): moderate swell, occasional taller rogue wave
    // Band C (near / viewer):  thick foam crests, rolling slower, most amplitude
    //
    // Spacing uses p^2.4 so near-viewer rows spread MUCH further apart than
    // far rows — strong sense of receding distance.

    const BANDS = [
      // [ count, pStart, pEnd, ampScale, spdBase, spdScale, freqBase, freqScale, lwBase, lwScale, alphaBase, alphaScale ]
      [28, 0.00, 0.40, 0.8,  0.0012, 0.002,  0.009, 0.003,  0.3, 0.5,  0.020, 0.08 ],  // A: far
      [14, 0.40, 0.72, 1.4,  0.0020, 0.006,  0.006, 0.002,  0.8, 1.4,  0.060, 0.16 ],  // B: mid
      [ 8, 0.72, 1.00, 2.2,  0.0030, 0.010,  0.004, 0.001,  1.8, 3.2,  0.140, 0.18 ],  // C: near
    ];

    BANDS.forEach(([N, p0, p1, ampSc, spdB, spdSc, frqB, frqSc, lwB, lwSc, alB, alSc], bi) => {
      for (let i = 0; i < N; i++) {
        // Non-linear spacing within each band — pack more rows toward far edge
        const tRaw = i / N;
        const t2   = tRaw ** (bi === 0 ? 2.0 : bi === 1 ? 1.5 : 1.2);
        const p    = p0 + (p1 - p0) * t2;       // 0→1 fraction across whole sea

        const y    = hy + wH * p;

        // Amplitude: grows steeply with depth; occasional rogue wave in mid band
        let amp = p * p * 14 * mA * ampSc;
        if (bi === 1 && (i % 5 === 2)) amp *= 2.1;   // rogue swell — taller

        const freq = frqB * (1 - p * 0.85) + frqSc;
        const spd  = spdB + p * spdSc;

        // Each wave has its own phase offset so they don't all crest together
        const ph1 = bi * 4.2 + i * 0.72 + t * spd;
        const ph2 = bi * 2.7 + i * 1.18 + t * spd * 0.48 + 1.8;
        // Secondary micro-ripple on near waves
        const ph3 = i * 2.3  + t * spd * 1.6 + 3.5;

        const wyv = (x) => {
          let v = amp * (
            Math.sin(x * freq        + ph1) * 0.60 +
            Math.sin(x * freq * 1.82 + ph2) * 0.30
          );
          if (bi === 2) v += amp * 0.18 * Math.sin(x * freq * 3.1 + ph3);  // ripple
          return y + v;
        };

        const alpha = alB + p * alSc;
        const lw    = lwB + p * lwSc;

        _ctx.beginPath();
        _ctx.moveTo(0, wyv(0));
        // Far rows: coarser step (performance); near rows: smoother
        const step = bi === 0 ? 6 : bi === 1 ? 4 : 3;
        for (let x = step; x <= w; x += step) _ctx.lineTo(x, wyv(x));
        _ctx.strokeStyle = `rgba(210,238,255,${alpha})`;
        _ctx.lineWidth   = lw;
        _ctx.stroke();

        // Foam highlight on mid and near crests
        if (bi >= 1 && p > 0.5) {
          _ctx.beginPath();
          _ctx.moveTo(0, wyv(0) - lw * 0.35);
          for (let x = step; x <= w; x += step) _ctx.lineTo(x, wyv(x) - lw * 0.35);
          _ctx.strokeStyle = `rgba(255,255,255,${alpha * (bi === 2 ? 0.55 : 0.30)})`;
          _ctx.lineWidth   = lw * (bi === 2 ? 0.40 : 0.25);
          _ctx.stroke();
        }
      }
    });
  }

  // ── Islands — silhouettes at fixed azimuths, visible when panning ──
  // Three islands at different bearings from Singapore (approximate).
  // Each is a low, dark landmass silhouette on the horizon, with subtle
  // atmospheric haze for depth. Only drawn when their azimuth is in view.
  // Islands at realistic bearings from Singapore.
  // dist: 0=near (dark, saturated), 1=far (pale, hazy, blue-shifted)
  // cluster: optional companion islands drawn offset
  const _ISLANDS = [
    // Batam — large, far, low rolling hills
    { az: 78,  dist: 0.75, width: 0.30, height: 0.048,
      bumps: [0.15,0.38,0.60,0.78,1.0,0.88,0.70,0.50,0.30,0.12],
      cluster: [{ dAz: -8, w: 0.08, h: 0.022, bumps: [0.3,0.6,1.0,0.7,0.2] }] },

    // Sentosa / southern cluster — closer, multiple small bumps
    { az: 198, dist: 0.25, width: 0.14, height: 0.040,
      bumps: [0.2,0.5,0.9,1.0,0.8,0.6,0.3],
      cluster: [
        { dAz:  6, w: 0.06, h: 0.028, bumps: [0.4,0.8,1.0,0.5,0.2] },
        { dAz: -5, w: 0.04, h: 0.018, bumps: [0.3,0.7,1.0,0.4] },
      ] },

    // Northwest island — medium distance, steep profile like a forested hill
    { az: 305, dist: 0.50, width: 0.10, height: 0.055,
      bumps: [0.1,0.4,0.8,1.0,0.9,0.5,0.2],
      cluster: [{ dAz: 7, w: 0.05, h: 0.020, bumps: [0.2,0.5,1.0,0.6,0.1] }] },
  ];

  // Draw one island silhouette (shared by main islands and cluster companions)
  function _drawOneIsland(cx, baseY, iw, ih, dist, isNight, isDusk, isNoon) {
    const w = _canvas.width;
    // dist 0=near/dark, 1=far/pale/blue-shifted
    // Near: dark green-grey; Far: blue-grey atmospheric; Night: near=inky, far=navy
    let r, g, b;
    if (isNight) {
      r = Math.round(6  + dist * 18);
      g = Math.round(10 + dist * 20);
      b = Math.round(24 + dist * 38);
    } else if (isDusk) {
      r = Math.round(18 + dist * 40);
      g = Math.round(22 + dist * 28);
      b = Math.round(38 + dist * 42);
    } else if (isNoon) {
      // Noon: near=warm olive-grey, far=pale bleached blue
      r = Math.round(55 - dist * 18);
      g = Math.round(68 - dist * 10);
      b = Math.round(60 + dist * 60);
    } else {
      // Day: near=dark green-grey, far=pale blue
      r = Math.round(28 + dist * 30);
      g = Math.round(42 + dist * 18);
      b = Math.round(48 + dist * 65);
    }

    const hazeA  = 0.18 + dist * 0.55;    // far islands nearly invisible
    const bodyA  = (isNight ? 0.80 : 0.55) * (1 - dist * 0.45);

    _ctx.save();
    _ctx.globalAlpha = bodyA;
    _ctx.beginPath();
    _ctx.moveTo(cx - iw * 0.5, baseY);
    const bumps = arguments[8] || [0.3,0.6,1.0,0.7,0.3];  // fallback
    const n = bumps.length;
    for (let bi = 0; bi <= n; bi++) {
      const bx   = cx - iw * 0.5 + (bi / n) * iw;
      const bump = bi < n ? bumps[bi] : 0;
      _ctx.lineTo(bx, baseY - ih * bump);
    }
    _ctx.lineTo(cx + iw * 0.5, baseY);
    _ctx.closePath();
    _ctx.fillStyle = `rgb(${r},${g},${b})`;
    _ctx.fill();
    _ctx.restore();

    // Atmospheric haze — radial gradient centred on island, fades to 0 on ALL sides.
    // No fillRect; draw a large circle so edges are never visible.
    {
      const hr2 = isNight ? 140 : 185;
      const hg2 = isNight ? 160 : 205;
      const hb2 = isNight ? 190 : 230;
      // Wide elliptical haze: scale canvas context so radial gradient becomes elliptical
      const hazeW = iw * 2.8;
      const hazeH = ih * 3.5;
      const hacx  = cx, hacy = baseY - ih * 0.5;
      _ctx.save();
      _ctx.scale(1, hazeH / hazeW);   // squish vertically into ellipse
      const hg = _ctx.createRadialGradient(
        hacx, hacy * (hazeW / hazeH), 0,
        hacx, hacy * (hazeW / hazeH), hazeW * 0.5
      );
      hg.addColorStop(0,   `rgba(${hr2},${hg2},${hb2},${hazeA * 0.20})`);
      hg.addColorStop(0.5, `rgba(${hr2},${hg2},${hb2},${hazeA * 0.08})`);
      hg.addColorStop(1,   `rgba(${hr2},${hg2},${hb2},0)`);
      _ctx.fillStyle = hg;
      // Draw oversized circle — gradient already fades to 0 at edge so no rectangle
      _ctx.beginPath();
      _ctx.arc(hacx, hacy * (hazeW / hazeH), hazeW * 0.5, 0, Math.PI * 2);
      _ctx.fill();
      _ctx.restore();
    }

    // Night settlement glow — pure radial, drawn as circle arc (no fillRect)
    if (isNight && dist < 0.7) {
      _ctx.save();
      const glcx = cx, glcy = baseY - ih * 0.45;
      const glR  = iw * 0.50;
      const gl = _ctx.createRadialGradient(glcx, glcy, 0, glcx, glcy, glR);
      gl.addColorStop(0,   `rgba(255,200,80,${0.10 * (1 - dist)})`);
      gl.addColorStop(0.6, `rgba(255,180,60,${0.04 * (1 - dist)})`);
      gl.addColorStop(1,   'rgba(255,160,40,0)');
      _ctx.fillStyle = gl;
      _ctx.beginPath();
      _ctx.arc(glcx, glcy, glR, 0, Math.PI * 2);
      _ctx.fill();
      _ctx.restore();
    }
  }

  function _drawIslands(hr, mode) {
    const w  = _canvas.width, h = _canvas.height;
    const hyBase = h * (mode === 'sleep' ? 0.60 : 0.65);
    const hy = Math.min(h * 0.92, Math.max(h * 0.20,
      hyBase + _panAlt * (hyBase / 90)));

    if (hy > h * 0.95 || hy < h * 0.10) return;

    const isNight = hr < 6 || hr >= 20;
    const isDusk  = hr >= 17 && hr < 20;
    const isNoon  = hr >= 11 && hr < 14;

    _ISLANDS.forEach(isl => {
      let relAz = ((isl.az - _panAz + 540) % 360) - 180;
      if (Math.abs(relAz) > 90) return;

      const cx  = w * 0.5 + (relAz / 90) * w * 0.5;
      const iw  = w * isl.width;
      const ih  = hy * isl.height;

      // Main island
      _drawOneIsland(cx, hy, iw, ih, isl.dist, isNight, isDusk, isNoon, isl.bumps);

      // Companion cluster islands
      (isl.cluster || []).forEach(cl => {
        let cRelAz = ((isl.az + cl.dAz - _panAz + 540) % 360) - 180;
        if (Math.abs(cRelAz) > 90) return;
        const ccx = w * 0.5 + (cRelAz / 90) * w * 0.5;
        const ciw = w * cl.w;
        const cih = hy * cl.h;
        // Companions are slightly farther than the main island
        _drawOneIsland(ccx, hy, ciw, cih, Math.min(1, isl.dist + 0.15), isNight, isDusk, isNoon, cl.bumps);
      });
    });
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

  // Draw a soft radial gradient blob — the primitive used by ALL cloud types.
  // Pure radial gradients have zero hard edges; overlapping blobs = natural cloud mass.
  function _blob(x, y, rx, ry, colStop0, colStop1, a) {
    _ctx.save();
    _ctx.scale(1, ry / rx);   // squash to ellipse without clipping
    const g = _ctx.createRadialGradient(x, y * rx/ry, 0, x, y * rx/ry, rx);
    g.addColorStop(0,   colStop0.replace('A', String(a)));
    g.addColorStop(0.45,colStop1.replace('A', String(a * 0.55)));
    g.addColorStop(1,   colStop0.replace(/,[^,)]+\)/, ',0)'));  // same colour, alpha=0
    _ctx.fillStyle = g;
    _ctx.fillRect(x - rx, (y - ry) * rx/ry, rx * 2, ry * 2);
    _ctx.restore();
  }

  function _drawCloud(c, w, h, alpha) {
    const cx = c.x * w, cy = c.y * h;
    const cw = c.w * w, ch = c.h * h;
    const type = c.type || 'cumulus';
    const hy   = h * 0.65;
    if (cy > hy) return;  // never render into water

    if (type === 'wispy') {
      // Cirrus: 2-3 overlapping elongated gradient blobs, slight tilt each
      // No filled path at all — pure gradient rectangles fade to 0 at edges
      const tilt = (c.seed - 0.5) * 0.22;
      _ctx.save();
      _ctx.translate(cx, cy);
      _ctx.rotate(tilt);
      const g1 = _ctx.createLinearGradient(-cw*0.52, 0, cw*0.52, 0);
      g1.addColorStop(0,    'rgba(255,255,255,0)');
      g1.addColorStop(0.22, `rgba(255,255,255,${alpha*0.18})`);
      g1.addColorStop(0.5,  `rgba(255,255,255,${alpha*0.26})`);
      g1.addColorStop(0.78, `rgba(255,255,255,${alpha*0.18})`);
      g1.addColorStop(1,    'rgba(255,255,255,0)');
      const vg1 = _ctx.createLinearGradient(0, -ch*0.12, 0, ch*0.12);
      vg1.addColorStop(0, 'rgba(0,0,0,0)');
      vg1.addColorStop(0.5,`rgba(255,255,255,1)`);
      vg1.addColorStop(1, 'rgba(0,0,0,0)');
      // Use composite: draw horizontal gradient masked by vertical gradient
      _ctx.globalAlpha = 1;
      _ctx.fillStyle = g1;
      _ctx.fillRect(-cw*0.52, -ch*0.12, cw*1.04, ch*0.24);
      // Second thinner streamer slightly offset
      _ctx.rotate(0.06);
      const g2 = _ctx.createLinearGradient(-cw*0.35, 0, cw*0.35, 0);
      g2.addColorStop(0,   'rgba(255,255,255,0)');
      g2.addColorStop(0.5, `rgba(255,255,255,${alpha*0.14})`);
      g2.addColorStop(1,   'rgba(255,255,255,0)');
      _ctx.fillStyle = g2;
      _ctx.fillRect(-cw*0.35, ch*0.04, cw*0.70, ch*0.14);
      _ctx.restore();

    } else if (type === 'cumulus') {
      // Cumulus: cluster of overlapping soft radial blobs — no hard outlines.
      // Blob radius derived from cw so blobs stay roughly as wide as they are tall.
      const nBlob = 4 + Math.round(c.seed * 2);
      const bR    = cw * 0.22;   // base blob radius — same scale in x and y
      for (let b = 0; b < nBlob; b++) {
        const t   = b / (nBlob - 1);
        const bx  = cx + (t - 0.5) * cw * 0.80;
        const by  = cy - bR * 0.55 * Math.sin(t * Math.PI); // gentle arc
        const br  = bR * (0.80 + Math.sin(b * 1.8 + c.seed * 5) * 0.20);
        const lum = b === 0 || b === nBlob-1 ? 232 : 250;
        const gr  = _ctx.createRadialGradient(bx, by, 0, bx, by, br * 2.0);
        gr.addColorStop(0,   `rgba(${lum},${lum+2},255,${alpha * 0.58})`);
        gr.addColorStop(0.5, `rgba(${lum},${lum},252,${alpha * 0.24})`);
        gr.addColorStop(1,   'rgba(240,244,255,0)');
        _ctx.fillStyle = gr;
        _ctx.fillRect(bx - br*2.0, by - br*2.0, br*4.0, br*4.0);
      }
      // Subtle flat shadow underside
      const sg = _ctx.createRadialGradient(cx, cy + bR*0.8, 0, cx, cy + bR*0.8, cw*0.40);
      sg.addColorStop(0,   `rgba(160,175,210,${alpha * 0.18})`);
      sg.addColorStop(1,   'rgba(160,175,210,0)');
      _ctx.fillStyle = sg;
      _ctx.fillRect(cx - cw*0.40, cy, cw*0.80, bR*2.0);

    } else if (type === 'backlit') {
      // Backlit: 3-5 overlapping radial blobs. Warm cream cores, lavender halos.
      // Each blob offset slightly — looks like light punching through cloud mass.
      const nBlob = 3 + Math.round(c.seed * 2);
      const bR    = cw * 0.32;   // radius based only on cloud width, not height
      for (let b = 0; b < nBlob; b++) {
        const t   = b / (nBlob - 1);
        const bx  = cx + (t - 0.5) * cw * 0.72;
        const by  = cy + Math.sin(t * Math.PI + c.seed) * ch * 0.3;
        // Lavender halo
        const lg  = _ctx.createRadialGradient(bx + bR*0.1, by + bR*0.1, 0, bx, by, bR * 2.0);
        lg.addColorStop(0,   `rgba(185,165,230,${alpha * 0.38})`);
        lg.addColorStop(0.6, `rgba(175,155,225,${alpha * 0.12})`);
        lg.addColorStop(1,   'rgba(180,160,228,0)');
        _ctx.fillStyle = lg;
        _ctx.fillRect(bx - bR*2, by - bR*2, bR*4, bR*4);
        // Cream pearl core
        const cg  = _ctx.createRadialGradient(bx, by, 0, bx, by, bR * 1.1);
        cg.addColorStop(0,   `rgba(255,252,248,${alpha * 0.65})`);
        cg.addColorStop(0.4, `rgba(250,248,255,${alpha * 0.30})`);
        cg.addColorStop(1,   'rgba(248,246,255,0)');
        _ctx.fillStyle = cg;
        _ctx.fillRect(bx - bR*1.1, by - bR*1.1, bR*2.2, bR*2.2);
      }

    } else if (type === 'cumulonimbus') {
      // Thunderhead — all radial gradients, no filled paths, no hard edges.
      // Dark base blob → stacked lighter tower blobs → wide anvil blob at top.
      // Tower height capped to avoid massive blobs on tall screens.
      // Use cw (cloud width) as the primary scale reference — width is
      // already sensibly bounded by canvas width fraction.
      const base  = cy + Math.min(ch, cw * 0.3) * 0.5;
      const tower = Math.min(ch * 1.8, cw * 1.2);  // cap at ~1× cloud width tall
      const tW    = cw * 0.30;

      // Dark base: wide flat radial blob
      const bg = _ctx.createRadialGradient(cx, base, 0, cx, base, cw * 0.55);
      bg.addColorStop(0,   `rgba(48,55,80,${alpha * 0.82})`);
      bg.addColorStop(0.5, `rgba(35,42,65,${alpha * 0.45})`);
      bg.addColorStop(1,   'rgba(30,38,60,0)');
      _ctx.fillStyle = bg; _ctx.fillRect(cx - cw*0.55, base - cw*0.15, cw*1.1, cw*0.30);

      // Tower: 6 stacked radial blobs, narrowing and brightening upward
      for (let ti = 0; ti < 6; ti++) {
        const p  = ti / 5;
        const ty = base - tower * (p * 0.78 + 0.06);
        const tr = tW * (1 - p * 0.28) * (0.78 + Math.sin(ti * 1.6 + c.seed * 4) * 0.22);
        const lum = Math.round(145 + p * 100);
        const tg = _ctx.createRadialGradient(cx + (c.seed-0.5)*6*p, ty, 0, cx, ty, tr * 2.0);
        tg.addColorStop(0,   `rgba(${lum},${lum},${lum+8},${alpha*(0.48+p*0.28)})`);
        tg.addColorStop(0.55,`rgba(${lum},${lum},${lum+5},${alpha*(0.18+p*0.12)})`);
        tg.addColorStop(1,   `rgba(${lum},${lum},${lum},0)`);
        _ctx.fillStyle = tg; _ctx.fillRect(cx - tr*2, ty - tr*1.2, tr*4, tr*2.4);
      }

      // Lavender mid-shadow blob
      const lv = _ctx.createRadialGradient(cx, base - tower*0.44, 0, cx, base - tower*0.44, tW*1.2);
      lv.addColorStop(0,  `rgba(148,128,195,${alpha * 0.22})`);
      lv.addColorStop(1,  'rgba(148,128,195,0)');
      _ctx.fillStyle = lv; _ctx.fillRect(cx - tW*1.2, base - tower*0.44 - tW, tW*2.4, tW*2);

      // Anvil top: wide flat blob
      const av = _ctx.createRadialGradient(cx, base - tower*0.80, 0, cx, base - tower*0.80, cw*0.65);
      av.addColorStop(0,   `rgba(248,250,255,${alpha*0.55})`);
      av.addColorStop(0.4, `rgba(240,245,255,${alpha*0.22})`);
      av.addColorStop(1,   'rgba(240,244,255,0)');
      _ctx.fillStyle = av; _ctx.fillRect(cx - cw*0.65, base - tower*0.80 - cw*0.12, cw*1.3, cw*0.24);
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

  // ── Surreal sky lights — subtle, otherworldly, calming ───────
  // A few slow-breathing luminous forms drifting through the sky.
  // No hard edges, no animals — just light and atmosphere.
  // ── Real star catalog (J2000) — [RA°, Dec°, magnitude, name] ──
  const _starCat = [
    [101.29, -16.72, -1.46,'Sirius'],   [95.99, -52.70, -0.72,'Canopus'],
    [213.92,  19.18, -0.05,'Arcturus'], [279.23,  38.78,  0.03,'Vega'],
    [79.17,   45.99,  0.08,'Capella'],  [78.63,   -8.20,  0.12,'Rigel'],
    [114.83,   5.22,  0.34,'Procyon'],  [88.79,    7.41,  0.42,'Betelgeuse'],
    [24.43,  -57.24,  0.46,'Achernar'],[210.96, -60.37,  0.61,'Hadar'],
    [297.70,   8.87,  0.76,'Altair'],   [186.65, -63.10,  0.77,'Acrux'],
    [68.98,   16.51,  0.85,'Aldebaran'],[201.30, -11.16,  0.97,'Spica'],
    [247.35, -26.43,  1.06,'Antares'], [116.33,  28.03,  1.14,'Pollux'],
    [344.41, -29.62,  1.16,'Fomalhaut'],[310.36,  45.28,  1.25,'Deneb'],
    [152.09,  11.97,  1.35,'Regulus'], [104.66, -28.97,  1.50,'Adhara'],
    [81.28,    6.35,  1.64,'Bellatrix'],[84.05,  -1.20,  1.70,'Alnilam'],
    [85.19,   -1.94,  1.74,'Alnitak'], [276.04, -34.38,  1.85,'Kaus Aust'],
    [263.40, -37.10,  1.62,'Shaula'],  [141.90,  -8.66,  1.99,'Alphard'],
    [283.82, -26.30,  2.02,'Nunki'],   [187.79, -57.11,  1.59,'Gacrux'],
    [191.93, -59.69,  1.25,'Mimosa'],  [193.51,  55.96,  1.76,'Alioth'],
    [206.89,  49.31,  1.85,'Alkaid'],  [165.93,  61.75,  1.79,'Dubhe'],
    [252.17, -69.03,  1.91,'Atria'],   [306.41, -56.74,  1.94,'Peacock'],
    [37.95,   89.26,  1.97,'Polaris'], [31.79,   23.46,  2.00,'Hamal'],
    [10.90,  -17.99,  2.02,'Diphda'],  [200.98,  54.93,  2.04,'Mizar'],
    [154.99,  19.84,  2.01,'Algieba'], [65.74,   16.51,  2.87,'Alcyone'],
    [113.65,  31.89,  1.57,'Castor'],  [131.18, -54.71,  1.96,'Alsephina'],
  ];
  // Singapore: lat 1.352°N, lon 103.820°E
  const _LAT = 1.352 * Math.PI / 180;
  const _LON = 103.820;

  function _lst() {
    const jd  = Date.now() / 86400000 + 2440587.5;
    const T   = (jd - 2451545) / 36525;
    const g   = (280.46061837 + 360.98564736629 * (jd - 2451545) + 0.000387933 * T * T);
    return ((g % 360 + 360) % 360 + _LON + 360) % 360;   // LST in degrees
  }

  // Convert RA/Dec → screen x,y using azimuth+altitude pan.
  // _panAz: horizontal centre (degrees). _panAlt: vertical tilt (degrees, +up).
  function _starScreen(ra, dec, panAz, w, h) {
    const ha   = (_lst() - ra + 360) % 360;
    const haR  = ha  * Math.PI / 180;
    const decR = dec * Math.PI / 180;
    const altRad = Math.asin(Math.sin(decR)*Math.sin(_LAT) + Math.cos(decR)*Math.cos(_LAT)*Math.cos(haR));
    const altDeg = altRad * 180 / Math.PI;

    const az   = Math.atan2(Math.sin(haR), Math.cos(haR)*Math.sin(_LAT) - Math.tan(decR)*Math.cos(_LAT));
    const azDeg = ((az * 180 / Math.PI) + 180 + 360) % 360;

    // Relative azimuth/altitude from current view centre
    let relAz  = ((azDeg - panAz + 540) % 360) - 180;
    let relAlt = altDeg - _panAlt;   // positive = above view centre

    // Field of view ±95° horizontal, ±70° vertical
    if (Math.abs(relAz) > 95 || relAlt < -15 || relAlt > 90) return null;

    // When tilted up, horizon moves down on screen.
    // altFrac: 0 at view-centre alt, proportional above/below.
    const hy    = h * 0.65;               // default horizon screen Y
    // horizon offset from tilt: _panAlt degrees shifts it by altPxPerDeg
    const altPxPerDeg = hy / 90;          // 90° = full sky height
    const horizY = hy + _panAlt * altPxPerDeg;   // screen Y of horizon after tilt

    const sx  = w * 0.5 + (relAz  / 90) * w * 0.5;
    const sy  = horizY  - (relAlt / 90) * hy;    // above horizon = smaller Y

    // Clip: don't draw stars below tilted horizon or above screen
    if (sy > horizY || sy < 0 || altDeg < 0) return null;

    return { sx, sy };
  }

  let _panAz    = 180;   // horizontal azimuth (degrees); 180 = looking south
  let _panAlt   = 0;     // vertical tilt (degrees); 0 = horizon centred; +up, −down; clamped ±50
  let _panDragX = null;
  let _panDragY = null;

  function _initPan() {
    // Listen on document — canvas has pointer-events:none so it can't receive events
    function onDown(e) {
      const tag = e.target ? e.target.tagName.toUpperCase() : '';
      if (['BUTTON','INPUT','SELECT','TEXTAREA','A','LABEL'].includes(tag)) return;
      _panDragX = (e.touches ? e.touches[0].clientX  : e.clientX);
      _panDragY = (e.touches ? e.touches[0].clientY  : e.clientY);
    }
    function onMove(e) {
      if (_panDragX === null) return;
      const cx   = (e.touches ? e.touches[0].clientX : e.clientX);
      const cy   = (e.touches ? e.touches[0].clientY : e.clientY);
      const dX   = cx - _panDragX;
      const dY   = cy - _panDragY;

      // Horizontal: rotate azimuth
      _panAz = (_panAz - dX * 0.12 + 360) % 360;

      // Vertical: tilt ±50° (drag up = look up = positive alt)
      _panAlt = Math.max(-50, Math.min(50, _panAlt - dY * 0.10));

      // Shift cloud/aurora x with horizontal pan
      const frac = dX / (window.innerWidth || 1200) * 0.08;
      _auroraClusters.forEach(cl => { cl.x = ((cl.x + frac) % 1.4 + 1.4) % 1.4 - 0.1; });
      _clouds.forEach(c => { c.x = ((c.x + frac) % 1.6 + 1.6) % 1.6 - 0.15; });

      _panDragX = cx;
      _panDragY = cy;
      _starPositions = null;  // force star reproject
    }
    function onUp() { _panDragX = null; _panDragY = null; }
    document.addEventListener('mousedown',  onDown);
    document.addEventListener('mousemove',  onMove);
    document.addEventListener('mouseup',    onUp);
    document.addEventListener('touchstart', onDown, { passive: true });
    document.addEventListener('touchmove',  onMove, { passive: true });
    document.addEventListener('touchend',   onUp);
  }

  // Cache star positions — recompute every 60 s (stars move slowly)
  let _starPositions = null, _starPosTime = 0;
  function _getStarPositions(w, h) {
    if (Date.now() - _starPosTime > 60000) {
      _starPositions = _starCat.map(([ra, dec, mag, name]) => {
        const pos = _starScreen(ra, dec, _panAz, w, h);
        return pos ? { sx: pos.sx, sy: pos.sy, mag, name } : null;
      }).filter(Boolean);
      _starPosTime = Date.now();
    }
    // Re-apply pan to cached positions cheaply (pan changes sx only)
    return _starPositions;
  }

  // ── Draw real stars (night / sleep mode) ─────────────────────
  function _drawRealStars(t, hr, mode, nightness) {
    if (nightness < 0.05 && mode !== 'sleep') return;
    const w = _canvas.width, h = _canvas.height;
    // Invalidate cache on pan change so stars re-project immediately
    _starPositions = null;
    const stars = _getStarPositions(w, h);
    const alpha = Math.min(0.98, nightness * 1.1 + (mode === 'sleep' ? 0.3 : 0));

    stars.forEach(s => {
      const twinkle = 0.75 + 0.25 * Math.sin(t * 0.015 + s.mag * 3.7);
      const a = alpha * twinkle;
      const r = Math.max(0.5, 2.8 - s.mag * 0.85);   // bright star = larger dot
      // Soft glow for very bright stars (mag < 1)
      if (s.mag < 1.0) {
        const glow = _ctx.createRadialGradient(s.sx, s.sy, 0, s.sx, s.sy, r * 5);
        glow.addColorStop(0, `rgba(230,240,255,${a * 0.35})`);
        glow.addColorStop(1, 'rgba(200,220,255,0)');
        _ctx.fillStyle = glow;
        _ctx.fillRect(s.sx - r*5, s.sy - r*5, r*10, r*10);
      }
      _ctx.beginPath();
      _ctx.arc(s.sx, s.sy, r, 0, Math.PI * 2);
      // Colour tint: blue-white for hot stars, warm yellow for cool (rough)
      const starHue = s.mag < 0.5 ? '220,235,255' : s.mag < 1.5 ? '230,240,255' : '255,248,230';
      _ctx.fillStyle = `rgba(${starHue},${a})`;
      _ctx.fill();
    });
  }

  // ── Aurora wisps — horizontal curtains, grouped, not circles ──
  // 3 clusters of 2-3 overlapping elongated wisps per cluster.
  const _auroraClusters = Array.from({length: 3}, (_, ci) => ({
    x:    0.15 + ci * 0.34,
    y:    0.06 + ci * 0.04 + Math.random() * 0.10,
    vx:   (ci % 2 ? 1 : -1) * (0.000012 + Math.random() * 0.000010),
    hues: [[195,220],[250,195],[175,205]][ci],  // two hues per cluster for shimmer
    wisps: Array.from({length: 2 + (ci === 1 ? 1 : 0)}, (_, wi) => ({
      dxF:  (wi - 0.5) * 0.14,       // x offset as fraction of w
      dyF:   wi        * 0.018,
      wF:   0.28 + wi  * 0.08,        // width fraction of w
      hF:   0.022 + wi * 0.006,       // height fraction of h
      phase: Math.random() * Math.PI * 2,
      pulse: 0.005 + Math.random() * 0.004,
    })),
  }));

  function _drawSkyLights(t, hr, mode) {
    if (mode === 'focus') return;
    const w = _canvas.width, h = _canvas.height;
    const hy = h * 0.65;

    const isDay = hr >= 9 && hr < 16;
    const baseAlpha = isDay ? 0.020
                    : (hr >= 6 && hr < 9) || (hr >= 16 && hr < 20) ? 0.055
                    : 0.080;

    _auroraClusters.forEach(cl => {
      cl.x += cl.vx;
      if (cl.x < -0.2) cl.x = 1.2;
      if (cl.x >  1.2) cl.x = -0.2;

      cl.wisps.forEach(ws => {
        const cy = (cl.y + ws.dyF) * h;
        if (cy > hy * 0.88) return;   // never cross into water

        const breath = (Math.sin(t * ws.pulse + ws.phase) + 1) / 2;
        const alpha  = baseAlpha * (0.35 + 0.65 * breath);
        if (alpha < 0.005) return;

        const cx  = (cl.x + ws.dxF) * w;
        const rw  = ws.wF * w;    // wide
        const rh  = ws.hF * h;    // tall (small) — elongated horizontal wisp

        // Gradient fades to zero at both ends (horizontal) and top/bottom (vertical)
        // Use ellipse clipping so it's a proper soft-edged oval, not a rectangle band
        _ctx.save();
        _ctx.beginPath();
        _ctx.ellipse(cx, cy, rw, rh, 0, 0, Math.PI * 2);
        _ctx.clip();

        const g = _ctx.createRadialGradient(cx, cy, 0, cx, cy, rw);
        g.addColorStop(0,    `hsla(${cl.hues[0]},70%,88%,${alpha})`);
        g.addColorStop(0.35, `hsla(${cl.hues[1]},60%,80%,${alpha * 0.55})`);
        g.addColorStop(0.70, `hsla(${cl.hues[0]},55%,78%,${alpha * 0.18})`);
        g.addColorStop(1,    `hsla(${cl.hues[1]},50%,75%,0)`);
        _ctx.fillStyle = g;
        _ctx.fillRect(cx - rw, cy - rh, rw * 2, rh * 2);
        _ctx.restore();
      });
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
    _drawSkyLights(t, hr, mode);           // subtle surreal luminous drifts
    _drawWater(t, hr, mode);
    _drawIslands(hr, mode);         // landmass silhouettes at fixed azimuths
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

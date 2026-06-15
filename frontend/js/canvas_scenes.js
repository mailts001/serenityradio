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
    _birds     = Array.from({length: 7},  (_, i) => _newBird(true, i));
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
    // Tilt-aware horizon — same formula as _drawWater so they always match
    const hyBase = h * (mode === 'sleep' ? 0.60 : 0.65);
    const hy = Math.min(h * 0.92, Math.max(h * 0.20,
      hyBase + _panAlt * (hyBase / 90)));
    const hyF = hy / h;   // horizon as fraction of canvas height

    const p = _skyPalette(hr, mode);

    // Single full-canvas gradient — sky colours down to horizon, then fade
    // smoothly to near-black. Never hold a bright sky colour past the horizon;
    // the water gradient starts transparent there, so any held colour bleeds
    // through as a visible block.
    const g = _ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0,                          p.top);    // start with sky colour — no dark zenith band
    g.addColorStop(hyF * 0.55,                 p.mid);
    g.addColorStop(hyF,                        p.bot);
    g.addColorStop(Math.min(1, hyF + 0.08),   '#010508'); // quick fade below horizon
    g.addColorStop(1,                          '#010508');
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
      // Daytime atmospheric haze — very faint, entirely within sky, fades to 0 at horizon
      const peak = 0.06 + 0.03 * Math.sin(((hr - 8) / 9) * Math.PI);
      const hg = _ctx.createLinearGradient(0, h * 0.35, 0, h * 0.63);
      hg.addColorStop(0,   'rgba(210,232,255,0)');
      hg.addColorStop(0.4, `rgba(210,232,255,${peak})`);
      hg.addColorStop(1,   'rgba(210,232,255,0)');
      _ctx.fillStyle = hg;
      _ctx.fillRect(0, h * 0.35, w, h * 0.28);

      // Noon glare — warm yellow-white bloom at high noon (11:30–14:30)
      // Tracks the sun's actual screen position via _sunScreenPos
      if (hr >= 11.5 && hr < 14.5) {
        const noonT = Math.sin(((hr - 11.5) / 3.0) * Math.PI);  // 0→1→0 bell
        const glare = noonT * 0.18;
        const sun = _sunScreenPos(hr, w, h);
        const sunX = sun ? sun.sx : w * 0.5;
        const sunY = sun ? sun.sy : h * 0.18;
        const ng = _ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, w * 0.65);
        ng.addColorStop(0,   `rgba(255,248,200,${glare * 0.9})`);
        ng.addColorStop(0.3, `rgba(255,230,140,${glare * 0.4})`);
        ng.addColorStop(0.6, `rgba(255,210,80,${glare * 0.10})`);
        ng.addColorStop(1,   'rgba(255,200,60,0)');
        _ctx.fillStyle = ng;
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

  // ── Sun arc — tracks azimuth relative to _panAz ──────────────
  // Sun rises east (az≈90°), transits south at noon (az≈180°), sets west (az≈270°).
  // As the user pans, the sun shifts across the screen naturally.
  function _sunScreenPos(hr, w, h) {
    // Returns {sx, sy, altitude, alpha} or null if sun off-screen / below horizon
    if (hr < 5.5 || hr > 19.2) return null;
    const fade = hr < 6.5  ? (hr - 5.5)
               : hr > 18.2 ? (19.2 - hr)
               : 1.0;
    const alpha = Math.max(0, Math.min(1, fade));

    const dayStart = 6.0, dayEnd = 19.5;
    const progress = Math.max(0, Math.min(1, (hr - dayStart) / (dayEnd - dayStart)));
    const altitude = Math.sin(progress * Math.PI);  // 0 at horizon, 1 at zenith

    // Sun azimuth: rises east (90°) → south (180°) → sets west (270°)
    const sunAz  = 90 + progress * 180;
    const relAz  = ((sunAz - _panAz + 540) % 360) - 180;
    if (Math.abs(relAz) > 95) return null;   // sun panned off-screen

    const hyBase = h * 0.65;
    const hy = Math.min(h * 0.92, Math.max(h * 0.20, hyBase + _panAlt * (hyBase / 90)));

    const sx = w * 0.5 + (relAz / 90) * w * 0.5;
    // Sun Y: horizon minus altitude fraction of sky height; tilt shifts hy
    const sy = hy - altitude * (hy * 0.88);
    if (sy > h * 0.96 || sy < 0) return null;

    return { sx, sy, altitude, alpha };
  }

  function _drawSun(hr) {
    const w = _canvas.width, h = _canvas.height;
    const sun = _sunScreenPos(hr, w, h);
    if (!sun) return;
    const { sx, sy, altitude, alpha } = sun;

    const radius = 10 + altitude * 8;
    const sunR = 255;
    const sunG = Math.round(200 + altitude * 50);
    const sunB = Math.round(80  + altitude * 120);
    const col  = `rgba(${sunR},${sunG},${sunB},${alpha})`;

    // ── Layered atmospheric glow — 3 rings, all drawn as arcs (no rect edges) ──
    // Ring 1: wide ambient scatter (largest, most transparent)
    const glowR1 = radius * 8;
    const g1 = _ctx.createRadialGradient(sx, sy, radius * 0.8, sx, sy, glowR1);
    g1.addColorStop(0,    `rgba(${sunR},${sunG},${sunB},${alpha * 0.08})`);
    g1.addColorStop(0.5,  `rgba(${sunR},${Math.round(sunG*0.85)},60,${alpha * 0.04})`);
    g1.addColorStop(1,    'rgba(255,140,30,0)');
    _ctx.fillStyle = g1;
    _ctx.beginPath(); _ctx.arc(sx, sy, glowR1, 0, Math.PI * 2); _ctx.fill();

    // Ring 2: corona (medium, slightly warm)
    const glowR2 = radius * 3.8;
    const g2 = _ctx.createRadialGradient(sx, sy, radius * 0.6, sx, sy, glowR2);
    g2.addColorStop(0,   `rgba(${sunR},${sunG},200,${alpha * (altitude < 0.2 ? 0.28 : 0.18)})`);
    g2.addColorStop(0.55,`rgba(255,210,80,${alpha * 0.07})`);
    g2.addColorStop(1,   'rgba(255,180,40,0)');
    _ctx.fillStyle = g2;
    _ctx.beginPath(); _ctx.arc(sx, sy, glowR2, 0, Math.PI * 2); _ctx.fill();

    // Ring 3: inner limb brightening (tight, bright)
    const glowR3 = radius * 1.7;
    const g3 = _ctx.createRadialGradient(sx, sy, 0, sx, sy, glowR3);
    g3.addColorStop(0,   `rgba(255,255,240,${alpha * 0.95})`);
    g3.addColorStop(0.5, `rgba(${sunR},${sunG},${sunB},${alpha * 0.55})`);
    g3.addColorStop(1,   `rgba(${sunR},${sunG},60,0)`);
    _ctx.fillStyle = g3;
    _ctx.beginPath(); _ctx.arc(sx, sy, glowR3, 0, Math.PI * 2); _ctx.fill();

    // Sun disc — solid core
    _ctx.beginPath();
    _ctx.arc(sx, sy, radius, 0, Math.PI * 2);
    _ctx.fillStyle = col;
    _ctx.fill();

    // Water reflection column when near horizon
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

    // Moon arc — rises east ~20h, transits south ~1am, sets west ~6am
    // Tracks azimuth relative to _panAz just like the sun.
    const showMoon = mode === 'sleep' || nightness > 0.25;
    if (showMoon) {
      const moonAlpha = Math.min(0.92, (mode === 'sleep' ? 0.35 : 0) + nightness * 0.82);
      if (moonAlpha > 0.04) {
        const nightHr  = hr < 8 ? hr + 24 : hr;  // map 0–8 → 24–32 so range is 20–30
        const progress = Math.max(0, Math.min(1, (nightHr - 20) / 10));
        const altitude = Math.sin(progress * Math.PI);

        // Moon azimuth: rises east (90°) → transits south (180°) → sets west (270°)
        const moonAz = 90 + progress * 180;
        const relAzM = ((moonAz - _panAz + 540) % 360) - 180;
        if (Math.abs(relAzM) <= 95) {
          const hyBase2 = h * 0.65;
          const hy2 = Math.min(h * 0.92, Math.max(h * 0.20, hyBase2 + _panAlt * (hyBase2 / 90)));
          const mx = w * 0.5 + (relAzM / 90) * w * 0.5;
          const my = hy2 - altitude * (hy2 * 0.88);
          if (my <= h * 0.95 && my >= 0) {
            const mr = Math.min(w, h) * 0.048;
            // Glow — draw as arc not fillRect so edges fade cleanly
            // ── Moon layered glow — 3 rings, all arcs ──
            // Outer diffuse scatter
            const mg1 = _ctx.createRadialGradient(mx, my, mr, mx, my, mr * 6);
            mg1.addColorStop(0,   `rgba(200,215,255,${moonAlpha * 0.10})`);
            mg1.addColorStop(0.5, `rgba(190,210,255,${moonAlpha * 0.04})`);
            mg1.addColorStop(1,   'rgba(180,205,255,0)');
            _ctx.fillStyle = mg1;
            _ctx.beginPath(); _ctx.arc(mx, my, mr * 6, 0, Math.PI * 2); _ctx.fill();
            // Inner corona
            const mg2 = _ctx.createRadialGradient(mx, my, mr * 0.5, mx, my, mr * 2.8);
            mg2.addColorStop(0,   `rgba(220,230,255,${moonAlpha * 0.22})`);
            mg2.addColorStop(0.6, `rgba(200,215,255,${moonAlpha * 0.08})`);
            mg2.addColorStop(1,   'rgba(200,215,255,0)');
            _ctx.fillStyle = mg2;
            _ctx.beginPath(); _ctx.arc(mx, my, mr * 2.8, 0, Math.PI * 2); _ctx.fill();
            // Disc
            _ctx.beginPath(); _ctx.arc(mx, my, mr, 0, Math.PI * 2);
            _ctx.fillStyle = `rgba(228,235,255,${moonAlpha})`;
            _ctx.fill();
            // Crescent shadow bite
            _ctx.beginPath(); _ctx.arc(mx + mr * 0.3, my - mr * 0.06, mr * 0.86, 0, Math.PI * 2);
            _ctx.fillStyle = _skyPalette(hr, mode).top;
            _ctx.fill();
            // Water reflection when near horizon
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
    }
  }

  // ── Mist / atmosphere ──────────────────────────────────────
  function _drawMist(t, hr, mode) {
    if (mode === 'default') return;   // sea scene: mist doesn't pan → looks like static block
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
  // All birds in a session fly the SAME direction (left-to-right).
  // A new direction is picked once at page load, matches a real flock's behaviour.
  const _FLOCK_DIR = 1;  // always left → right; calming, unified, purposeful

  function _newBird(init, flockIdx) {
    const w = _canvas?.width || 1200;
    const h = _canvas?.height || 800;
    // Stagger entry: first bird near left edge, others follow behind
    const startX = init ? -60 - (flockIdx || 0) * 55 : -80;
    return {
      x:      startX,
      y:      h * (0.10 + Math.random() * 0.36),   // upper half of sky only
      dir:    _FLOCK_DIR,
      speed:  0.55 + Math.random() * 0.30,          // all move similar speed
      size:   3.5 + Math.random() * 3.5,
      yOff:   (Math.random() - 0.5) * 28,           // vertical spread within flock
      wingPhase:  Math.random() * Math.PI * 2,
      wingSpeed:  0.038 + Math.random() * 0.018,    // gentle wing beat
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

      // Move — gentle sine drift in y, clamped to upper sky
      b.x += b.dir * b.speed;
      b.y += Math.sin(t * 0.014 + b.driftPhase) * 0.18;
      b.y  = Math.max(h * 0.06, Math.min(h * 0.48, b.y));

      // Recycle when off right edge — re-enter from left
      if (b.x > w + 90) {
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
    // elev: elevation angle above horizon in degrees.
    // Low elevation (5-15°) = near horizon; higher (25-45°) = mid sky.
    // When user tilts up past this elevation, cloud scrolls below horizon and vanishes.
    const elev = t === 'cumulonimbus' ? 8 + Math.random() * 10
               : t === 'wispy'        ? 30 + Math.random() * 20
               :                        12 + Math.random() * 22;
    return {
      x:     (i / 14) * 1.6 - 0.15,
      elev,                              // world elevation above horizon (degrees)
      w:     (t === 'cumulonimbus' ? 0.10 : 0.16) + Math.random() * 0.18,
      h:     (t === 'cumulonimbus' ? 0.10 : 0.04) + Math.random() * 0.05,
      // Higher clouds (wispy at high elev) drift faster — parallax effect
      speed: t === 'wispy' ? 0.00004 + Math.random() * 0.00003
                           : 0.000015 + Math.random() * 0.000020,
      alpha: (t === 'backlit' ? 0.45 : 0.32) + Math.random() * 0.28,
      type:  t,
      seed:  Math.random(),
      phase: Math.random() * Math.PI * 2,  // per-cloud drift phase
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
    g.addColorStop(1,   colStop0.replace(/,[^,)]+\)/, ',0)'));
    _ctx.fillStyle = g;
    // Draw as arc (circle in scaled space = ellipse in screen space) — no rect edges
    _ctx.beginPath();
    _ctx.arc(x, y * rx / ry, rx, 0, Math.PI * 2);
    _ctx.fill();
    _ctx.restore();
  }

  // hy = tilt-aware horizon Y (pixels). Cloud screen Y derived from world elevation.
  function _drawCloud(c, w, h, alpha, hy) {
    if (!hy) hy = h * 0.65;
    // World elevation (degrees above horizon) → screen Y.
    // relAlt = how far above current view centre this cloud is.
    // Positive relAlt → above centre → smaller screen Y (higher up).
    const relAlt = (c.elev || 20) - _panAlt;
    const cy = hy - (relAlt / 90) * hy;
    // Clip: below horizon or above screen top
    if (cy > hy || cy < -h * 0.15) return;
    const cx = c.x * w;
    const cw = c.w * w, ch = c.h * h;
    const type = c.type || 'cumulus';

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
      // Cumulus: cluster of overlapping soft radial blobs drawn as arcs (no rect edges).
      const nBlob = 4 + Math.round(c.seed * 2);
      const bR    = cw * 0.22;
      for (let b = 0; b < nBlob; b++) {
        const tb  = b / (nBlob - 1);
        const bx  = cx + (tb - 0.5) * cw * 0.80;
        const by  = cy - bR * 0.55 * Math.sin(tb * Math.PI);
        const br  = bR * (0.80 + Math.sin(b * 1.8 + c.seed * 5) * 0.20);
        const lum = b === 0 || b === nBlob-1 ? 232 : 250;
        const gr  = _ctx.createRadialGradient(bx, by, 0, bx, by, br * 2.0);
        gr.addColorStop(0,   `rgba(${lum},${lum+2},255,${alpha * 0.58})`);
        gr.addColorStop(0.5, `rgba(${lum},${lum},252,${alpha * 0.24})`);
        gr.addColorStop(1,   'rgba(240,244,255,0)');
        _ctx.fillStyle = gr;
        _ctx.beginPath(); _ctx.arc(bx, by, br * 2.0, 0, Math.PI * 2); _ctx.fill();
      }
      // Shadow underside — arc not rect
      const sg = _ctx.createRadialGradient(cx, cy + bR*0.8, 0, cx, cy + bR*0.8, cw*0.40);
      sg.addColorStop(0,   `rgba(160,175,210,${alpha * 0.18})`);
      sg.addColorStop(1,   'rgba(160,175,210,0)');
      _ctx.fillStyle = sg;
      _ctx.beginPath(); _ctx.arc(cx, cy + bR*0.8, cw*0.40, 0, Math.PI * 2); _ctx.fill();

    } else if (type === 'backlit') {
      // Backlit: warm cream cores, lavender halos — all drawn as arcs
      const nBlob = 3 + Math.round(c.seed * 2);
      const bR    = cw * 0.32;
      for (let b = 0; b < nBlob; b++) {
        const tb  = b / (nBlob - 1);
        const bx  = cx + (tb - 0.5) * cw * 0.72;
        const by  = cy + Math.sin(tb * Math.PI + c.seed) * ch * 0.3;
        const lg  = _ctx.createRadialGradient(bx + bR*0.1, by + bR*0.1, 0, bx, by, bR * 2.0);
        lg.addColorStop(0,   `rgba(185,165,230,${alpha * 0.38})`);
        lg.addColorStop(0.6, `rgba(175,155,225,${alpha * 0.12})`);
        lg.addColorStop(1,   'rgba(180,160,228,0)');
        _ctx.fillStyle = lg;
        _ctx.beginPath(); _ctx.arc(bx, by, bR * 2.0, 0, Math.PI * 2); _ctx.fill();
        const cg  = _ctx.createRadialGradient(bx, by, 0, bx, by, bR * 1.1);
        cg.addColorStop(0,   `rgba(255,252,248,${alpha * 0.65})`);
        cg.addColorStop(0.4, `rgba(250,248,255,${alpha * 0.30})`);
        cg.addColorStop(1,   'rgba(248,246,255,0)');
        _ctx.fillStyle = cg;
        _ctx.beginPath(); _ctx.arc(bx, by, bR * 1.1, 0, Math.PI * 2); _ctx.fill();
      }

    } else if (type === 'cumulonimbus') {
      // Tall dark storm cloud — rendered as a vertical stack of cumulus-style
      // radial blobs, darker at base and lighter toward top.
      // No anvil cap, no flat dark disc — those looked like geometric shapes.
      // Instead: 8 overlapping blobs arranged in a tall column, size and
      // brightness increasing upward, with the bottommost blob darker/bluer.
      const nBlob  = 8;
      const height = Math.min(cw * 1.4, ch * 2.2);   // total column height
      const bR     = cw * 0.26;                        // blob radius

      for (let bi = 0; bi < nBlob; bi++) {
        const p   = bi / (nBlob - 1);                 // 0 = bottom, 1 = top
        const by  = cy + height * 0.5 - p * height;   // bottom→top
        // Horizontal jitter so blobs don't stack in a perfect line
        const bx  = cx + (Math.sin(bi * 1.9 + c.seed * 6) * bR * 0.55);
        const br  = bR * (0.72 + p * 0.38 + Math.sin(bi * 2.3 + c.seed * 4) * 0.18);

        // Bottom blobs: dark blue-grey.  Top blobs: bright white-grey.
        const lum  = Math.round(85  + p * 155);   // 85 (dark) → 240 (bright)
        const blue = Math.round(100 + p * 140);   // slight blue tint at base
        const a    = alpha * (0.55 + p * 0.30);   // more opaque at top

        const g = _ctx.createRadialGradient(bx, by, 0, bx, by, br * 2.2);
        g.addColorStop(0,    `rgba(${lum},${lum},${blue},${a})`);
        g.addColorStop(0.45, `rgba(${lum},${lum},${blue},${a * 0.38})`);
        g.addColorStop(1,    `rgba(${lum},${lum},${blue},0)`);
        _ctx.fillStyle = g;
        _ctx.beginPath(); _ctx.arc(bx, by, br * 2.2, 0, Math.PI * 2); _ctx.fill();
      }
    }
  }

  function _drawWeather(t, hr, mode) {
    const w = _canvas.width, h = _canvas.height;
    const hyBase = h * (mode === 'sleep' ? 0.60 : 0.65);
    const hy = Math.min(h * 0.92, Math.max(h * 0.20,
      hyBase + _panAlt * (hyBase / 90)));
    const type = _weatherType(hr);

    // Move clouds: drift right + gentle vertical bob per cloud
    _clouds.forEach(c => {
      c.x += c.speed;
      if (c.x > 1.35) c.x = -0.35;
      // Subtle elevation wobble — each cloud bobs ±0.8° on its own phase
      c.elev += Math.sin(t * 0.0004 + (c.phase || 0)) * 0.003;
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
      _clouds.slice(0, 4).forEach(c => _drawCloud({...c, type:'wispy'}, w, h, fade * 0.40, hy));
      _clouds.slice(4, 6).forEach(c => _drawCloud({...c, type:'backlit'}, w, h, fade * 0.28, hy));

    } else if (type === 'shower') {
      // Afternoon tropical shower — dark overcast veil + cumulonimbus + rain
      const cg = _ctx.createLinearGradient(0, 0, 0, hy);
      cg.addColorStop(0,   'rgba(50,58,82,0.52)');
      cg.addColorStop(0.7, 'rgba(28,36,58,0.25)');
      cg.addColorStop(1,   'rgba(20,28,50,0.08)');
      _ctx.fillStyle = cg;
      _ctx.fillRect(0, 0, w, hy);

      _clouds.filter(c => c.type === 'cumulonimbus').forEach(c =>
        _drawCloud(c, w, h, 0.80, hy));
      _clouds.filter(c => c.type === 'cumulus').slice(0, 5).forEach(c =>
        _drawCloud(c, w, h, 0.68, hy));
      _clouds.filter(c => c.type === 'backlit').slice(0, 2).forEach(c =>
        _drawCloud(c, w, h, 0.42, hy));

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
      // Overcast — dense layered cloud cover. Use gradient that fades to 0
      // before the horizon so no solid block appears at the sky/sea boundary.
      const og = _ctx.createLinearGradient(0, 0, 0, hy);
      og.addColorStop(0,   'rgba(72,80,102,0.35)');
      og.addColorStop(0.5, 'rgba(48,56,78,0.14)');
      og.addColorStop(1,   'rgba(35,42,62,0)');   // fade to 0 at horizon
      _ctx.fillStyle = og;
      _ctx.fillRect(0, 0, w, hy);
      // All cloud types layered — backlit gives lavender pearl shadows
      _clouds.filter(c => c.type === 'cumulus').forEach(c  => _drawCloud(c, w, h, 0.52, hy));
      _clouds.filter(c => c.type === 'backlit').forEach(c  => _drawCloud(c, w, h, 0.45, hy));
      _clouds.filter(c => c.type === 'wispy').slice(0, 3).forEach(c =>
        _drawCloud(c, w, h, 0.28, hy));

    } else if (type === 'clouds') {
      const count = Math.floor(4 + _weatherSeed * 3);
      _clouds.filter(c => c.type === 'cumulus').slice(0, count).forEach(c =>
        _drawCloud(c, w, h, 0.42, hy));
      _clouds.filter(c => c.type === 'backlit').slice(0, 2).forEach(c =>
        _drawCloud(c, w, h, 0.35, hy));
      _clouds.filter(c => c.type === 'wispy').slice(0, 2).forEach(c =>
        _drawCloud(c, w, h, 0.22, hy));

    } else {
      // Clear / light-cloud — distant wisps only
      _clouds.filter(c => c.type === 'wispy').slice(0, 3).forEach(c =>
        _drawCloud(c, w, h, 0.20, hy));
      if (_weatherSeed > 0.6) {
        _clouds.filter(c => c.type === 'cumulus').slice(0, 2).forEach(c =>
          _drawCloud(c, w, h, 0.25, hy));
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

  // Cache star positions — recompute on pan (nulled in onMove) or every 60 s
  let _starPositions = null, _starPosTime = 0;
  function _getStarPositions(w, h) {
    if (!_starPositions || Date.now() - _starPosTime > 60000) {
      _starPositions = _starCat.map(([ra, dec, mag, name]) => {
        const pos = _starScreen(ra, dec, _panAz, w, h);
        return pos ? { sx: pos.sx, sy: pos.sy, mag, name } : null;
      }).filter(Boolean);
      _starPosTime = Date.now();
    }
    return _starPositions;
  }

  // ── Draw real stars (night / sleep mode) ─────────────────────
  function _drawRealStars(t, hr, mode, nightness) {
    if (nightness < 0.05 && mode !== 'sleep') return;
    const w = _canvas.width, h = _canvas.height;
    // Cache is invalidated by _initPan onMove; no need to null it here every frame
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

  // ══════════════════════════════════════════════════════════
  //  SCENE: SPACE — deep starfield, nebula wash, no horizon
  // ══════════════════════════════════════════════════════════
  function _spaceFrame(t) {
    const w = _canvas.width, h = _canvas.height;

    // Deep space background — very dark, slight blue-purple gradient
    const bg = _ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0,   '#00000f');
    bg.addColorStop(0.4, '#020414');
    bg.addColorStop(1,   '#010208');
    _ctx.fillStyle = bg; _ctx.fillRect(0, 0, w, h);

    // Nebula wash — two large radial colour clouds, drift slowly
    const nb1x = w * (0.30 + 0.08 * Math.sin(t * 0.0003));
    const nb1y = h * (0.38 + 0.05 * Math.cos(t * 0.0004));
    const n1 = _ctx.createRadialGradient(nb1x, nb1y, 0, nb1x, nb1y, w * 0.55);
    n1.addColorStop(0,   'rgba(60,20,120,0.18)');
    n1.addColorStop(0.4, 'rgba(100,40,160,0.09)');
    n1.addColorStop(1,   'rgba(40,10,80,0)');
    _ctx.fillStyle = n1; _ctx.beginPath(); _ctx.arc(nb1x, nb1y, w*0.55, 0, Math.PI*2); _ctx.fill();

    const nb2x = w * (0.72 + 0.06 * Math.cos(t * 0.00025));
    const nb2y = h * (0.55 + 0.06 * Math.sin(t * 0.00035));
    const n2 = _ctx.createRadialGradient(nb2x, nb2y, 0, nb2x, nb2y, w * 0.45);
    n2.addColorStop(0,   'rgba(20,60,120,0.16)');
    n2.addColorStop(0.5, 'rgba(10,80,140,0.07)');
    n2.addColorStop(1,   'rgba(0,40,80,0)');
    _ctx.fillStyle = n2; _ctx.beginPath(); _ctx.arc(nb2x, nb2y, w*0.45, 0, Math.PI*2); _ctx.fill();

    // Full-sky star field — force nightness=1, no horizon clip
    _panAlt = Math.max(_panAlt, 0); // space: never look below horizon
    const oldHy = h * 0.65;
    // Override star screen to show full canvas (no horizon clip)
    _starPositions = null;
    const stars = _getStarPositions(w, h);
    stars.forEach(s => {
      const twinkle = 0.70 + 0.30 * Math.sin(t * 0.016 + s.mag * 4.1);
      const a = twinkle;
      const r = Math.max(0.5, 3.2 - s.mag * 0.9);
      if (s.mag < 1.2) {
        const glow = _ctx.createRadialGradient(s.sx, s.sy, 0, s.sx, s.sy, r*5);
        glow.addColorStop(0, `rgba(220,235,255,${a*0.40})`);
        glow.addColorStop(1, 'rgba(180,210,255,0)');
        _ctx.fillStyle = glow; _ctx.beginPath(); _ctx.arc(s.sx, s.sy, r*5, 0, Math.PI*2); _ctx.fill();
      }
      _ctx.beginPath(); _ctx.arc(s.sx, s.sy, r, 0, Math.PI*2);
      _ctx.fillStyle = s.mag < 0.5 ? `rgba(255,255,220,${a})` : s.mag < 1.5 ? `rgba(220,235,255,${a})` : `rgba(255,248,230,${a})`;
      _ctx.fill();
    });

    // Slow-moving distant galaxy smear
    const gx = w * (0.55 + 0.04 * Math.sin(t * 0.0002));
    const gy = h * 0.25;
    _ctx.save(); _ctx.rotate(0.4);
    const gal = _ctx.createRadialGradient(gx, gy, 0, gx, gy, w * 0.18);
    gal.addColorStop(0,   'rgba(200,210,255,0.06)');
    gal.addColorStop(0.5, 'rgba(180,195,255,0.02)');
    gal.addColorStop(1,   'rgba(160,180,255,0)');
    _ctx.fillStyle = gal; _ctx.beginPath(); _ctx.arc(gx, gy, w*0.18, 0, Math.PI*2); _ctx.fill();
    _ctx.restore();
  }

  // ══════════════════════════════════════════════════════════
  //  SCENE: FOREST — layered tree silhouettes, mist, fireflies
  // ══════════════════════════════════════════════════════════
  // Returns screen x of a world-space coordinate, wrapping seamlessly
  function _treeScreenX(worldX, panOff, worldW) {
    const raw = worldX - panOff;
    const mod = ((raw % worldW) + worldW) % worldW;
    return mod > worldW * 0.75 ? mod - worldW : mod;
  }

  // Draw an organic irregular leaf blob (not a circle) — polygon with wobbly edges
  function _organicLeaf(cx, cy, rx, ry, seed, rgb, alpha) {
    const c   = _ctx;
    const pts = 9;
    c.beginPath();
    for (let i = 0; i <= pts; i++) {
      const ang  = (i / pts) * Math.PI * 2;
      const ns   = (seed * 100 + i * 41) % 100 / 100;
      const ns2  = (seed * 73  + i * 29) % 100 / 100;
      const dr   = 0.60 + ns * 0.80;   // wobble: 60%–140% of radius
      const bx   = cx + Math.cos(ang + ns2 * 0.3) * rx * dr;
      const by   = cy + Math.sin(ang + ns2 * 0.3) * ry * dr;
      i === 0 ? c.moveTo(bx, by) : c.lineTo(bx, by);
    }
    c.closePath();
    c.fillStyle = `rgba(${rgb},${alpha})`;
    c.fill();
  }

  // Draw a tapered branch as a filled wedge — thick at base, narrows to a fine tip
  // lightSide: +1 = left-lit, -1 = right-lit, affects shade variation
  function _drawTaperedBranch(x1, y1, ang, len, baseW, bR, bG, bB, depth, seed, lightSide) {
    if (len < 3 || depth < 0) return { x: x1, y: y1 };
    const x2   = x1 + Math.cos(ang) * len;
    const y2   = y1 + Math.sin(ang) * len;
    const perp = ang + Math.PI * 0.5;
    const px   = Math.cos(perp), py = Math.sin(perp);

    // Shade varies with depth and light side — deeper = darker, lit side = brighter
    const depthFade = depth * 14;
    const litBump   = lightSide * 12;
    const r = Math.max(0, Math.min(255, bR - depthFade + litBump));
    const g = Math.max(0, Math.min(255, bG - depthFade + litBump * 0.7));
    const b = Math.max(0, Math.min(255, bB - depthFade + litBump * 0.4));

    // Filled tapered shape: two bezier curves meeting at the fine tip
    const midX = (x1 + x2) * 0.5, midY = (y1 + y2) * 0.5;
    const halfW = baseW * 0.5;
    _ctx.beginPath();
    _ctx.moveTo(x1 + px * halfW, y1 + py * halfW);
    _ctx.quadraticCurveTo(midX + px * halfW * 0.5, midY + py * halfW * 0.5, x2, y2);
    _ctx.quadraticCurveTo(midX - px * halfW * 0.5, midY - py * halfW * 0.5,
                          x1 - px * halfW, y1 - py * halfW);
    _ctx.closePath();
    _ctx.fillStyle = `rgba(${r},${g},${b},0.90)`;
    _ctx.fill();

    if (depth > 0) {
      const s1 = (seed * 1.37) % 1, s2 = (seed * 1.618) % 1;
      const sp1 = 0.32 + (seed  * 100 % 100 / 100) * 0.24;
      const sp2 = 0.28 + (s1    * 100 % 100 / 100) * 0.24;
      _drawTaperedBranch(x2, y2, ang - sp1, len * 0.60, baseW * 0.56, bR, bG, bB, depth-1, s1, -lightSide);
      _drawTaperedBranch(x2, y2, ang + sp2, len * 0.65, baseW * 0.52, bR, bG, bB, depth-1, s2,  lightSide);
      if (seed > 0.38 && depth > 1) {
        const s3 = (seed * 2.14) % 1;
        _drawTaperedBranch(x2, y2, ang - 0.06, len * 0.48, baseW * 0.40, bR, bG, bB, depth-2, s3, lightSide * 0.5);
      }
    }
    return { x: x2, y: y2 };
  }

  // Draw a Hinoki giant tree: trunk fills full canvas height, tapered branches, swirl bark lines
  function _drawGiantTree(cx, canvasH, trunkRad, totalH, seed, leafRgbArr, isNight) {
    const c  = _ctx;
    const s2 = (seed * 137.5) % 1;
    const s3 = (seed * 97.3)  % 1;
    const s4 = (seed * 211.7) % 1;
    const lean = (s2 - 0.5) * 0.018;  // very slight natural lean

    // ── Trunk colour — warm earthy bark ───────────────────────────
    const tR = 72  + Math.floor(s3 * 40);
    const tG = 44  + Math.floor(s4 * 28);
    const tB = 20  + Math.floor(s2 * 18);

    const bottomY   = canvasH + trunkRad * 2;
    const trunkTopY = canvasH * 0.22 - totalH * 0.08;   // crown starts here
    const trunkTopX = cx + lean * totalH;
    const wBottom   = trunkRad * 3.2;
    const wTop      = trunkRad * 0.70;

    // ── Solid trunk silhouette ─────────────────────────────────────
    c.beginPath();
    c.moveTo(cx - wBottom, bottomY);
    c.bezierCurveTo(
      cx - trunkRad * 2.0, canvasH * 0.70,
      trunkTopX - trunkRad * 1.2, canvasH * 0.35,
      trunkTopX - wTop, trunkTopY
    );
    c.lineTo(trunkTopX + wTop, trunkTopY);
    c.bezierCurveTo(
      trunkTopX + trunkRad * 1.2, canvasH * 0.35,
      cx + trunkRad * 2.0, canvasH * 0.70,
      cx + wBottom, bottomY
    );
    c.closePath();
    c.fillStyle = `rgb(${tR},${tG},${tB})`;
    c.fill();

    // ── Lateral light (3D roundness) — clipped to trunk shape ────
    c.save();
    // Re-trace trunk path as clip region
    c.beginPath();
    c.moveTo(cx - wBottom, bottomY);
    c.bezierCurveTo(cx - trunkRad * 2.0, canvasH * 0.70, trunkTopX - trunkRad * 1.2, canvasH * 0.35, trunkTopX - wTop, trunkTopY);
    c.lineTo(trunkTopX + wTop, trunkTopY);
    c.bezierCurveTo(trunkTopX + trunkRad * 1.2, canvasH * 0.35, cx + trunkRad * 2.0, canvasH * 0.70, cx + wBottom, bottomY);
    c.closePath();
    c.clip();
    const lg = c.createLinearGradient(cx - wBottom, 0, cx + wBottom, 0);
    lg.addColorStop(0,    `rgba(${tR-20},${tG-14},${tB-8},0.50)`);
    lg.addColorStop(0.32, `rgba(${tR+28},${tG+18},${tB+10},0.28)`);
    lg.addColorStop(1,    `rgba(${tR-26},${tG-18},${tB-9},0.46)`);
    c.fillStyle = lg;
    c.fillRect(cx - wBottom - 2, trunkTopY, wBottom * 2 + 4, bottomY - trunkTopY);
    c.restore();

    // ── Bark texture lines ─────────────────────────────────────────
    c.save();
    c.beginPath();
    c.rect(cx - wBottom - 1, trunkTopY, wBottom * 2 + 2, bottomY - trunkTopY);
    c.clip();
    const nLines = 7 + Math.floor(s2 * 5);
    for (let li = 0; li < nLines; li++) {
      const ls  = (li * 67 + seed * 300) % 100 / 100;
      const ls2 = (li * 43 + seed * 200) % 100 / 100;
      const xOff = (ls - 0.5) * wBottom * 1.6;
      const drift = (ls2 - 0.5) * wBottom * 0.45;
      c.beginPath();
      c.moveTo(cx + xOff, bottomY);
      for (let si = 1; si <= 10; si++) {
        const sf = si / 10;
        const sy = bottomY - (bottomY - trunkTopY) * sf;
        const wH = wBottom + (wTop - wBottom) * sf;
        const sx = Math.max(cx - wH + 1, Math.min(cx + wH - 1,
                     cx + xOff * (1 - sf * 0.5) + Math.sin(sf * Math.PI * 1.6 + ls * 6) * drift * (1 - sf * 0.3)));
        c.lineTo(sx, sy);
      }
      c.lineWidth = 0.6 + ls * 0.7;
      c.strokeStyle = li % 3 === 0
        ? `rgba(${tR+22},${tG+14},${tB+8},${0.07 + ls * 0.08})`
        : `rgba(${tR-16},${tG-10},${tB-6},${0.06 + ls * 0.07})`;
      c.stroke();
    }
    c.restore();

    // ── Dense leaf canopy — no branches, full organic crown ────────
    // Crown occupies from trunkTopY upward
    const crownBot  = trunkTopY + totalH * 0.08;   // crown base (just above trunk top)
    const crownTop  = trunkTopY - totalH * 0.58;   // crown apex
    const crownH    = crownBot - crownTop;
    // Max spread is widest in the middle of the crown
    const maxSpread = totalH * (0.18 + s2 * 0.10);

    const lRgb0 = leafRgbArr[0], lRgb1 = leafRgbArr[1], lRgb2 = leafRgbArr[2];
    // Fully opaque leaves — no translucency
    const leafA = isNight ? 0.72 : 0.88;

    // Draw tiers bottom → top (bottom tiers widest, top narrow)
    const numTiers = 14 + Math.floor(s3 * 6);   // generous tier count for fullness
    for (let ti = 0; ti < numTiers; ti++) {
      const tf  = ti / (numTiers - 1);            // 0 = bottom, 1 = top
      const ty  = crownBot - crownH * tf;
      // Spread: wide in lower-middle, narrow at crown tip (like a real oval canopy)
      const spreadF = Math.sin(tf * Math.PI) * 0.85 + (1 - tf) * 0.18;
      const tw  = maxSpread * spreadF;
      // More blobs per tier in the middle for density
      const cnt = Math.round(4 + spreadF * 9);
      for (let bi = 0; bi < cnt; bi++) {
        const bs  = (bi * 53 + ti * 37 + seed * 200) % 100 / 100;
        const bs2 = (bi * 41 + ti * 29 + seed * 150) % 100 / 100;
        // Spread across crown width, slight lean following trunk
        const bx  = cx + lean * (canvasH - ty) * 0.25 + (bs - 0.5) * tw * 2.0;
        // Natural slight droop at outer edges, vertical scatter within tier
        const droop = Math.abs(bs - 0.5) * tw * 0.30;
        const by  = ty + droop + (bs2 - 0.5) * tw * 0.22;
        // Blob size — larger in mid-crown, smaller at tips
        const rx  = tw * (0.17 + bs2 * 0.22) * (0.7 + spreadF * 0.5);
        const ry  = rx * (0.55 + bs * 0.30);
        // Rotate through 3 leaf tones for depth variation
        const rgb = bi % 3 === 0 ? lRgb0 : bi % 3 === 1 ? lRgb1 : lRgb2;
        // Slightly vary alpha: edge blobs slightly lighter for rim-light feel
        const edgeFade = 1 - Math.abs(bs - 0.5) * 0.35;
        _organicLeaf(bx, by, rx, ry, bs + seed + ti * 0.07, rgb, Math.min(leafA, leafA * edgeFade + 0.18));
      }
    }
  }

  // ══════════════════════════════════════════════════════════
  //  SCENE: FOREST — minimalist distant forest on hill slopes
  // ══════════════════════════════════════════════════════════
  function _forestFrame(t, mode) {
    const w  = _canvas.width, h = _canvas.height;
    const c  = _ctx;
    const hr = new Date().getHours() + new Date().getMinutes() / 60;
    const isNight = hr < 6 || hr >= 19.5;
    const isDusk  = !isNight && (hr < 7 || hr >= 17.5);

    const altShift = (_panAlt / 50) * h * 0.34;
    const panFrac  = (_panAz / 360);
    const WORLD_W  = w * 2;
    const panOffPx = panFrac * WORLD_W;

    // Sky dominates — horizon sits at 60% down
    const horizY  = h * 0.60 + altShift * 0.45;
    const groundY = horizY;

    // ── SKY — full canvas, vast and open ───────────────────────────
    const skyP = _skyPalette(hr);
    const sg = c.createLinearGradient(0, 0, 0, h);
    sg.addColorStop(0,   skyP.top);
    sg.addColorStop(0.55, skyP.mid);
    sg.addColorStop(1,   skyP.bot);
    c.fillStyle = sg; c.fillRect(0, 0, w, h);

    _drawStarsAndMoon(t, hr, mode);
    if (!isNight) _drawSun(hr);

    // Warm horizon glow
    if (!isNight) {
      const hg = c.createLinearGradient(0, horizY - h * 0.12, 0, horizY + h * 0.08);
      hg.addColorStop(0, 'rgba(255,240,195,0)');
      hg.addColorStop(0.5, `rgba(255,228,158,${isDusk ? 0.32 : 0.18})`);
      hg.addColorStop(1, 'rgba(255,240,195,0)');
      c.fillStyle = hg; c.fillRect(0, horizY - h * 0.12, w, h * 0.20);
    }

    // ── HILL SILHOUETTES — 3 smooth rolling layers ─────────────────
    // Helper: smooth hill profile at normalised world-x (0–1)
    function hillY(nx, phase, amp) {
      return Math.sin(nx * Math.PI * 2.4 + phase) * amp
           + Math.sin(nx * Math.PI * 1.1 + phase * 1.7) * amp * 0.38
           + Math.cos(nx * Math.PI * 3.8 + phase * 0.8) * amp * 0.18;
    }

    // Hill layer definitions (far → near)
    const HILLS = [
      { baseY: horizY - h * 0.04, amp: h * 0.042, phase: 1.8, pMul: 0.22,
        col: isNight ? 'rgba(18,34,20,0.58)' : isDusk ? 'rgba(64,76,30,0.50)' : 'rgba(98,138,62,0.42)' },
      { baseY: horizY + h * 0.04, amp: h * 0.058, phase: 3.5, pMul: 0.50,
        col: isNight ? 'rgba(12,26,14,0.76)' : isDusk ? 'rgba(48,62,22,0.70)' : 'rgba(72,110,42,0.65)' },
      { baseY: horizY + h * 0.13, amp: h * 0.072, phase: 0.6, pMul: 0.88,
        col: isNight ? 'rgba(8,18,10,0.92)' : isDusk ? 'rgba(34,48,16,0.88)' : 'rgba(52,84,28,0.84)' },
    ];

    // Store hill-y samplers so trees can root on them
    const hillSamplers = HILLS.map(H => {
      const layerPan = panFrac * WORLD_W * H.pMul;
      return (sx) => {
        const nx = ((sx + layerPan) / w + 20) % 1;
        return H.baseY + hillY(nx, H.phase, H.amp);
      };
    });

    // Draw hills back→front
    HILLS.forEach((H, hi) => {
      const layerPan = panFrac * WORLD_W * H.pMul;
      c.beginPath();
      c.moveTo(-8, h + 4);
      for (let si = 0; si <= 60; si++) {
        const sx = (si / 60) * (w + 16) - 8;
        const nx = ((sx + layerPan) / w + 20) % 1;
        const hy = H.baseY + hillY(nx, H.phase, H.amp);
        si === 0 ? c.moveTo(sx, hy) : c.lineTo(sx, hy);
      }
      c.lineTo(w + 8, h + 4); c.closePath();
      c.fillStyle = H.col; c.fill();
    });

    // ── LIGHT SHAFTS piercing sky ──────────────────────────────────
    if (!isNight) {
      const shA = isDusk ? 0.038 : 0.022;
      for (let si = 0; si < 5; si++) {
        const sx2 = w * (0.06 + si * 0.21 + Math.sin(t * 0.00025 + si * 1.3) * 0.036);
        const sw2 = w * 0.022;
        const sg2 = c.createLinearGradient(0, 0, 0, h * 0.80);
        sg2.addColorStop(0,   'rgba(255,248,215,0)');
        sg2.addColorStop(0.1, `rgba(255,248,215,${shA})`);
        sg2.addColorStop(0.8, `rgba(255,248,215,${shA * 0.22})`);
        sg2.addColorStop(1,   'rgba(255,248,215,0)');
        c.fillStyle = sg2;
        c.beginPath();
        c.moveTo(sx2 - sw2, 0); c.lineTo(sx2 + sw2 * 4, h * 0.80);
        c.lineTo(sx2 - sw2 * 4, h * 0.80); c.lineTo(sx2 + sw2, 0);
        c.closePath(); c.fill();
      }
    }

    // ── TREES on hill slopes — tiny, distant, majestic ─────────────
    // Trees are deliberately small (far away) so canopies pierce the sky
    const leafPal = isNight
      ? ['22,50,24','30,64,32','40,80,42']
      : isDusk
        ? ['70,92,30','88,114,40','108,138,52']
        : ['62,100,28','78,122,40','96,148,52'];

    // 3 layers matching the 3 hills; trees root exactly on their hill
    const TREE_LAYERS = [
      // far hill: tiny ghost silhouettes, very distant
      { hi: 0, count: 3, rMin: 0.004, rMax: 0.007, hFrac: 0.40, pMul: 0.22 },
      // mid hill: small, clear
      { hi: 1, count: 3, rMin: 0.007, rMax: 0.012, hFrac: 0.55, pMul: 0.50 },
      // near hill: 2 large majestic anchors rising into sky
      { hi: 2, count: 2, rMin: 0.011, rMax: 0.018, hFrac: 0.75, pMul: 0.88 },
    ];

    TREE_LAYERS.forEach((L, li) => {
      const treeH  = h * L.hFrac;
      const baseGap = WORLD_W / L.count;
      let wxPos = (li * 137 % 100 / 100) * baseGap;
      const layerPan = panFrac * WORLD_W * L.pMul;
      const sampler  = hillSamplers[L.hi];

      for (let ti = 0; ti < L.count; ti++) {
        const seed  = (li * 97  + ti * 137) % 1000 / 1000;
        const seed2 = (li * 53  + ti * 113) % 1000 / 1000;
        wxPos = (wxPos + baseGap * (0.80 + seed2 * 0.40)) % WORLD_W;
        const sx  = _treeScreenX(wxPos, layerPan, WORLD_W);
        const rad = (L.rMin + seed2 * (L.rMax - L.rMin)) * w;
        const tH  = treeH * (0.78 + seed * 0.30);

        [sx, sx + WORLD_W, sx - WORLD_W].forEach(cx => {
          if (cx < -tH * 0.4 || cx > w + tH * 0.4) return;
          // Root ON the hill surface — trunk emerges from slope
          const rootY   = sampler(cx) + rad * 0.5;
          const canvasH = rootY + rad * 1.5;   // trunk base just below hill surface
          _drawGiantTree(cx, canvasH, rad, tH, seed, leafPal, isNight);
        });
      }
    });

    // ── MIST drifting between hills ────────────────────────────────
    const mistRgb = isNight ? '195,215,208' : isDusk ? '230,212,188' : '210,228,215';
    for (let mi = 0; mi < 5; mi++) {
      const driftX  = Math.sin(t * 0.00038 + mi * 1.7) * w * 0.20 + Math.cos(t * 0.00016 + mi * 1.0) * w * 0.09;
      // Mist hugs the hill lines
      const hillRef = HILLS[Math.min(mi, 2)];
      const baseY   = hillRef.baseY - hillRef.amp * 0.5 + Math.sin(t * 0.0016 + mi * 2.4) * h * 0.016;
      const ribbonH = h * (0.032 + (mi % 3) * 0.012);
      const alpha   = (0.040 + mi * 0.012) * (isNight ? 0.55 : 1.0);
      const x0 = -w * 0.14 + driftX, x3 = w * 1.14 + driftX;
      const x1 = w * 0.28 + driftX + Math.sin(t * 0.0008 + mi) * w * 0.09;
      const x2 = w * 0.72 + driftX + Math.cos(t * 0.0006 + mi * 1.8) * w * 0.09;
      const wv = ribbonH * 0.14;
      c.beginPath();
      c.moveTo(x0, baseY + wv);
      c.bezierCurveTo(x1, baseY - ribbonH * 0.34, x2, baseY + ribbonH * 0.10, x3, baseY + wv * 0.5);
      c.bezierCurveTo(x2, baseY + ribbonH * 1.32, x1, baseY + ribbonH * 0.88, x0, baseY + ribbonH + wv);
      c.closePath();
      const mg = c.createLinearGradient(0, baseY - ribbonH * 0.4, 0, baseY + ribbonH * 1.4);
      mg.addColorStop(0,    `rgba(${mistRgb},0)`);
      mg.addColorStop(0.28, `rgba(${mistRgb},${alpha})`);
      mg.addColorStop(0.72, `rgba(${mistRgb},${alpha * 0.72})`);
      mg.addColorStop(1,    `rgba(${mistRgb},0)`);
      c.fillStyle = mg; c.fill();
    }

    _drawFireflies(t, hr, mode);
  }

  // ══════════════════════════════════════════════════════════
  //  SCENE: SNOW — mountain silhouettes, falling snow, cold sky
  // ══════════════════════════════════════════════════════════
  let _snowParticles = null;
  function _initSnow() {
    const w = _canvas.width, h = _canvas.height;
    _snowParticles = Array.from({length: 160}, () => ({
      x:     Math.random() * w,
      y:     Math.random() * h,
      r:     0.5 + Math.random() * 2.2,
      speed: 0.3 + Math.random() * 0.8,
      drift: (Math.random() - 0.5) * 0.4,
      phase: Math.random() * Math.PI * 2,
      alpha: 0.3 + Math.random() * 0.6,
    }));
  }

  function _snowFrame(t, mode) {
    const w = _canvas.width, h = _canvas.height;
    const hr = new Date().getHours() + new Date().getMinutes() / 60;
    if (!_snowParticles) _initSnow();

    // Vertical pan — look up reveals more sky/peaks, look down reveals snowfield
    const altShift = (_panAlt / 50) * h * 0.40;
    const groundY  = h * 0.74 + altShift;

    const isNight = hr < 6 || hr >= 20;

    // ── Korean ink-wash sky: misty white → pale steel ───────────
    // Day: cream-white sky like hanji paper; Night: deep ink with stars
    const sg = _ctx.createLinearGradient(0, 0, 0, h);
    if (isNight) {
      sg.addColorStop(0,   '#06091a'); sg.addColorStop(0.5, '#0a1028');
      sg.addColorStop(0.8, '#101830'); sg.addColorStop(1,   '#161e38');
    } else {
      sg.addColorStop(0,   '#dce8f5'); sg.addColorStop(0.35, '#e8f2fc');
      sg.addColorStop(0.7, '#f0f6ff'); sg.addColorStop(1,   '#f8faff');
    }
    _ctx.fillStyle = sg; _ctx.fillRect(0, 0, w, h);

    if (isNight) { _drawStarsAndMoon(t, hr, mode); }
    else {
      // Soft winter sun — pale disc, no harsh glow
      const sp = _sunScreenPos(hr, w, h);
      if (sp) {
        const sg2 = _ctx.createRadialGradient(sp.sx, sp.sy, 0, sp.sx, sp.sy, h * 0.18);
        sg2.addColorStop(0,   `rgba(255,248,230,${sp.alpha * 0.55})`);
        sg2.addColorStop(0.3, `rgba(240,232,210,${sp.alpha * 0.20})`);
        sg2.addColorStop(1,   'rgba(240,232,210,0)');
        _ctx.fillStyle = sg2;
        _ctx.beginPath(); _ctx.arc(sp.sx, sp.sy, h * 0.18, 0, Math.PI * 2); _ctx.fill();
        // Pale disc
        _ctx.beginPath(); _ctx.arc(sp.sx, sp.sy, h * 0.028, 0, Math.PI * 2);
        _ctx.fillStyle = `rgba(255,252,245,${sp.alpha * 0.85})`; _ctx.fill();
      }
    }

    // ── Ink-wash mist bands — dissolve mountains into sky ───────
    // These bands give the characteristic Korean painting "mist veil" effect
    const mistBands = [
      { yOff: -0.50, alpha: 0.30, h: 0.14 },   // high mist band
      { yOff: -0.32, alpha: 0.45, h: 0.18 },   // mid mist
      { yOff: -0.14, alpha: 0.35, h: 0.16 },   // low mist above ground
    ];
    mistBands.forEach(B => {
      const my  = groundY + h * B.yOff;
      const mg  = _ctx.createLinearGradient(0, my - h * B.h * 0.5, 0, my + h * B.h * 0.5);
      const rgb = isNight ? '22,30,50' : '235,242,252';
      mg.addColorStop(0,   `rgba(${rgb},0)`);
      mg.addColorStop(0.5, `rgba(${rgb},${B.alpha})`);
      mg.addColorStop(1,   `rgba(${rgb},0)`);
      _ctx.fillStyle = mg;
      _ctx.fillRect(0, my - h * B.h * 0.5, w, h * B.h);
    });

    // ── Mountain ridges — Korean sansu style ────────────────────
    // Far ridges: very pale blue-grey, almost ghostly (dissolving into mist)
    // Near ridges: darker ink, strong silhouette with crisp snow edges
    // Draw 3× width; peaks anchored relative to groundY
    const RIDGES = [
      // { offY from groundY, hFrac, inkR,g,b, alpha, count, panScale }
      { offY:-0.55, hFrac:0.22, r:200,g:212,b:228, a:0.28, count:22, ps:0.06 }, // ghost far range
      { offY:-0.44, hFrac:0.30, r:170,g:185,b:210, a:0.42, count:18, ps:0.09 }, // distant
      { offY:-0.33, hFrac:0.36, r:130,g:150,b:185, a:0.62, count:14, ps:0.13 }, // mid
      { offY:-0.22, hFrac:0.40, r: 75,g: 95,b:135, a:0.82, count:11, ps:0.18 }, // nearer
      { offY:-0.13, hFrac:0.44, r: 38,g: 52,b: 82, a:0.96, count: 8, ps:0.24 }, // foreground
    ];

    RIDGES.forEach((R, ri) => {
      const ridgeMid  = groundY + h * R.offY;
      const ridgeBase = groundY + h * 0.04;
      const panOff    = (_panAz / 360) * w * 3 * R.ps;
      const xL = -w, xR = w * 2;
      const step = (xR - xL) / R.count;

      // Peak Y using deterministic seed
      const peakY = pi => {
        const s = (ri * 53 + (((pi % R.count) + R.count) % R.count) * 71) % 100 / 100;
        return ridgeMid - h * R.hFrac * (0.35 + s * 0.65);
      };

      // Ridge body — slightly transparent so mist bands show through
      _ctx.globalAlpha = 0.92;
      _ctx.fillStyle = `rgba(${R.r},${R.g},${R.b},${R.a})`;
      _ctx.beginPath();
      _ctx.moveTo(xL - panOff, ridgeBase);
      for (let pi = 0; pi <= R.count; pi++) {
        const px  = xL + pi * step - panOff;
        const py  = peakY(pi);
        if (pi === 0) { _ctx.lineTo(px, py); continue; }
        const ppy = peakY(pi - 1);
        // Korean peaks: concave saddles, sharp tips — use curve control above midpoint
        const cpY = Math.min(py, ppy) - h * R.hFrac * 0.08;
        _ctx.quadraticCurveTo(px - step * 0.5, cpY, px, py);
      }
      _ctx.lineTo(xR - panOff, ridgeBase);
      _ctx.closePath(); _ctx.fill();
      _ctx.globalAlpha = 1;

      // Snow on peaks — white ink overlay, crisp on near ridges, soft on far
      const snowAlpha = R.a * (ri < 2 ? 0.35 : ri < 4 ? 0.55 : 0.72);
      _ctx.fillStyle = isNight ? `rgba(220,235,255,${snowAlpha})` : `rgba(252,255,255,${snowAlpha})`;
      _ctx.beginPath();
      _ctx.moveTo(xL - panOff, ridgeMid + h * R.hFrac * 0.10);
      for (let pi = 0; pi <= R.count; pi++) {
        const px    = xL + pi * step - panOff;
        const py    = peakY(pi);
        const snowL = py + (ridgeMid - py) * 0.30;   // top 30% = snow cap
        if (pi === 0) { _ctx.lineTo(px, snowL); continue; }
        const ppy   = peakY(pi - 1);
        const psnow = ppy + (ridgeMid - ppy) * 0.30;
        const cpY   = Math.min(snowL, psnow) - h * R.hFrac * 0.04;
        _ctx.quadraticCurveTo(px - step * 0.5, cpY, px, snowL);
      }
      _ctx.lineTo(xR - panOff, ridgeMid + h * R.hFrac * 0.10);
      _ctx.closePath(); _ctx.fill();
    });

    // ── Foreground pine silhouettes (Korean sansu signature element) ─
    const pinePanOff = (_panAz / 360) * w * 3 * 0.30;
    const pineBase   = groundY - h * 0.01;
    const pineCount  = 14;
    const PINE_W = w * 3;
    for (let pi = 0; pi < pineCount; pi++) {
      const ps  = (pi * 137) % 1000 / 1000;
      const ps2 = (pi * 89)  % 1000 / 1000;
      const px  = ((ps * PINE_W) - pinePanOff % PINE_W + PINE_W) % PINE_W - w;
      if (px < -w * 0.2 || px > w * 1.2) continue;
      const ph  = h * (0.12 + ps2 * 0.10);
      const pw  = ph * (0.25 + ps * 0.15);
      const col = isNight ? `rgba(12,18,28,${0.7 + ps * 0.28})` : `rgba(22,28,38,${0.65 + ps * 0.30})`;
      _ctx.fillStyle = col;
      // Layered pine tiers
      for (let ti = 0; ti < 4; ti++) {
        const tf   = ti / 4;
        const ty   = pineBase - ph * tf;
        const twr  = pw * (0.85 - tf * 0.60);
        _ctx.beginPath();
        _ctx.moveTo(px, ty - ph * 0.28);
        _ctx.bezierCurveTo(px + twr * 0.4, ty - ph * 0.10, px + twr, ty + ph * 0.02, px + twr * 0.65, ty + ph * 0.06);
        _ctx.bezierCurveTo(px + twr * 0.25, ty + ph * 0.03, px - twr * 0.25, ty + ph * 0.03, px - twr * 0.65, ty + ph * 0.06);
        _ctx.bezierCurveTo(px - twr, ty + ph * 0.02, px - twr * 0.4, ty - ph * 0.10, px, ty - ph * 0.28);
        _ctx.closePath(); _ctx.fill();
      }
      // Trunk
      _ctx.fillRect(px - pw * 0.05, pineBase - ph * 0.18, pw * 0.10, ph * 0.18);
    }

    // ── Snow ground ──────────────────────────────────────────────
    if (groundY < h) {
      const gnd = _ctx.createLinearGradient(0, groundY, 0, h);
      gnd.addColorStop(0, isNight ? 'rgba(180,196,224,0.92)' : 'rgba(238,246,255,0.96)');
      gnd.addColorStop(0.4, isNight ? '#8090b4' : '#c8daf0');
      gnd.addColorStop(1,   isNight ? '#606888' : '#a8c0e0');
      _ctx.fillStyle = gnd; _ctx.fillRect(0, groundY, w, h - groundY);
      // Snow surface glint
      const glint = _ctx.createLinearGradient(0, groundY, 0, groundY + h * 0.05);
      glint.addColorStop(0, `rgba(255,255,255,${isNight ? 0.18 : 0.45})`);
      glint.addColorStop(1, 'rgba(255,255,255,0)');
      _ctx.fillStyle = glint; _ctx.fillRect(0, groundY, w, h * 0.05);
    }

    // ── Falling snow ─────────────────────────────────────────────
    _snowParticles.forEach(p => {
      p.y += p.speed;
      p.x += p.drift + Math.sin(t * 0.01 + p.phase) * 0.3;
      if (p.y > h + 4) { p.y = -4; p.x = Math.random() * w; }
      if (p.x > w + 4) p.x = -4;
      if (p.x < -4)    p.x = w + 4;
      _ctx.beginPath(); _ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      _ctx.fillStyle = `rgba(255,255,255,${p.alpha * (isNight ? 0.75 : 0.55)})`; _ctx.fill();
    });
  }

  // ── Public API ─────────────────────────────────────────────
  // _activeSceneType: 'sea' | 'space' | 'forest' | 'snow'
  let _activeSceneType = 'sea';

  function setScene(channel) {
    cancelAnimationFrame(_raf);
    _current = channel;
    if (!_canvas) return;

    // Map scene name → scene type (channel IDs are ignored — only scene names matter)
    const sceneMap = {
      sea: 'sea', default: 'sea',
      space: 'space',
      forest: 'forest',
      snow: 'snow',
    };
    _activeSceneType = sceneMap[channel] || 'sea';

    // Persist scene choice (decoupled from channel/music choice)
    localStorage.setItem('sr_scene', _activeSceneType);
    const mode = { sea:'default', space:'sleep', forest:'nature', snow:'focus' }[_activeSceneType] || 'default';

    if (typeof AmbientAudio !== 'undefined') AmbientAudio.setMode(mode);

    // Reset snow particles on scene entry
    if (_activeSceneType === 'snow') _snowParticles = null;

    let t = 0;
    function frame() {
      _raf = requestAnimationFrame(frame);
      t++;
      switch (_activeSceneType) {
        case 'space':  _spaceFrame(t);       break;
        case 'forest': _forestFrame(t, mode); break;
        case 'snow':   _snowFrame(t, mode);   break;
        default:       _worldFrame(t, mode);  break;
      }
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

  // Suppress inline starfield
  window._activeScene = '__cs__';

  // Restore last chosen SCENE (not channel — they are decoupled)
  const savedScene = localStorage.getItem('sr_scene') || 'sea';
  CanvasScenes.setScene(savedScene);

  // Highlight the correct scene button on load
  document.querySelectorAll('.scene-btn').forEach(b => b.classList.remove('active-scene'));
  const activeBtn = document.getElementById('scene-' + savedScene);
  if (activeBtn) activeBtn.classList.add('active-scene');

  // Channel buttons only change music — they NEVER touch the scene
  // (channel:changed is handled by channels.js for playlist only)

  // Refresh sky colour every hour (time-of-day driven automatically)
  setInterval(() => { CanvasScenes.setScene(CanvasScenes.current()); }, 60 * 60 * 1000);
});

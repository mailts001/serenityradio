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
  // Returns [topColor, midColor, botColor] as rgba strings
  function _skyPalette(hr, mode) {
    // hr: 0–24 float
    // Base palette checkpoints
    const raw = (() => {
      if (hr < 4.5)  return { top:'#020610', mid:'#04091c', bot:'#060c24' }; // deep night
      if (hr < 5.5)  return { top:'#0a0518', mid:'#1a0820', bot:'#2a1228' }; // pre-dawn purple
      if (hr < 6.5)  return { top:'#150818', mid:'#3a1020', bot:'#7a2828' }; // dawn rose
      if (hr < 7.5)  return { top:'#1a0c18', mid:'#48201a', bot:'#a04030' }; // sunrise warm
      if (hr < 9)    return { top:'#0a1020', mid:'#1a2838', bot:'#2a4058' }; // morning blue
      if (hr < 12)   return { top:'#081420', mid:'#102030', bot:'#1a3248' }; // mid-morning
      if (hr < 14)   return { top:'#060e1c', mid:'#0e1c2e', bot:'#162a40' }; // noon
      if (hr < 16)   return { top:'#081220', mid:'#121e30', bot:'#1e3048' }; // afternoon
      if (hr < 17.5) return { top:'#120c18', mid:'#301828', bot:'#603018' }; // late afternoon amber
      if (hr < 18.5) return { top:'#180a10', mid:'#3a1a10', bot:'#804020' }; // golden hour
      if (hr < 19.5) return { top:'#160810', mid:'#280a18', bot:'#4a1828' }; // dusk
      if (hr < 21)   return { top:'#0c0614', mid:'#14081e', bot:'#200a28' }; // twilight
      return { top:'#020610', mid:'#04091c', bot:'#060c24' };                 // night
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
    const g = _ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0,   p.top);
    g.addColorStop(0.45, p.mid);
    g.addColorStop(1,   p.bot);
    _ctx.fillStyle = g;
    _ctx.fillRect(0, 0, w, h);

    // Horizon glow at dawn/dusk
    if ((hr >= 5.5 && hr <= 8) || (hr >= 17 && hr <= 20)) {
      const intensity = hr < 12
        ? Math.sin(((hr - 5.5) / 2.5) * Math.PI) * 0.18
        : Math.sin(((hr - 17)  / 3.0) * Math.PI) * 0.22;
      const hg = _ctx.createLinearGradient(0, h * 0.5, 0, h * 0.75);
      const col = hr < 12 ? `rgba(220,100,50,${intensity})` : `rgba(200,80,30,${intensity})`;
      hg.addColorStop(0, col);
      hg.addColorStop(1, 'rgba(0,0,0,0)');
      _ctx.fillStyle = hg;
      _ctx.fillRect(0, h * 0.5, w, h * 0.25);
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

    // Moon — sleep mode always, others only at night
    const showMoon = mode === 'sleep' || nightness > 0.3;
    if (showMoon) {
      const moonAlpha = Math.min(0.95, (mode === 'sleep' ? 0.5 : 0) + nightness * 0.85);
      if (moonAlpha > 0.05) {
        const mx = w * 0.78, my = h * 0.18, mr = Math.min(w, h) * 0.055;
        // Moon glow
        const mg = _ctx.createRadialGradient(mx, my, 0, mx, my, mr * 3.5);
        mg.addColorStop(0, `rgba(200,215,255,${moonAlpha * 0.22})`);
        mg.addColorStop(1, 'rgba(200,215,255,0)');
        _ctx.fillStyle = mg; _ctx.fillRect(0, 0, w, h);
        // Moon disc
        _ctx.beginPath(); _ctx.arc(mx, my, mr, 0, Math.PI * 2);
        _ctx.fillStyle = `rgba(228,235,255,${moonAlpha})`;
        _ctx.fill();
        // Crescent shadow
        _ctx.beginPath(); _ctx.arc(mx + mr * 0.28, my - mr * 0.08, mr * 0.88, 0, Math.PI * 2);
        _ctx.fillStyle = _skyPalette(hr, mode).top;
        _ctx.fill();
      }
    }
  }

  // ── Mist / atmosphere ──────────────────────────────────────
  function _drawMist(t, hr, mode) {
    const w = _canvas.width, h = _canvas.height;
    const layers = mode === 'nature' ? 5 : mode === 'sleep' ? 4 : 3;
    const baseDensity = mode === 'nature' ? 0.055 : mode === 'sleep' ? 0.05 : 0.032;

    for (let i = 0; i < layers; i++) {
      const yFrac = 0.45 + i * 0.12;
      const drift  = Math.sin(t * 0.003 + i * 1.8) * 0.012;
      const alpha  = baseDensity * (0.7 + 0.3 * Math.sin(t * 0.005 + i * 2.1));
      const mg = _ctx.createLinearGradient(0, h * (yFrac - 0.06), 0, h * (yFrac + 0.06));
      mg.addColorStop(0,   'rgba(180,210,195,0)');
      mg.addColorStop(0.4, `rgba(180,210,195,${alpha})`);
      mg.addColorStop(0.6, `rgba(180,210,195,${alpha * 0.8})`);
      mg.addColorStop(1,   'rgba(180,210,195,0)');
      _ctx.fillStyle = mg;
      // Slight horizontal pan
      _ctx.save();
      _ctx.translate(drift * w, 0);
      _ctx.fillRect(-w * 0.1, h * (yFrac - 0.06), w * 1.2, h * 0.12);
      _ctx.restore();
    }
  }

  // ── Water shimmer ──────────────────────────────────────────
  function _drawWater(t, hr, mode) {
    const w = _canvas.width, h = _canvas.height;
    const waterTop = h * (mode === 'sleep' ? 0.72 : 0.80);
    const waveCount = mode === 'sleep' ? 6 : 4;
    const waveAlpha = mode === 'sleep' ? 0.10 : 0.055;

    // Dark water base
    const wg = _ctx.createLinearGradient(0, waterTop, 0, h);
    wg.addColorStop(0, 'rgba(10,20,40,0)');
    wg.addColorStop(0.3, `rgba(8,16,35,0.5)`);
    wg.addColorStop(1, 'rgba(4,8,20,0.85)');
    _ctx.fillStyle = wg;
    _ctx.fillRect(0, waterTop, w, h - waterTop);

    // Wave ripples
    for (let i = 0; i < waveCount; i++) {
      const amp   = (mode === 'sleep' ? 10 : 4) + i * 3;
      const freq  = 0.006 - i * 0.0005;
      const phase = t * (0.012 - i * 0.002) + i * 1.4;
      const yBase = waterTop + (h - waterTop) * (i * 0.15);
      _ctx.beginPath();
      _ctx.moveTo(0, yBase);
      for (let x = 0; x <= w; x += 4) {
        _ctx.lineTo(x, yBase + Math.sin(x * freq + phase) * amp);
      }
      _ctx.lineTo(w, h); _ctx.lineTo(0, h); _ctx.closePath();
      _ctx.fillStyle = `rgba(20,50,100,${waveAlpha - i * 0.008})`;
      _ctx.fill();
    }

    // Light reflection on water surface
    if (hr >= 5.5 && hr <= 19.5 || mode === 'sleep') {
      const reflAlpha = mode === 'sleep'
        ? 0.04
        : Math.sin(((hr - 5.5) / 14) * Math.PI) * 0.06;
      const rg = _ctx.createLinearGradient(0, waterTop, 0, waterTop + 40);
      rg.addColorStop(0, `rgba(160,190,220,${reflAlpha})`);
      rg.addColorStop(1, 'rgba(160,190,220,0)');
      _ctx.fillStyle = rg;
      _ctx.fillRect(0, waterTop, w, 40);
    }
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

  // ── Main world frame ───────────────────────────────────────
  function _worldFrame(t, mode) {
    const hr = new Date().getHours() + new Date().getMinutes() / 60;
    _drawSky(hr, mode);
    _drawStarsAndMoon(t, hr, mode);
    _drawMist(t, hr, mode);
    _drawWater(t, hr, mode);
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

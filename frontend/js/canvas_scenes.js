/* ══════════════════════════════════════════
   SERENITY RADIO — canvas_scenes.js
   Channel-specific animated backgrounds
   sleep   → drifting ocean waves + moon
   focus   → slow geometric grid pulses
   yoga    → warm sunrise gradient + particles
   nature  → floating leaves & mist
   default → starfield (existing)
   ══════════════════════════════════════════ */

const CanvasScenes = (() => {
  let _canvas, _ctx, _raf, _current = null;

  function init(canvasEl) {
    _canvas = canvasEl;
    _ctx    = _canvas.getContext('2d');
    _resize();
    window.addEventListener('resize', _resize);
  }

  function _resize() {
    if (!_canvas) return;
    _canvas.width  = window.innerWidth;
    _canvas.height = window.innerHeight;
  }

  // Map hour-of-day → channel scene (mirrors SCHEDULE in index.html)
  function _sceneForHour(h) {
    if (h >= 0  && h < 4)  return 'sleep';    // 12AM–4AM  Deep Sleep
    if (h >= 4  && h < 8)  return 'nature';   // 4AM–8AM   Dawn / Morning
    if (h >= 8  && h < 12) return 'yoga';     // 8AM–12PM  Morning calm
    if (h >= 12 && h < 16) return 'focus';    // 12PM–4PM  Midday focus
    if (h >= 16 && h < 20) return 'nature';   // 4PM–8PM   Afternoon ease
    if (h >= 20 && h < 22) return 'sleep';    // 8PM–10PM  Twilight wind-down
    return 'sleep';                             // 10PM–12AM Night
  }

  function setScene(channel) {
    cancelAnimationFrame(_raf);
    _current = channel;
    // 'default' / 'auto' → time-based scene, transitions every hour
    const scene = (channel === 'default' || channel === 'auto')
      ? _sceneForHour(new Date().getHours())
      : channel;
    switch (scene) {
      case 'sleep':   _sceneSleep();   break;
      case 'focus':   _sceneFocus();   break;
      case 'yoga':    _sceneYoga();    break;
      case 'nature':  _sceneNature();  break;
      default:        _sceneStars();   break;
    }
  }

  // ── SLEEP: ocean waves + moon ──────────────────────────
  function _sceneSleep() {
    const W = () => _canvas.width, H = () => _canvas.height;
    let t = 0;
    const waves = Array.from({length:5}, (_,i) => ({
      amp: 18 + i * 8, freq: 0.008 - i * 0.001,
      phase: i * 1.2, speed: 0.003 + i * 0.0008,
      alpha: 0.06 + i * 0.03, y: 0.55 + i * 0.07,
    }));

    function frame() {
      _raf = requestAnimationFrame(frame);
      t += 1;
      const w = W(), h = H();
      // Deep night sky gradient
      const sky = _ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, '#06091a');
      sky.addColorStop(0.6, '#0d1b3e');
      sky.addColorStop(1, '#1a2a55');
      _ctx.fillStyle = sky;
      _ctx.fillRect(0, 0, w, h);

      // Moon
      const mx = w * 0.78, my = h * 0.22, mr = Math.min(w, h) * 0.06;
      const mg = _ctx.createRadialGradient(mx, my, 0, mx, my, mr * 2.5);
      mg.addColorStop(0, 'rgba(220,230,255,0.18)');
      mg.addColorStop(1, 'rgba(220,230,255,0)');
      _ctx.fillStyle = mg; _ctx.fillRect(0, 0, w, h);
      _ctx.beginPath(); _ctx.arc(mx, my, mr, 0, Math.PI * 2);
      _ctx.fillStyle = 'rgba(230,235,255,0.9)'; _ctx.fill();

      // Stars
      if (t === 1) {
        _sceneSleep._stars = Array.from({length:120}, () => ({
          x: Math.random(), y: Math.random() * 0.55,
          r: Math.random() * 1.4, a: Math.random()
        }));
      }
      (_sceneSleep._stars || []).forEach(s => {
        _ctx.beginPath();
        _ctx.arc(s.x * w, s.y * h, s.r, 0, Math.PI * 2);
        _ctx.fillStyle = `rgba(255,255,255,${s.a * (0.5 + 0.5 * Math.sin(t * 0.02 + s.x * 10))})`;
        _ctx.fill();
      });

      // Waves
      waves.forEach(wave => {
        wave.phase += wave.speed;
        _ctx.beginPath();
        _ctx.moveTo(0, wave.y * h);
        for (let x = 0; x <= w; x += 3) {
          const y = wave.y * h + Math.sin(x * wave.freq + wave.phase) * wave.amp;
          _ctx.lineTo(x, y);
        }
        _ctx.lineTo(w, h); _ctx.lineTo(0, h); _ctx.closePath();
        _ctx.fillStyle = `rgba(30,80,160,${wave.alpha})`;
        _ctx.fill();
      });
    }
    frame();
  }

  // ── FOCUS: geometric grid pulses ──────────────────────
  function _sceneFocus() {
    const W = () => _canvas.width, H = () => _canvas.height;
    let t = 0;
    function frame() {
      _raf = requestAnimationFrame(frame);
      t += 0.5;
      const w = W(), h = H();
      _ctx.fillStyle = '#0a0f1e';
      _ctx.fillRect(0, 0, w, h);

      // Grid lines
      const spacing = 60;
      _ctx.strokeStyle = 'rgba(60,120,220,0.12)';
      _ctx.lineWidth = 1;
      for (let x = 0; x < w; x += spacing) {
        _ctx.beginPath(); _ctx.moveTo(x, 0); _ctx.lineTo(x, h); _ctx.stroke();
      }
      for (let y = 0; y < h; y += spacing) {
        _ctx.beginPath(); _ctx.moveTo(0, y); _ctx.lineTo(w, y); _ctx.stroke();
      }

      // Pulsing intersection points
      for (let xi = spacing; xi < w; xi += spacing) {
        for (let yi = spacing; yi < h; yi += spacing) {
          const pulse = Math.sin(t * 0.04 + (xi + yi) * 0.02);
          const alpha = 0.08 + 0.12 * ((pulse + 1) / 2);
          const r     = 2 + 3 * ((pulse + 1) / 2);
          _ctx.beginPath();
          _ctx.arc(xi, yi, r, 0, Math.PI * 2);
          _ctx.fillStyle = `rgba(80,160,255,${alpha})`;
          _ctx.fill();
        }
      }

      // Central glow
      const cx = w / 2, cy = h / 2;
      const pulse = Math.sin(t * 0.03);
      const glow  = _ctx.createRadialGradient(cx, cy, 0, cx, cy, h * 0.6);
      glow.addColorStop(0, `rgba(40,100,220,${0.08 + 0.05 * pulse})`);
      glow.addColorStop(1, 'rgba(40,100,220,0)');
      _ctx.fillStyle = glow;
      _ctx.fillRect(0, 0, w, h);
    }
    frame();
  }

  // ── YOGA: soft blush aurora — gentle breath-pulsing orbs ─
  function _sceneYoga() {
    const W = () => _canvas.width, H = () => _canvas.height;
    let t = 0;
    // Soft pastel palette: blush, rose-gold, lavender, warm sand
    const palette = [
      { h: 340, s: 45, l: 62 },   // blush rose
      { h: 28,  s: 55, l: 68 },   // warm peach
      { h: 270, s: 30, l: 58 },   // soft lavender
      { h: 350, s: 38, l: 70 },   // petal pink
      { h: 45,  s: 50, l: 72 },   // golden sand
    ];
    const orbs = Array.from({length: 8}, (_, i) => ({
      x: 0.1 + Math.random() * 0.8, y: 0.1 + Math.random() * 0.8,
      r: 0.18 + Math.random() * 0.22,   // fraction of min(w,h)
      vx: (Math.random() - 0.5) * 0.00015,
      vy: (Math.random() - 0.5) * 0.00015,
      phaseOff: Math.random() * Math.PI * 2,
      col: palette[i % palette.length],
    }));

    function frame() {
      _raf = requestAnimationFrame(frame);
      t += 0.6;
      const w = W(), h = H();
      const R = Math.min(w, h);

      // Deep dusky background — warm very dark mauve
      const bg = _ctx.createLinearGradient(0, 0, w * 0.4, h);
      bg.addColorStop(0,   '#120a10');
      bg.addColorStop(0.5, '#16090e');
      bg.addColorStop(1,   '#0e0b14');
      _ctx.fillStyle = bg;
      _ctx.fillRect(0, 0, w, h);

      // Slow breath cycle (~4 s inhale, 4 s exhale at 60fps)
      const breath = (Math.sin(t * 0.012) + 1) / 2; // 0→1→0

      orbs.forEach(o => {
        o.x += o.vx; o.y += o.vy;
        if (o.x < 0.05) { o.x = 0.05; o.vx *= -1; }
        if (o.x > 0.95) { o.x = 0.95; o.vx *= -1; }
        if (o.y < 0.05) { o.y = 0.05; o.vy *= -1; }
        if (o.y > 0.95) { o.y = 0.95; o.vy *= -1; }

        const bPulse = Math.sin(t * 0.012 + o.phaseOff);
        const radius  = o.r * R * (0.9 + 0.2 * bPulse);
        const alpha   = 0.10 + 0.06 * bPulse;
        const { h: hue, s: sat, l: lig } = o.col;
        const gr = _ctx.createRadialGradient(o.x*w, o.y*h, 0, o.x*w, o.y*h, radius);
        gr.addColorStop(0, `hsla(${hue},${sat}%,${lig}%,${alpha + 0.04})`);
        gr.addColorStop(0.5, `hsla(${hue},${sat}%,${lig}%,${alpha * 0.5})`);
        gr.addColorStop(1, `hsla(${hue},${sat}%,${lig}%,0)`);
        _ctx.fillStyle = gr;
        _ctx.fillRect(0, 0, w, h);
      });

      // Central soft golden glow that pulses with breath
      const cx = w * 0.5, cy = h * 0.52;
      const cg = _ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.35);
      cg.addColorStop(0, `rgba(255,210,140,${0.07 + 0.05 * breath})`);
      cg.addColorStop(1, 'rgba(255,180,100,0)');
      _ctx.fillStyle = cg;
      _ctx.fillRect(0, 0, w, h);
    }
    frame();
  }

  // ── NATURE: soft meadow light + petal drift ────────────
  function _sceneNature() {
    const W = () => _canvas.width, H = () => _canvas.height;
    let t = 0;
    // Petals: softer, lighter than dark forest leaves
    function _newPetal(W, H, init) {
      return {
        x: Math.random() * (W() || 800),
        y: init ? Math.random() * (H() || 600) : -20,
        size: 5 + Math.random() * 8,
        speed: 0.25 + Math.random() * 0.35,  // very slow drift
        drift: (Math.random() - 0.5) * 0.35,
        rot: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.025,
        hue: 90 + Math.random() * 80,         // greens + sage + lime
        sat: 28 + Math.random() * 20,          // desaturated — not vivid
        lig: 55 + Math.random() * 20,          // mid-bright, airy
        alpha: 0.22 + Math.random() * 0.28,
      };
    }
    const petals = Array.from({length: 28}, () => _newPetal(W, H, true));

    function _drawPetal(p) {
      _ctx.save();
      _ctx.translate(p.x, p.y);
      _ctx.rotate(p.rot);
      _ctx.beginPath();
      _ctx.ellipse(0, 0, p.size, p.size * 0.45, 0, 0, Math.PI * 2);
      _ctx.fillStyle = `hsla(${p.hue},${p.sat}%,${p.lig}%,${p.alpha})`;
      _ctx.fill();
      _ctx.restore();
    }

    function frame() {
      _raf = requestAnimationFrame(frame);
      t += 0.7;
      const w = W(), h = H();

      // Soft dusk-meadow — muted sage/teal gradient, not pitch black
      const bg = _ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0,   '#0a1510');
      bg.addColorStop(0.4, '#0f1e14');
      bg.addColorStop(1,   '#111a0e');
      _ctx.fillStyle = bg;
      _ctx.fillRect(0, 0, w, h);

      // Ambient ground glow — warm sage
      const gg = _ctx.createRadialGradient(w * 0.5, h * 0.85, 0, w * 0.5, h * 0.85, w * 0.6);
      gg.addColorStop(0, `rgba(140,200,120,${0.05 + 0.02 * Math.sin(t * 0.008)})`);
      gg.addColorStop(1, 'rgba(140,200,120,0)');
      _ctx.fillStyle = gg;
      _ctx.fillRect(0, 0, w, h);

      // Soft diffused light shafts — barely visible, creamy
      for (let i = 0; i < 3; i++) {
        const rx     = w * (0.25 + i * 0.25);
        const sway   = Math.sin(t * 0.004 + i * 1.4) * 0.06;
        const shimmer = 0.018 + 0.008 * Math.sin(t * 0.009 + i);
        const rg = _ctx.createLinearGradient(rx, 0, rx + sway * h, h);
        rg.addColorStop(0,   `rgba(210,240,180,${shimmer})`);
        rg.addColorStop(0.6, `rgba(210,240,180,${shimmer * 0.3})`);
        rg.addColorStop(1,   'rgba(210,240,180,0)');
        _ctx.fillStyle = rg;
        _ctx.beginPath();
        _ctx.moveTo(rx - 15, 0); _ctx.lineTo(rx + 15, 0);
        _ctx.lineTo(rx + sway * h + 60, h); _ctx.lineTo(rx + sway * h - 60, h);
        _ctx.closePath(); _ctx.fill();
      }

      // Soft mist — just a gentle horizon haze
      const mg = _ctx.createLinearGradient(0, h * 0.55, 0, h * 0.75);
      mg.addColorStop(0, 'rgba(180,220,170,0)');
      mg.addColorStop(0.5, `rgba(180,220,170,${0.04 + 0.015 * Math.sin(t * 0.006)})`);
      mg.addColorStop(1, 'rgba(180,220,170,0)');
      _ctx.fillStyle = mg;
      _ctx.fillRect(0, h * 0.55, w, h * 0.2);

      // Petals
      petals.forEach((p, i) => {
        p.y   += p.speed;
        p.x   += p.drift + Math.sin(t * 0.015 + i * 0.7) * 0.25;
        p.rot += p.rotSpeed;
        if (p.y > h + 20) petals[i] = _newPetal(W, H, false);
        _drawPetal(p);
      });
    }
    frame();
  }

  // ── DEFAULT: starfield (original) ──────────────────────
  function _sceneStars() {
    const W = () => _canvas.width, H = () => _canvas.height;
    const stars = Array.from({length: 200}, () => ({
      x: Math.random(), y: Math.random(),
      r: Math.random() * 1.5,
      a: Math.random(),
      speed: Math.random() * 0.0002,
    }));
    let t = 0;
    function frame() {
      _raf = requestAnimationFrame(frame);
      t += 1;
      const w = W(), h = H();
      _ctx.fillStyle = 'rgba(8,10,20,0.25)';
      _ctx.fillRect(0, 0, w, h);
      stars.forEach(s => {
        s.a += s.speed;
        _ctx.beginPath();
        _ctx.arc(s.x * w, s.y * h, s.r, 0, Math.PI * 2);
        _ctx.fillStyle = `rgba(255,255,255,${Math.abs(Math.sin(s.a))})`;
        _ctx.fill();
      });
    }
    // Initial clear
    _ctx.fillStyle = '#08090f';
    _ctx.fillRect(0, W(), H(), 0);
    frame();
  }

  function current() { return _current; }

  return { init, setScene, current };
})();

// Auto-init if canvas#bg exists
document.addEventListener('DOMContentLoaded', () => {
  const c = document.getElementById('bg') || document.querySelector('canvas');
  if (c) CanvasScenes.init(c);

  // Wire to channel system
  document.addEventListener('channel:changed', e => {
    CanvasScenes.setScene(e.detail || 'default');
  });

  // Hourly refresh for 'default' (time-based) mode — scene follows the clock
  setInterval(() => {
    if (CanvasScenes.current() === 'default' || CanvasScenes.current() === 'auto') {
      CanvasScenes.setScene('default');
    }
  }, 60 * 60 * 1000);
});

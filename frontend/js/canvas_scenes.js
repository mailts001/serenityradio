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

  function setScene(channel) {
    cancelAnimationFrame(_raf);
    _current = channel;
    switch (channel) {
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

  // ── YOGA: sunrise gradient + floating orbs ─────────────
  function _sceneYoga() {
    const W = () => _canvas.width, H = () => _canvas.height;
    let t = 0;
    const orbs = Array.from({length: 12}, (_, i) => ({
      x: Math.random(), y: Math.random(),
      r: 40 + Math.random() * 80,
      vx: (Math.random() - 0.5) * 0.0003,
      vy: (Math.random() - 0.5) * 0.0003,
      hue: 20 + i * 12,
    }));
    function frame() {
      _raf = requestAnimationFrame(frame);
      t += 1;
      const w = W(), h = H();

      // Sunrise gradient — slowly shifts
      const sunAngle = (t * 0.002) % 1;
      const bg = _ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, `hsl(${10 + sunAngle * 30},60%,${8 + sunAngle * 10}%)`);
      bg.addColorStop(0.4, `hsl(${25 + sunAngle * 20},70%,${12 + sunAngle * 8}%)`);
      bg.addColorStop(1, `hsl(${35 + sunAngle * 10},50%,${6 + sunAngle * 5}%)`);
      _ctx.fillStyle = bg;
      _ctx.fillRect(0, 0, w, h);

      // Floating orbs
      orbs.forEach(o => {
        o.x += o.vx; o.y += o.vy;
        if (o.x < -0.1) o.x = 1.1;
        if (o.x > 1.1)  o.x = -0.1;
        if (o.y < -0.1) o.y = 1.1;
        if (o.y > 1.1)  o.y = -0.1;
        const pulse = Math.sin(t * 0.015 + o.hue);
        const gr = _ctx.createRadialGradient(o.x*w, o.y*h, 0, o.x*w, o.y*h, o.r*(1+0.3*pulse));
        gr.addColorStop(0, `hsla(${o.hue},80%,60%,0.12)`);
        gr.addColorStop(1, `hsla(${o.hue},80%,60%,0)`);
        _ctx.fillStyle = gr;
        _ctx.fillRect(0, 0, w, h);
      });

      // Horizon glow
      const gy = _ctx.createLinearGradient(0, h * 0.5, 0, h * 0.7);
      gy.addColorStop(0, 'rgba(255,140,60,0.15)');
      gy.addColorStop(1, 'rgba(255,100,40,0)');
      _ctx.fillStyle = gy;
      _ctx.fillRect(0, h * 0.5, w, h * 0.2);
    }
    frame();
  }

  // ── NATURE: falling leaves + mist ──────────────────────
  function _sceneNature() {
    const W = () => _canvas.width, H = () => _canvas.height;
    let t = 0;
    const leaves = Array.from({length: 30}, () => _newLeaf(W, H, true));
    function _newLeaf(W, H, init) {
      return {
        x: Math.random() * (W() || 800),
        y: init ? Math.random() * (H() || 600) : -20,
        size: 6 + Math.random() * 10,
        speed: 0.4 + Math.random() * 0.6,
        drift: (Math.random() - 0.5) * 0.5,
        rot: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.04,
        hue: 80 + Math.random() * 60,
        alpha: 0.4 + Math.random() * 0.5,
      };
    }
    function _drawLeaf(l) {
      _ctx.save();
      _ctx.translate(l.x, l.y);
      _ctx.rotate(l.rot);
      _ctx.beginPath();
      _ctx.ellipse(0, 0, l.size, l.size * 0.5, 0, 0, Math.PI * 2);
      _ctx.fillStyle = `hsla(${l.hue},60%,40%,${l.alpha})`;
      _ctx.fill();
      _ctx.restore();
    }
    function frame() {
      _raf = requestAnimationFrame(frame);
      t += 1;
      const w = W(), h = H();

      // Deep forest gradient
      const bg = _ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#08150a');
      bg.addColorStop(0.5, '#0d2010');
      bg.addColorStop(1, '#0a1808');
      _ctx.fillStyle = bg;
      _ctx.fillRect(0, 0, w, h);

      // Mist layers
      for (let i = 0; i < 3; i++) {
        const my = h * (0.3 + i * 0.2);
        const mg = _ctx.createLinearGradient(0, my - 60, 0, my + 60);
        mg.addColorStop(0, 'rgba(200,220,200,0)');
        mg.addColorStop(0.5, `rgba(200,220,200,${0.04 + 0.02 * Math.sin(t * 0.01 + i)})`);
        mg.addColorStop(1, 'rgba(200,220,200,0)');
        _ctx.fillStyle = mg;
        _ctx.fillRect(0, my - 60, w, 120);
      }

      // Leaves
      leaves.forEach((l, i) => {
        l.y     += l.speed;
        l.x     += l.drift + Math.sin(t * 0.02 + i) * 0.3;
        l.rot   += l.rotSpeed;
        if (l.y > h + 30) leaves[i] = _newLeaf(W, H, false);
        _drawLeaf(l);
      });

      // Light rays from top
      for (let i = 0; i < 4; i++) {
        const rx   = w * (0.2 + i * 0.2);
        const angle = 0.1 * Math.sin(t * 0.005 + i);
        const rg   = _ctx.createLinearGradient(rx, 0, rx + Math.sin(angle) * h, h);
        rg.addColorStop(0, `rgba(180,255,120,${0.04 + 0.02 * Math.sin(t * 0.01 + i)})`);
        rg.addColorStop(1, 'rgba(180,255,120,0)');
        _ctx.fillStyle = rg;
        _ctx.beginPath();
        _ctx.moveTo(rx - 20, 0);
        _ctx.lineTo(rx + 20, 0);
        _ctx.lineTo(rx + Math.sin(angle) * h + 80, h);
        _ctx.lineTo(rx + Math.sin(angle) * h - 80, h);
        _ctx.closePath();
        _ctx.fill();
      }
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

  return { init, setScene };
})();

// Auto-init if canvas#bg exists
document.addEventListener('DOMContentLoaded', () => {
  const c = document.getElementById('bg') || document.querySelector('canvas');
  if (c) CanvasScenes.init(c);
  // Wire to channel system
  document.addEventListener('channel:changed', e => {
    CanvasScenes.setScene(e.detail || 'default');
  });
});

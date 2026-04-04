/* ══════════════════════════════════════════
   SERENITY RADIO — canvas.js
   Animated star field + shooting stars
   ══════════════════════════════════════════ */

(function () {
  const canvas = document.getElementById('bg-canvas');
  const ctx    = canvas.getContext('2d');

  let W, H, stars = [], shooters = [];

  function resizeCanvas() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  function initStars() {
    stars = [];
    const count = Math.floor((W * H) / 11000);
    for (let i = 0; i < count; i++) {
      stars.push({
        x:     Math.random() * W,
        y:     Math.random() * H,
        r:     Math.random() * 1.4 + 0.3,
        op:    Math.random() * 0.7 + 0.15,
        speed: Math.random() * 0.4 + 0.05,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  function spawnShooter() {
    if (Math.random() > 0.004) return;
    shooters.push({
      x:   Math.random() * W * 0.6,
      y:   Math.random() * H * 0.35,
      len: Math.random() * 80 + 40,
      spd: Math.random() * 6 + 4,
      op:  1,
      a:   Math.PI / 4,
    });
  }

  function draw(timestamp) {
    ctx.clearRect(0, 0, W, H);
    const t = timestamp * 0.001;

    // Stars
    stars.forEach(s => {
      const op = s.op * (0.65 + 0.35 * Math.sin(t * s.speed + s.phase));
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(220, 215, 200, ${op})`;
      ctx.fill();
    });

    // Shooting stars
    spawnShooter();
    shooters = shooters.filter(s => s.op > 0);
    shooters.forEach(s => {
      const x2 = s.x - Math.cos(s.a) * s.len;
      const y2 = s.y - Math.sin(s.a) * s.len;
      const grad = ctx.createLinearGradient(s.x, s.y, x2, y2);
      grad.addColorStop(0, `rgba(200, 220, 200, ${s.op})`);
      grad.addColorStop(1, 'rgba(200, 220, 200, 0)');
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = grad;
      ctx.lineWidth   = 1.5;
      ctx.stroke();
      s.x  += Math.cos(s.a) * s.spd;
      s.y  += Math.sin(s.a) * s.spd;
      s.op -= 0.018;
    });

    requestAnimationFrame(draw);
  }

  // Spawn ambient floating particles
  function spawnParticle() {
    const el   = document.createElement('div');
    el.className = 'particle';
    const size = Math.random() * 5 + 2;
    const colors = [
      'rgba(122,158,126,.4)',
      'rgba(107,127,168,.35)',
      'rgba(201,149,106,.3)',
      'rgba(184,212,187,.3)',
    ];
    el.style.cssText = [
      `width:${size}px`,
      `height:${size}px`,
      `left:${Math.random() * 100}%`,
      `background:${colors[Math.floor(Math.random() * colors.length)]}`,
      `animation-duration:${12 + Math.random() * 20}s`,
      `animation-delay:${Math.random() * 8}s`,
    ].join(';');
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 35000);
  }

  // Boot
  resizeCanvas();
  initStars();
  requestAnimationFrame(draw);
  window.addEventListener('resize', () => { resizeCanvas(); initStars(); });

  // Spawn particles every 1.8s
  setInterval(spawnParticle, 1800);
  for (let i = 0; i < 6; i++) spawnParticle();
})();

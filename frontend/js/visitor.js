/* ══════════════════════════════════════════
   SERENITY RADIO — visitor.js
   Animated visitor counter
   ══════════════════════════════════════════ */

let visitorBase = 2847;

function animateVisitors() {
  setInterval(() => {
    const delta = Math.floor(Math.random() * 7) - 2;
    visitorBase = Math.max(2400, visitorBase + delta);
    const el = document.getElementById('visitor-count');
    if (el) el.textContent = visitorBase.toLocaleString();
    const sl = document.getElementById('stat-listeners');
    if (sl) sl.textContent = (visitorBase / 1000).toFixed(1) + 'k';
  }, 4000);
}

animateVisitors();

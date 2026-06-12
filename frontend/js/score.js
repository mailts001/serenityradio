/* ══════════════════════════════════════════
   SERENITY RADIO — score.js
   Serenity Score™ daily check-in + history
   ══════════════════════════════════════════ */

const SESSION_KEY = 'sr_session';
const CHECKIN_KEY = 'sr_last_checkin';

function getSessionId() {
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) { id = 'sr_' + Math.random().toString(36).slice(2) + Date.now(); localStorage.setItem(SESSION_KEY, id); }
  return id;
}

function alreadyCheckedInToday() {
  return localStorage.getItem(CHECKIN_KEY) === new Date().toISOString().slice(0, 10);
}

// ── Render check-in modal ──
function openCheckin() {
  if (document.getElementById('checkin-modal')) return;

  const modal = document.createElement('div');
  modal.id = 'checkin-modal';
  modal.innerHTML = `
    <div class="modal-backdrop" onclick="closeCheckin()"></div>
    <div class="modal-box">
      <div class="modal-header">
        <span class="modal-title">Daily Serenity Check-in</span>
        <button class="modal-close" onclick="closeCheckin()">✕</button>
      </div>
      <p class="modal-sub">Rate each area from 1 (low) to 10 (high)</p>

      ${renderSlider('stress',  'Stress Level',   '1 = calm, 10 = overwhelmed', 5)}
      ${renderSlider('sleep',   'Sleep Quality',  '1 = terrible, 10 = great',   5)}
      ${renderSlider('energy',  'Energy',         '1 = exhausted, 10 = vibrant',5)}
      ${renderSlider('anxiety', 'Anxiety',        '1 = none, 10 = severe',      5)}
      ${renderSlider('mood',    'Mood',           '1 = low, 10 = great',        5)}

      <button class="btn btn-checkin" onclick="submitCheckin()">Calculate My Score →</button>
      <div id="checkin-result" style="display:none"></div>
    </div>`;
  document.body.appendChild(modal);
  requestAnimationFrame(() => modal.querySelector('.modal-box').classList.add('visible'));
}

function renderSlider(id, label, hint, def) {
  return `
    <div class="slider-row">
      <div class="slider-label">
        <span>${label}</span>
        <span class="slider-val" id="val-${id}">${def}</span>
      </div>
      <small style="color:var(--text-muted);font-size:11px">${hint}</small>
      <input type="range" min="1" max="10" value="${def}" class="score-slider"
        oninput="document.getElementById('val-${id}').textContent=this.value" data-key="${id}">
    </div>`;
}

async function submitCheckin() {
  const btn    = document.querySelector('.btn-checkin');
  btn.disabled = true; btn.textContent = 'Calculating...';

  const vals = {};
  document.querySelectorAll('.score-slider').forEach(s => vals[s.dataset.key] = parseInt(s.value));

  try {
    const res  = await fetch('/api/score/checkin', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ ...vals, session_id: getSessionId() }),
    });
    const data = await res.json();

    localStorage.setItem(CHECKIN_KEY, new Date().toISOString().slice(0, 10));
    localStorage.setItem('sr_last_score', JSON.stringify(data));

    showCheckinResult(data);
    updateScoreBadge(data.score);
    // Refresh account card score circle
    const circle = document.getElementById('au-score-circle');
    const sub    = document.getElementById('au-score-sub');
    if (circle) {
      circle.textContent = data.score;
      circle.style.background = data.score >= 70 ? '#2e7d32' : data.score >= 45 ? '#e65100' : '#c62828';
    }
    if (sub) sub.textContent = "Today's score ✓";

    // Auto-switch channel based on recommendation
    if (data.channel_rec && typeof switchChannel === 'function') {
      setTimeout(() => switchChannel(data.channel_rec), 1500);
    }

    // Fetch AI companion message
    fetchCompanionMessage({ ...vals, score: data.score });

  } catch(e) {
    btn.disabled = false; btn.textContent = 'Try Again';
  }
}

function showCheckinResult(data) {
  const el = document.getElementById('checkin-result');
  el.style.display = 'block';
  const color = data.score >= 70 ? '#6ac98a' : data.score >= 45 ? '#c9956a' : '#c96a6a';
  el.innerHTML = `
    <div class="score-reveal">
      <div class="score-circle" style="border-color:${color}">
        <div class="score-number" style="color:${color}">${data.score}</div>
        <div class="score-denom">/100</div>
      </div>
      <div class="score-insight">${data.insight}</div>
      <div class="score-rec">Switching to: <strong>${data.channel_rec}</strong> channel ✦</div>
      <div style="display:flex;gap:10px;justify-content:center;margin-top:1rem;flex-wrap:wrap">
        <button class="btn btn-sm btn-primary" onclick="openHistory()">View My History</button>
        <button class="btn btn-sm" style="background:var(--bg3);color:var(--text)" onclick="closeCheckin()">Close</button>
      </div>
    </div>`;
}

function updateScoreBadge(score) {
  let badge = document.getElementById('score-badge');
  if (!badge) {
    badge = document.createElement('div');
    badge.id = 'score-badge';
    badge.onclick = openCheckin;
    document.querySelector('.header-actions')?.prepend(badge);
  }
  const color = score >= 70 ? 'var(--green,#6ac98a)' : score >= 45 ? 'var(--amber)' : 'var(--red,#c96a6a)';
  badge.className = 'btn';
  badge.style.cssText = `background:var(--bg2);border:1px solid ${color};color:${color};cursor:pointer`;
  badge.innerHTML = `✦ ${score}<span style="font-size:10px;opacity:.7">/100</span>`;
}

// ── Score history modal ──
async function openHistory() {
  const res  = await fetch(`/api/score/history?session_id=${getSessionId()}&days=30`);
  const data = await res.json();

  let modal = document.getElementById('history-modal');
  if (modal) modal.remove();

  modal    = document.createElement('div');
  modal.id = 'history-modal';
  modal.innerHTML = `
    <div class="modal-backdrop" onclick="this.parentElement.remove()"></div>
    <div class="modal-box modal-wide">
      <div class="modal-header">
        <span class="modal-title">Serenity Score™ — 30 Days</span>
        <button class="modal-close" onclick="document.getElementById('history-modal').remove()">✕</button>
      </div>
      ${data.history.length
        ? `<canvas id="score-chart" height="180"></canvas><div id="score-chart-legend"></div>`
        : '<p style="color:var(--text-muted);text-align:center;padding:2rem">No history yet. Check in daily to track your progress.</p>'
      }
    </div>`;
  document.body.appendChild(modal);
  requestAnimationFrame(() => modal.querySelector('.modal-box').classList.add('visible'));

  if (data.history.length) renderScoreChart(data.history);
}

function renderScoreChart(history) {
  // Load Chart.js from CDN if not present
  if (!window.Chart) {
    const s = document.createElement('script');
    s.src   = 'https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js';
    s.onload = () => _drawChart(history);
    document.head.appendChild(s);
  } else {
    _drawChart(history);
  }
}

function _drawChart(history) {
  const labels = history.map(h => h.date.slice(5));  // MM-DD
  const scores = history.map(h => h.score);
  const ctx    = document.getElementById('score-chart').getContext('2d');

  new window.Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Serenity Score',
        data:  scores,
        borderColor:     '#7a9e7e',
        backgroundColor: 'rgba(122,158,126,0.1)',
        borderWidth:  2,
        pointBackgroundColor: '#b8d4bb',
        tension: 0.4,
        fill: true,
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        y: { min: 0, max: 100, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#9a9590' } },
        x: { grid: { display: false }, ticks: { color: '#9a9590' } },
      }
    }
  });
}

function closeCheckin() { document.getElementById('checkin-modal')?.remove(); }

// ── AI Companion ──
async function fetchCompanionMessage(scoreData) {
  try {
    const res  = await fetch('/api/companion', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ scores: scoreData }),
    });
    const data = await res.json();
    const el   = document.getElementById('dj-quote');
    if (el && data.message) {
      el.style.opacity = '0';
      setTimeout(() => { el.textContent = data.message; el.style.opacity = '1'; }, 400);
    }
  } catch(e) { /* silent */ }
}

// ── Heartbeat (keeps listener count accurate) ──
function startHeartbeat() {
  const sid = getSessionId();
  const ping = () => fetch('/api/heartbeat', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ session_id: sid }),
  }).catch(() => {});
  ping();
  setInterval(ping, 30000);
}

// ── Auto-prompt check-in if not done today ──
function maybePromptCheckin() {
  if (alreadyCheckedInToday()) {
    const saved = localStorage.getItem('sr_last_score');
    if (saved) { try { updateScoreBadge(JSON.parse(saved).score); } catch(e){} }
    return;
  }
  // Show subtle prompt after 10s
  setTimeout(() => {
    const toast = document.createElement('div');
    toast.id    = 'checkin-toast';
    toast.innerHTML = `
      <span>✦ Daily check-in ready</span>
      <button onclick="openCheckin();this.parentElement.remove()" style="background:var(--sage);color:#fff;border:none;padding:5px 14px;border-radius:20px;cursor:pointer;font-size:12px;margin-left:10px">Check in</button>
      <button onclick="this.parentElement.remove()" style="background:none;border:none;color:var(--text-muted);cursor:pointer;margin-left:6px">✕</button>`;
    document.body.appendChild(toast);
    setTimeout(() => toast?.remove(), 12000);
  }, 10000);
}

// ── Init ──
document.addEventListener('DOMContentLoaded', () => {
  startHeartbeat();
  maybePromptCheckin();
});

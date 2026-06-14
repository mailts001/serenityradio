/* ══════════════════════════════════════════════════════════════
   SERENITY RADIO — wellness.js
   Opt-in wellness nudges. All OFF by default.
   Users enable individually from the ♥ Wellness panel.

   Features (each independently toggleable):
     breaks   — work/screen break reminder (configurable interval)
     eyes     — 20-20-20 eye rest rule
     breathe  — guided 4-7-8 breathing micro-session
     sleep    — bedtime wind-down nudge (user sets time)
     tcm      — TCM body constitution profile (one-time survey)

   Nothing interrupts by default. Every nudge is a soft overlay
   that auto-dismisses. Music keeps playing unless user clicks
   the breathing session button.
   ═════════════════════════════════════════════════════════════ */

const Wellness = (() => {
  const STORE_KEY = 'sr_wellness';

  // ── Default state (everything off) ───────────────────────────
  const _defaults = {
    breaks:        false,
    breakInterval: 30,      // minutes
    eyes:          false,
    breathe:       false,
    sleep:         false,
    sleepTime:     '22:30', // HH:MM
    tcmDone:       false,
    tcmResult:     null,    // { type, label, desc }
  };

  let _s = { ..._defaults };
  let _timers = {};
  let _ac = null;  // AudioContext for chime + breathing guide

  // ── Persist ───────────────────────────────────────────────────
  function _save() {
    localStorage.setItem(STORE_KEY, JSON.stringify(_s));
  }
  function _load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) _s = { ..._defaults, ...JSON.parse(raw) };
    } catch(e) {}
  }

  // ── Audio context (lazy init) ─────────────────────────────────
  function _audio() {
    if (!_ac) _ac = new (window.AudioContext || window.webkitAudioContext)();
    if (_ac.state === 'suspended') _ac.resume();
    return _ac;
  }

  // Soft bell chime — pure tone, fast attack, long decay
  function _chime(freq = 528, vol = 0.22) {
    const ac  = _audio();
    const osc = ac.createOscillator();
    const env = ac.createGain();
    osc.connect(env); env.connect(ac.destination);
    osc.type = 'sine';
    osc.frequency.value = freq;
    env.gain.setValueAtTime(0, ac.currentTime);
    env.gain.linearRampToValueAtTime(vol,  ac.currentTime + 0.015);
    env.gain.setTargetAtTime(0, ac.currentTime + 0.08, 1.2);
    osc.start(ac.currentTime);
    osc.stop(ac.currentTime + 6);
  }

  // Three-bell intro (do–mi–sol) before a guided session
  function _bellIntro(cb) {
    _chime(396, 0.18);
    setTimeout(() => _chime(528, 0.18), 600);
    setTimeout(() => { _chime(660, 0.18); if (cb) setTimeout(cb, 800); }, 1200);
  }

  // ── Toast notification — appears at top, fades, never blocks ─
  function _toast(html, durationMs = 8000, id = null) {
    let el = id ? document.getElementById(id) : null;
    if (!el) {
      el = document.createElement('div');
      el.className = 'wellness-toast';
      if (id) el.id = id;
      document.body.appendChild(el);
    }
    el.innerHTML = html;
    el.classList.add('visible');
    if (el._autoHide) clearTimeout(el._autoHide);
    if (durationMs > 0) {
      el._autoHide = setTimeout(() => el.classList.remove('visible'), durationMs);
    }
    return el;
  }

  function _hideToast(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('visible');
  }

  // ── Breathing session overlay ─────────────────────────────────
  // 4-7-8 breathing: inhale 4s, hold 7s, exhale 8s × 4 rounds
  function _startBreathSession() {
    const overlay = document.getElementById('wellness-breath-overlay');
    if (!overlay) return;
    overlay.classList.add('visible');

    const phases = [
      { label: 'Breathe in', dur: 4,  color: '#6ec6f5' },
      { label: 'Hold',       dur: 7,  color: '#b8a4e8' },
      { label: 'Breathe out',dur: 8,  color: '#7ed4a8' },
    ];
    const ROUNDS = 4;
    let round = 0, phaseIdx = 0;

    const titleEl   = document.getElementById('breath-title');
    const phaseEl   = document.getElementById('breath-phase');
    const countEl   = document.getElementById('breath-count');
    const ringEl    = document.querySelector('.breath-ring');
    const roundsEl  = document.getElementById('breath-rounds');

    function runPhase() {
      if (!overlay.classList.contains('visible')) return;   // dismissed early
      if (round >= ROUNDS) {
        // Done
        phaseEl.textContent = 'Well done 🌿';
        countEl.textContent = '';
        setTimeout(() => overlay.classList.remove('visible'), 2500);
        return;
      }
      const ph = phases[phaseIdx];
      phaseEl.textContent  = ph.label;
      roundsEl.textContent = `Round ${round + 1} of ${ROUNDS}`;
      ringEl.style.borderColor = ph.color;
      ringEl.style.boxShadow   = `0 0 32px 8px ${ph.color}44`;

      // Ring animation
      ringEl.style.transition = `transform ${ph.dur}s ease-in-out, opacity ${ph.dur}s ease`;
      if (phaseIdx === 0) {      // inhale — expand
        ringEl.style.transform = 'scale(1.35)';
        ringEl.style.opacity   = '1';
      } else if (phaseIdx === 1) { // hold — stay
        ringEl.style.transition = 'none';
      } else {                   // exhale — contract
        ringEl.style.transform = 'scale(1.0)';
        ringEl.style.opacity   = '0.65';
      }

      // Countdown
      let remaining = ph.dur;
      countEl.textContent = remaining;
      const tick = setInterval(() => {
        remaining--;
        countEl.textContent = remaining > 0 ? remaining : '';
        if (remaining <= 0) {
          clearInterval(tick);
          phaseIdx++;
          if (phaseIdx >= phases.length) { phaseIdx = 0; round++; }
          _chime(396 + phaseIdx * 66, 0.12);
          runPhase();
        }
      }, 1000);
    }

    _bellIntro(runPhase);
    titleEl.textContent = 'Breathing with you…';
  }

  // ── Break reminder ────────────────────────────────────────────
  function _scheduleBreak() {
    clearTimeout(_timers.break);
    if (!_s.breaks) return;
    const ms = _s.breakInterval * 60 * 1000;
    _timers.break = setTimeout(() => {
      _chime(528);
      const breathBtn = _s.breathe
        ? `<button class="wellness-action-btn" onclick="Wellness.startBreath()">Start 4-7-8 Breathing</button>`
        : '';
      _toast(`
        <div style="display:flex;align-items:flex-start;gap:10px">
          <span style="font-size:22px">🌿</span>
          <div>
            <strong>Time for a short break</strong>
            <div style="font-size:13px;opacity:.8;margin-top:3px">
              You've been on for ${_s.breakInterval} mins. Step away, stretch, or look outside.
            </div>
            ${breathBtn}
          </div>
          <button onclick="this.closest('.wellness-toast').classList.remove('visible')" style="background:none;border:none;color:inherit;cursor:pointer;font-size:18px;margin-left:auto">✕</button>
        </div>
      `, 30000, 'wellness-break-toast');
      _scheduleBreak();  // reschedule
    }, ms);
  }

  // ── Eye rest (20-20-20) ───────────────────────────────────────
  function _scheduleEyes() {
    clearTimeout(_timers.eyes);
    if (!_s.eyes) return;
    _timers.eyes = setTimeout(() => {
      _chime(660, 0.14);
      _toast(`
        <div style="display:flex;align-items:flex-start;gap:10px">
          <span style="font-size:22px">👁</span>
          <div>
            <strong>20-20-20 Eye Rest</strong>
            <div style="font-size:13px;opacity:.8;margin-top:3px">
              Look at something 20 feet away for 20 seconds. Your eyes will thank you.
            </div>
          </div>
          <button onclick="this.closest('.wellness-toast').classList.remove('visible')" style="background:none;border:none;color:inherit;cursor:pointer;font-size:18px;margin-left:auto">✕</button>
        </div>
      `, 25000, 'wellness-eyes-toast');
      _scheduleEyes();
    }, 20 * 60 * 1000);  // every 20 min
  }

  // ── Sleep wind-down ───────────────────────────────────────────
  function _scheduleSleep() {
    clearTimeout(_timers.sleep);
    if (!_s.sleep) return;
    const now   = new Date();
    const [hh, mm] = _s.sleepTime.split(':').map(Number);
    const target = new Date(now);
    target.setHours(hh, mm, 0, 0);
    if (target <= now) target.setDate(target.getDate() + 1);
    const ms = target - now;
    _timers.sleep = setTimeout(() => {
      _chime(396, 0.16);
      _toast(`
        <div style="display:flex;align-items:flex-start;gap:10px">
          <span style="font-size:22px">🌙</span>
          <div>
            <strong>Wind down for sleep</strong>
            <div style="font-size:13px;opacity:.8;margin-top:3px">
              It's ${_s.sleepTime}. Consider putting the phone down and letting the music guide you to rest.
            </div>
            <button class="wellness-action-btn" onclick="document.querySelector('[data-channel=sleep]')?.click();this.closest('.wellness-toast').classList.remove('visible')">
              Switch to Sleep Mode
            </button>
          </div>
          <button onclick="this.closest('.wellness-toast').classList.remove('visible')" style="background:none;border:none;color:inherit;cursor:pointer;font-size:18px;margin-left:auto">✕</button>
        </div>
      `, 60000, 'wellness-sleep-toast');
      _scheduleSleep();  // reschedule for next night
    }, ms);
  }

  // ── TCM Constitution survey ───────────────────────────────────
  const _TCM_Q = [
    { q: 'How is your energy level most days?',
      opts: ['Energetic and steady','Often tired, low energy','Warm easily, tend to feel hot','Feel cold easily, prefer warmth','Feel sluggish, heavy or foggy'] },
    { q: 'How would you describe your typical mood?',
      opts: ['Calm and balanced','Tend to worry or overthink','Easily irritated or restless','Melancholy or frequently stressed','Generally content but lethargic'] },
    { q: 'How do you sleep?',
      opts: ['Sleep well, wake refreshed','Light sleep, vivid dreams','Trouble sleeping, mind active','Sleep long but wake unrefreshed','Fall asleep easily but feel heavy'] },
    { q: 'How is your digestion?',
      opts: ['Smooth and regular','Bloating or loose stools when stressed','Heartburn or acid sensation','Slow digestion, prefer warm food','Heavy or sluggish, prone to dampness'] },
    { q: 'What best describes your skin and complexion?',
      opts: ['Clear, even tone','Dry, dull or flaky','Prone to redness or acne','Pale, lacking lustre','Oily or prone to blemishes'] },
  ];

  const _TCM_TYPES = [
    { type:'balanced',   label:'Balanced (平和质)',      desc:'Your Qi flows well. Keep your rhythm — regularity is your medicine.' },
    { type:'qi-def',     label:'Qi Deficient (气虚质)',  desc:'Low energy base. Rest is productive. Calm music and shorter, gentler sessions suit you best.' },
    { type:'yin-def',    label:'Yin Deficient (阴虚质)', desc:'Tend to run warm and restless. Evening cooling sounds and later wind-downs will help.' },
    { type:'yang-def',   label:'Yang Deficient (阳虚质)',desc:'Cold easily, need warmth. Morning sessions when energy is available. Avoid late nights.' },
    { type:'phlegm-damp',label:'Phlegm-Damp (痰湿质)',  desc:'Sluggishness and fog are common. Energising morning sessions and movement breaks are ideal.' },
  ];

  function _tcmResult(answers) {
    // Simple scoring: each answer index maps to a type
    const scores = [0,0,0,0,0];
    answers.forEach(a => { if (a >= 0 && a < 5) scores[a]++; });
    const best = scores.indexOf(Math.max(...scores));
    return _TCM_TYPES[best];
  }

  function showTcmSurvey() {
    const modal = document.getElementById('wellness-tcm-modal');
    if (!modal) return;
    modal.classList.add('visible');
    _renderTcmQ(modal, 0, []);
  }

  function _renderTcmQ(modal, qi, answers) {
    const body = modal.querySelector('.tcm-body');
    if (qi >= _TCM_Q.length) {
      // Show result
      const result = _tcmResult(answers);
      _s.tcmDone   = true;
      _s.tcmResult = result;
      _save();
      body.innerHTML = `
        <div style="text-align:center;padding:16px 0">
          <div style="font-size:32px;margin-bottom:12px">🌿</div>
          <div style="font-size:18px;font-weight:600;margin-bottom:8px">${result.label}</div>
          <div style="font-size:14px;opacity:.8;line-height:1.6">${result.desc}</div>
          <button class="wellness-action-btn" style="margin-top:20px" onclick="document.getElementById('wellness-tcm-modal').classList.remove('visible')">
            Done
          </button>
        </div>`;
      document.getElementById('wellness-panel')?.querySelectorAll('.tcm-result-label').forEach(el => {
        el.textContent = result.label;
        el.style.display = 'inline';
      });
      return;
    }
    const q = _TCM_Q[qi];
    body.innerHTML = `
      <div style="font-size:13px;opacity:.6;margin-bottom:8px">Question ${qi+1} of ${_TCM_Q.length}</div>
      <div style="font-size:15px;font-weight:500;margin-bottom:16px">${q.q}</div>
      <div style="display:flex;flex-direction:column;gap:8px">
        ${q.opts.map((o,i) => `
          <button class="wellness-tcm-opt" onclick="Wellness._tcmAnswer(${qi},${i})">
            ${o}
          </button>`).join('')}
      </div>`;
    // Expose answer handler
    Wellness._tcmAnswer = (qIdx, aIdx) => {
      answers.push(aIdx);
      _renderTcmQ(modal, qIdx + 1, answers);
    };
  }

  // ── Panel toggle ──────────────────────────────────────────────
  function togglePanel() {
    const panel = document.getElementById('wellness-panel');
    if (!panel) return;
    panel.classList.toggle('visible');
    _renderPanel();
  }

  function _renderPanel() {
    const panel = document.getElementById('wellness-panel');
    if (!panel || !panel.classList.contains('visible')) return;

    panel.querySelector('#wp-breaks').checked         = _s.breaks;
    panel.querySelector('#wp-break-interval').value   = _s.breakInterval;
    panel.querySelector('#wp-break-row').style.display = _s.breaks ? 'flex' : 'none';
    panel.querySelector('#wp-eyes').checked           = _s.eyes;
    panel.querySelector('#wp-breathe').checked        = _s.breathe;
    panel.querySelector('#wp-sleep').checked          = _s.sleep;
    panel.querySelector('#wp-sleep-time').value       = _s.sleepTime;
    panel.querySelector('#wp-sleep-row').style.display = _s.sleep ? 'flex' : 'none';

    const tcmEl = panel.querySelector('#wp-tcm-status');
    if (_s.tcmDone && _s.tcmResult) {
      tcmEl.textContent = _s.tcmResult.label;
      tcmEl.style.opacity = '1';
    } else {
      tcmEl.textContent = 'Not done yet';
      tcmEl.style.opacity = '.5';
    }
  }

  function _onToggle(key, val) {
    _s[key] = val;
    _save();
    _renderPanel();
    // Re-schedule affected timers
    if (key === 'breaks' || key === 'breakInterval') _scheduleBreak();
    if (key === 'eyes')   _scheduleEyes();
    if (key === 'sleep' || key === 'sleepTime') _scheduleSleep();
  }

  // ── Public API ────────────────────────────────────────────────
  function init() {
    _load();
    _scheduleBreak();
    _scheduleEyes();
    _scheduleSleep();
    // Wire panel controls after DOM ready
    const panel = document.getElementById('wellness-panel');
    if (!panel) return;

    panel.querySelector('#wp-breaks').addEventListener('change', e => _onToggle('breaks', e.target.checked));
    panel.querySelector('#wp-break-interval').addEventListener('change', e => _onToggle('breakInterval', +e.target.value));
    panel.querySelector('#wp-eyes').addEventListener('change', e => _onToggle('eyes', e.target.checked));
    panel.querySelector('#wp-breathe').addEventListener('change', e => _onToggle('breathe', e.target.checked));
    panel.querySelector('#wp-sleep').addEventListener('change', e => _onToggle('sleep', e.target.checked));
    panel.querySelector('#wp-sleep-time').addEventListener('change', e => _onToggle('sleepTime', e.target.value));
    panel.querySelector('#wp-tcm-btn').addEventListener('click', showTcmSurvey);

    // Close panel on outside click
    document.addEventListener('click', e => {
      if (!panel.contains(e.target) && !e.target.closest('#wellness-btn')) {
        panel.classList.remove('visible');
      }
    });
  }

  function startBreath() {
    _hideToast('wellness-break-toast');
    _startBreathSession();
  }

  return { init, togglePanel, startBreath, showTcmSurvey, _tcmAnswer: null };
})();

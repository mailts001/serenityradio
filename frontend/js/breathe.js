/* ══════════════════════════════════════════
   SERENITY RADIO — breathe.js
   Interactive guided breathing exercise
   4-4-6-2 box breathing technique
   ══════════════════════════════════════════ */

let breatheActive = false;
let breatheTimer  = null;

const PHASES = [
  { cls: 'inhale', label: 'Breathe in…',   text: 'Inhaling — 4 seconds',  dur: 4000 },
  { cls: '',       label: 'Hold',           text: 'Hold — 4 seconds',      dur: 4000 },
  { cls: 'exhale', label: 'Breathe out…',  text: 'Exhaling — 6 seconds',  dur: 6000 },
  { cls: '',       label: 'Rest',           text: 'Rest — 2 seconds',      dur: 2000 },
];

function startBreath() {
  breatheActive = !breatheActive;
  const ring  = document.getElementById('breathe-ring');
  const inner = document.getElementById('breathe-inner');
  const text  = document.getElementById('breathe-text');

  if (!breatheActive) {
    clearTimeout(breatheTimer);
    ring.className  = 'breathe-ring';
    inner.textContent = 'Breathe';
    text.textContent  = 'Click to breathe with us';
    return;
  }

  let phaseIndex = 0;

  function runPhase() {
    if (!breatheActive) return;
    const phase = PHASES[phaseIndex % PHASES.length];
    ring.className    = 'breathe-ring ' + phase.cls;
    inner.textContent = phase.label;
    text.textContent  = phase.text;
    phaseIndex++;
    breatheTimer = setTimeout(runPhase, phase.dur);
  }

  runPhase();
}

/* ══════════════════════════════════════════════════════════════
   SERENITY RADIO — ambient_audio.js
   Web Audio API ambient nature sounds, synthesised (no files).
   Layers softly under the music player at ~15% volume.

   Sounds:
     birds    — gentle chirps, random intervals, panned L/R
     waves    — low filtered noise with slow swell rhythm
     crickets — soft high-frequency shimmer (night only)
     wind     — very faint filtered breath (always, very low)

   Auto-adjusts layer mix to time-of-day + channel mode.
   User can toggle via the 🔊 ambient button in header.
   ═════════════════════════════════════════════════════════════ */

const AmbientAudio = (() => {
  let _ac       = null;   // AudioContext
  let _master   = null;   // master GainNode → destination
  let _enabled  = false;
  let _mode     = 'default';

  // Layer gain nodes
  let _gBirds, _gWaves, _gCrickets, _gWind;
  // Oscillator/source handles for cleanup
  let _waveSource = null, _windSource = null, _cricketOsc = null;
  // Bird scheduling timer
  let _birdTimer  = null;
  // Target gains (smoothed)
  const _target = { birds:0, waves:0, crickets:0, wind:0 };

  // ── Bootstrap AudioContext on first user gesture ──────────
  function _boot() {
    if (_ac) return true;
    try {
      _ac     = new (window.AudioContext || window.webkitAudioContext)();
      _master = _ac.createGain();
      _master.gain.value = 0.18;   // overall ambient level under music
      _master.connect(_ac.destination);

      _gBirds    = _makeGain(0); _gBirds.connect(_master);
      _gWaves    = _makeGain(0); _gWaves.connect(_master);
      _gCrickets = _makeGain(0); _gCrickets.connect(_master);
      _gWind     = _makeGain(0); _gWind.connect(_master);

      _startWaves();
      _startWind();
      _startCrickets();
      _scheduleBird();
      return true;
    } catch(e) { return false; }
  }

  function _makeGain(v) {
    const g = _ac.createGain();
    g.gain.value = v;
    return g;
  }

  // ── Smooth gain ramp ──────────────────────────────────────
  function _ramp(gainNode, target, duration=2.5) {
    gainNode.gain.cancelScheduledValues(_ac.currentTime);
    gainNode.gain.setTargetAtTime(target, _ac.currentTime, duration * 0.4);
  }

  // ── Ocean waves — filtered noise, slow swell LFO ──────────
  function _startWaves() {
    // White noise buffer (2 s, looped)
    const buf = _ac.createBuffer(1, _ac.sampleRate * 2, _ac.sampleRate);
    const d   = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    const src = _ac.createBufferSource();
    src.buffer = buf; src.loop = true;

    // Low-pass to remove hiss, band around wave rumble
    const lpf = _ac.createBiquadFilter();
    lpf.type = 'lowpass'; lpf.frequency.value = 320; lpf.Q.value = 0.8;

    // Slow swell gain (LFO via script processor would be complex; use periodic ramps)
    const swellGain = _ac.createGain();
    swellGain.gain.value = 1;
    src.connect(lpf); lpf.connect(swellGain); swellGain.connect(_gWaves);
    src.start();
    _waveSource = src;

    // Animate swell with recursive ramps (~7 s per cycle)
    function swell(phase) {
      if (!_ac) return;
      const peak = phase === 0 ? 1.0 : 0.35;
      const dur  = phase === 0 ? 3.5 : 3.5;
      swellGain.gain.setTargetAtTime(peak, _ac.currentTime, dur * 0.5);
      setTimeout(() => swell(1 - phase), dur * 1000);
    }
    swell(0);
  }

  // ── Wind — very gentle filtered noise, always subtle ─────
  function _startWind() {
    const buf = _ac.createBuffer(1, _ac.sampleRate * 3, _ac.sampleRate);
    const d   = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    const src = _ac.createBufferSource();
    src.buffer = buf; src.loop = true;

    const bpf = _ac.createBiquadFilter();
    bpf.type = 'bandpass'; bpf.frequency.value = 180; bpf.Q.value = 0.5;

    src.connect(bpf); bpf.connect(_gWind);
    src.start();
    _windSource = src;
  }

  // ── Night depth — deep low-frequency breath, no tonal ringing ──
  // Rule: nothing above 300 Hz, Q always < 1 (broad = no resonant peak).
  // The layer sounds like the quiet hum of the earth at night —
  // felt more than heard, like standing outside under stars.
  function _startCrickets() {
    // Two independent noise buffers (different lengths = no loop artefact)
    function _noiseBuf(secs) {
      const b = _ac.createBuffer(1, _ac.sampleRate * secs, _ac.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      return b;
    }

    // Layer A — very deep rumble: lowpass at 80 Hz, Q=0.5 (wide, not tonal)
    const srcA = _ac.createBufferSource();
    srcA.buffer = _noiseBuf(5); srcA.loop = true;
    const lpA = _ac.createBiquadFilter();
    lpA.type = 'lowpass'; lpA.frequency.value = 80; lpA.Q.value = 0.5;

    // Layer B — gentle low breath: lowpass at 220 Hz, Q=0.7
    const srcB = _ac.createBufferSource();
    srcB.buffer = _noiseBuf(7); srcB.loop = true;
    const lpB = _ac.createBiquadFilter();
    lpB.type = 'lowpass'; lpB.frequency.value = 220; lpB.Q.value = 0.7;

    const gA = _makeGain(0.55);
    const gB = _makeGain(0.30);
    const out = _makeGain(1);
    out.connect(_gCrickets);

    srcA.connect(lpA); lpA.connect(gA); gA.connect(out);
    srcB.connect(lpB); lpB.connect(gB); gB.connect(out);

    // Very slow swell on layer B: 0.05 Hz = 20-second breath cycle
    // Implemented with setTargetAtTime ping-pong (no oscillator = no tone)
    function _breathe(hi) {
      const target = hi ? 0.38 : 0.12;
      gB.gain.setTargetAtTime(target, _ac.currentTime, 8);
      setTimeout(() => _breathe(!hi), 10000);
    }
    _breathe(true);

    srcA.start(); srcB.start();
    _cricketOsc = out;
  }

  // ── Bird chirp synthesis ───────────────────────────────────
  function _chirp(pan=0) {
    if (!_ac || !_enabled) return;
    const gain = _ac.createGain();
    gain.gain.value = 0;
    const panner = _ac.createStereoPanner();
    panner.pan.value = pan;
    gain.connect(panner); panner.connect(_gBirds);

    // 2–4 note chirp sequence
    const notes = Math.floor(Math.random() * 3) + 2;
    let offset = 0;
    for (let i = 0; i < notes; i++) {
      const osc  = _ac.createOscillator();
      const env  = _ac.createGain();
      osc.connect(env); env.connect(gain);

      // Frequency: gentle bird sweep 800–2200 Hz (no sharp high register)
      const baseFreq = 800 + Math.random() * 1400;
      const sweep    = baseFreq * (0.8 + Math.random() * 0.8);
      const noteDur  = 0.06 + Math.random() * 0.08;
      const t0       = _ac.currentTime + offset;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(baseFreq, t0);
      osc.frequency.linearRampToValueAtTime(sweep, t0 + noteDur * 0.5);
      osc.frequency.linearRampToValueAtTime(baseFreq * 0.9, t0 + noteDur);

      // Soft envelope
      env.gain.setValueAtTime(0, t0);
      env.gain.linearRampToValueAtTime(0.4, t0 + 0.015);
      env.gain.setTargetAtTime(0, t0 + noteDur * 0.6, noteDur * 0.25);

      osc.start(t0); osc.stop(t0 + noteDur + 0.05);
      offset += noteDur + 0.04 + Math.random() * 0.08;
    }
    gain.gain.setValueAtTime(0.7, _ac.currentTime);
    gain.gain.setTargetAtTime(0, _ac.currentTime + offset + 0.1, 0.15);
  }

  // ── Bird scheduling ───────────────────────────────────────
  function _scheduleBird() {
    if (!_enabled) { _birdTimer = setTimeout(_scheduleBird, 2000); return; }
    const hr   = new Date().getHours();
    const day  = hr >= 6 && hr < 20;
    const dawn = hr >= 5.5 && hr < 8;
    const dusk = hr >= 17 && hr < 20;

    // Density: dawn chorus is busiest, midday moderate, dusk moderate, night none
    const density = dawn ? 1.8 : dusk ? 1.2 : day ? 1.0 : 0.05;
    // Mode modifier
    const modeX = _mode === 'nature' ? 2.0 : _mode === 'focus' ? 0.3 : _mode === 'sleep' ? 0 : 1.0;
    const active = density * modeX;

    if (active > 0.1 && Math.random() < Math.min(1, active * 0.7)) {
      _chirp((Math.random() - 0.5) * 1.6);  // random pan L/R
      // Sometimes a second bird replies a moment later
      if (Math.random() < 0.3) {
        setTimeout(() => _chirp((Math.random() - 0.5) * 1.6), 400 + Math.random() * 800);
      }
    }

    // Next chirp: every 2–12 s depending on density
    const interval = active > 0 ? (2000 + Math.random() * 8000) / active : 8000;
    _birdTimer = setTimeout(_scheduleBird, Math.min(12000, interval));
  }

  // ── Mix targets by hour + mode ────────────────────────────
  function _updateMix() {
    if (!_ac || !_enabled) return;
    const hr   = new Date().getHours() + new Date().getMinutes() / 60;
    const day  = hr >= 7 && hr < 20;
    const night = hr < 6 || hr >= 20;
    const dusk = hr >= 18 && hr < 21;

    // Waves: primary sound at night — ocean carries the night
    const waveBase = _mode === 'sleep'  ? 0.80
                   : night              ? 0.65
                   : _mode === 'focus'  ? 0.15
                   :                     0.32;
    _ramp(_gWaves, waveBase);

    // Birds: daytime only, off at night & sleep
    const birdBase = (_mode === 'sleep' || !day) ? 0
                   : _mode === 'nature'           ? 0.75
                   :                               0.42;
    _ramp(_gBirds, birdBase);

    // Night depth: dusk onward — very subtle, well below waves
    // Q<1 broad filters = no ringing possible
    const nightBase = (night || dusk) ? (_mode === 'nature' ? 0.28 : 0.16) : 0;
    _ramp(_gCrickets, nightBase);

    // Wind: barely there
    const windBase = _mode === 'focus' ? 0.06 : 0.09;
    _ramp(_gWind, windBase);
  }

  // ── Public API ────────────────────────────────────────────
  function enable() {
    if (!_boot()) return;
    _enabled = true;
    if (_ac.state === 'suspended') _ac.resume();
    _updateMix();
  }

  function disable() {
    _enabled = false;
    if (!_ac) return;
    _ramp(_gBirds, 0); _ramp(_gWaves, 0); _ramp(_gCrickets, 0); _ramp(_gWind, 0);
  }

  function toggle() {
    _enabled ? disable() : enable();
    return _enabled;
  }

  function setMode(mode) {
    _mode = mode;
    if (_enabled) _updateMix();
  }

  function isEnabled() { return _enabled; }

  // Re-sync mix every 5 minutes (time of day changes)
  setInterval(() => { if (_enabled) _updateMix(); }, 5 * 60 * 1000);

  return { enable, disable, toggle, setMode, isEnabled };
})();

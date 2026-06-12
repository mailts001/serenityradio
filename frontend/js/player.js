/* ══════════════════════════════════════════
   SERENITY RADIO — player.js
   Track list, playback, progress, waveform
   ══════════════════════════════════════════ */

// ── Fallback tracks (used until real tracklist loads from API) ──
const FALLBACK_TRACKS = [
  { title: 'Gentle Morning Rain',  artist: 'Serenity Sessions • Ambient & Healing', src: '/assets/music/gentle-morning-rain.mp3',  duration: 222 },
  { title: 'Still Waters',         artist: 'Luna Wave • Meditation Music',           src: '/assets/music/still-waters.mp3',          duration: 318 },
  { title: 'Breathe Slowly',       artist: 'Healing Tones Collective • Binaural',   src: '/assets/music/breathe-slowly.mp3',         duration: 264 },
  { title: 'Valley of Light',      artist: 'Celestia • Soft Piano',                 src: '/assets/music/valley-of-light.mp3',        duration: 198 },
  { title: 'Oak & Silence',        artist: 'Forest Sound Project • Nature',         src: '/assets/music/oak-and-silence.mp3',        duration: 285 },
  { title: 'Inner Harbour',        artist: 'Calm Compass • Ambient',                src: '/assets/music/inner-harbour.mp3',          duration: 342 },
];

// ── State ──
let tracks       = [...FALLBACK_TRACKS];
let currentTrack = 0;
let isPlaying    = false;
let progress     = 0;
let progressSec  = 0;
let animFrame    = null;
let audio        = null;   // Real Audio element — connected when file exists

// ── Load track list from Flask API ──
async function loadTrackList() {
  try {
    const res  = await fetch('/api/tracks');
    const data = await res.json();
    // API returns plain array; guard against {tracks:[]} wrapper too
    const list = Array.isArray(data) ? data : (data.tracks || []);
    if (list.length > 0) {
      tracks = list;
      document.getElementById('stat-tracks').textContent = tracks.length;
    } else {
      document.getElementById('stat-tracks').textContent = tracks.length;
    }
  } catch {
    document.getElementById('stat-tracks').textContent = tracks.length;
  }
  loadTrack(false);   // Display first track info without auto-playing
}

// ── Display a track ──
function loadTrack(autoPlay = false) {
  const t  = tracks[currentTrack];
  const tt = document.getElementById('track-title');
  const ta = document.getElementById('track-artist');

  // Fade out
  tt.classList.add('fade');
  ta.classList.add('fade');

  setTimeout(() => {
    tt.textContent = t.title;
    ta.textContent = t.artist;
    tt.classList.remove('fade');
    ta.classList.remove('fade');
    document.getElementById('time-total').textContent = fmt(t.duration || 0);
    document.getElementById('time-current').textContent = '0:00';
    document.getElementById('progress-fill').style.width = '0%';
    buildWaveform();
  }, 350);

  // Wire up real Audio if src present
  if (audio) { audio.pause(); audio = null; }
  if (t.src) {
    audio = new Audio(t.src);
    audio.volume = parseInt(document.getElementById('volume').value) / 100;
    audio.addEventListener('timeupdate', onAudioUpdate);
    audio.addEventListener('ended', nextTrack);
    if (autoPlay) audio.play().catch(() => {});
  }

  progressSec = 0;
  progress    = 0;
}

// ── Audio timeupdate (real audio) ──
function onAudioUpdate() {
  if (!audio) return;
  progressSec = audio.currentTime;
  const dur   = audio.duration || tracks[currentTrack].duration || 1;
  progress    = (progressSec / dur) * 100;
  updateProgress(dur);
}

// ── Simulated progress (no real audio file yet) ──
function startSimulatedProgress() {
  let last = null;
  function step(ts) {
    if (!isPlaying || audio) return;
    if (last) {
      progressSec += (ts - last) / 1000;
      const dur    = tracks[currentTrack].duration || 180;
      if (progressSec >= dur) { nextTrack(); return; }
      progress = (progressSec / dur) * 100;
      updateProgress(dur);
    }
    last = ts;
    animFrame = requestAnimationFrame(step);
  }
  animFrame = requestAnimationFrame(step);
}

// ── Update UI ──
function updateProgress(totalDur) {
  const dur = totalDur || tracks[currentTrack].duration || 180;
  document.getElementById('progress-fill').style.width = progress + '%';
  document.getElementById('time-current').textContent  = fmt(Math.floor(progressSec));
  document.getElementById('time-total').textContent    = fmt(Math.floor(dur));

  const bars = document.querySelectorAll('.wave-bar');
  const threshold = bars.length * progress / 100;
  bars.forEach((b, i) => {
    b.className = 'wave-bar';
    if (i < threshold - 1) b.classList.add('played');
    else if (i === Math.floor(threshold)) b.classList.add('current');
  });
}

// ── Play / Pause ──
function togglePlay() {
  isPlaying = !isPlaying;
  const icon = document.getElementById('play-icon');
  const btn  = document.getElementById('play-btn');
  const bars = document.getElementById('eq-bars');

  if (isPlaying) {
    icon.innerHTML = '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>';
    btn.classList.add('playing');
    bars.classList.remove('paused');
    if (audio) audio.play().catch(() => {});
    else startSimulatedProgress();
  } else {
    icon.innerHTML = '<path d="M8 5v14l11-7z"/>';
    btn.classList.remove('playing');
    bars.classList.add('paused');
    if (audio) audio.pause();
    cancelAnimationFrame(animFrame);
  }
}

// ── Next / Prev ──
function nextTrack() {
  cancelAnimationFrame(animFrame);
  currentTrack = (currentTrack + 1) % tracks.length;
  progressSec  = 0; progress = 0;
  loadTrack(isPlaying);
  if (isPlaying && !audio) startSimulatedProgress();
  if (Math.random() > 0.5) rotateQuote();
}

function prevTrack() {
  cancelAnimationFrame(animFrame);
  currentTrack = (currentTrack - 1 + tracks.length) % tracks.length;
  progressSec  = 0; progress = 0;
  loadTrack(isPlaying);
  if (isPlaying && !audio) startSimulatedProgress();
}

// ── Seek ──
function seekTo(e, el) {
  const rect  = el.getBoundingClientRect();
  const pct   = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  const dur   = (audio && audio.duration) || tracks[currentTrack].duration || 180;
  progress    = pct * 100;
  progressSec = pct * dur;
  if (audio) audio.currentTime = progressSec;
  updateProgress(dur);
}

// ── Volume ──
function setVolume(v) {
  document.getElementById('vol-label').textContent = v + '%';
  if (audio) audio.volume = parseInt(v) / 100;
}

// ── Waveform ──
function buildWaveform() {
  const wf = document.getElementById('waveform');
  wf.innerHTML = '';
  for (let i = 0; i < 60; i++) {
    const h = 16 + Math.random() * 30;
    const b = document.createElement('div');
    b.className  = 'wave-bar';
    b.style.height = h + 'px';
    const threshold = 60 * progress / 100;
    if (i < threshold - 1)         b.classList.add('played');
    else if (i === Math.floor(threshold)) b.classList.add('current');
    wf.appendChild(b);
  }
}

// ── Helpers ──
function fmt(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

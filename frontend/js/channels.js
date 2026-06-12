/* ══════════════════════════════════════════
   SERENITY RADIO — channels.js
   Multi-channel radio with canvas scene switching
   ══════════════════════════════════════════ */

const CHANNELS = [
  { id: 'default', label: '✦ All',    emoji: '✦', desc: 'Mixed · Curated blend'   },
  { id: 'sleep',   label: '🌙 Sleep',  emoji: '🌙', desc: 'Sleep · Deep relaxation' },
  { id: 'focus',   label: '🎯 Focus',  emoji: '🎯', desc: 'Focus · Deep work'       },
  { id: 'yoga',    label: '🧘 Yoga',   emoji: '🧘', desc: 'Yoga · Flow & energy'    },
  { id: 'nature',  label: '🌿 Nature', emoji: '🌿', desc: 'Nature · Forest & rain'  },
];

let activeChannel = localStorage.getItem('sr_channel') || 'default';

function renderChannelTabs() {
  const container = document.getElementById('channel-tabs');
  if (!container) return;

  container.innerHTML = CHANNELS.map(ch => `
    <button class="ch-tab ${ch.id === activeChannel ? 'active' : ''}"
            onclick="switchChannel('${ch.id}')"
            title="${ch.desc}">
      ${ch.label}
    </button>`).join('');
}

async function switchChannel(channelId) {
  if (channelId === activeChannel && document.getElementById('ch-' + channelId)) return;

  activeChannel = channelId;
  localStorage.setItem('sr_channel', channelId);

  // Update tab UI
  document.querySelectorAll('.ch-tab').forEach(t =>
    t.classList.toggle('active', t.textContent.trim().includes(
      CHANNELS.find(c => c.id === channelId)?.emoji || ''
    ))
  );

  // Update canvas background scene
  if (typeof _activeScene !== 'undefined') _activeScene = channelId;
  if (typeof CanvasScenes !== 'undefined') CanvasScenes.setScene(channelId);
  document.dispatchEvent(new CustomEvent('channel:changed', { detail: channelId }));

  // Load channel tracks from API
  try {
    const res    = await fetch(`/api/playlist?channel=${channelId}`);
    const data   = await res.json();
    if (data.tracks && data.tracks.length > 0) {
      tracks       = data.tracks;
      currentTrack = 0;
      loadTrack(isPlaying);
      if (typeof renderTrackList === 'function') renderTrackList(tracks);
    }
  } catch(e) { console.warn('Channel load failed:', e); }

  // Show channel change toast
  const ch = CHANNELS.find(c => c.id === channelId);
  showChannelToast(ch);
}

function showChannelToast(ch) {
  document.getElementById('ch-toast')?.remove();
  const t = document.createElement('div');
  t.id    = 'ch-toast';
  t.innerHTML = `<span style="font-size:18px">${ch.emoji}</span> <span><strong>${ch.label.replace(ch.emoji,'').trim()}</strong><br><small style="color:var(--text-muted)">${ch.desc}</small></span>`;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 2500);
}

// Called by score.js after check-in
window.switchChannel = switchChannel;

document.addEventListener('DOMContentLoaded', renderChannelTabs);

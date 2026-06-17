/* ══════════════════════════════════════════
   SERENITY RADIO — channels.js
   4-tier platform moat navigation + music channels
   ══════════════════════════════════════════ */

// ── Platform tiers — each tab shows the moat concept + switches music channel ──
const CHANNELS = [
  {
    id: 'default', emoji: '🔍',
    label: '🔍 Discover',
    desc:  'AI Curator · Knowledge Graph · Event Discovery',
    tierLabel: 'Tier 2',
    tagline: 'Singapore Arts Knowledge Graph',
    features: [
      'Every event, venue & artist aggregated',
      'AI-powered discovery & recommendations',
      'Featured placements · Affiliate commissions',
      'White-label API for venue & media partners',
    ],
  },
  {
    id: 'focus', emoji: '🏢',
    label: '🏢 Organizer',
    desc:  'Predictive Demand · Audience Analytics · B2B SaaS',
    tierLabel: 'Tier 1 ★',
    tagline: 'Organizer Intelligence Platform',
    features: [
      'Attendance data & audience segmentation',
      'Demand forecasting & ticket-price signals',
      'Organizer dashboard — SaaS $500–$10k/mo',
      'High switching cost once in planning workflow',
    ],
  },
  {
    id: 'yoga', emoji: '🌿',
    label: '🌿 Concierge',
    desc:  'Wellness OS · AI Experiences · Arts Concierge',
    tierLabel: 'Tier 3',
    tagline: 'Wellness + Arts Concierge',
    features: [
      '"I\'m stressed" → AI assembles experiences',
      'Corporate wellness & retreat referrals',
      'Premium concierge · Sponsored experiences',
      'Aligns with meditation & sound-bath roots',
    ],
  },
  {
    id: 'sleep', emoji: '🔔',
    label: '🔔 Alerts',
    desc:  'Ticket Watch · Price Alerts · Telegram Notifications',
    tierLabel: 'Tier 4',
    tagline: 'Ticket Monitoring & Alerting',
    features: [
      'Monitor tickets across all platforms',
      'Price drop & last-seat instant alerts',
      'Telegram premium subscriptions',
      'User acquisition funnel into higher tiers',
    ],
  },
];

let activeChannel = localStorage.getItem('sr_channel') || 'default';

function renderChannelTabs() {
  const container = document.getElementById('channel-tabs');
  if (!container) return;

  // Ambient toggle (kept as utility button)
  const ambientOn = typeof AmbientAudio !== 'undefined' && AmbientAudio.isEnabled();
  const ambientBtn = `
    <button id="ambient-btn" class="ch-tab ch-ambient" title="Toggle ambient nature sounds"
      style="${ambientOn ? 'color:rgba(180,220,160,.9);border-color:rgba(140,200,120,.35);' : ''}"
      onclick="toggleAmbient(this)">
      ${ambientOn ? '🔊' : '🍃'} ${ambientOn ? 'Mute' : 'Nature'}
    </button>`;

  container.innerHTML = ambientBtn + CHANNELS.map(ch => `
    <button class="ch-tab ${ch.id === activeChannel ? 'active' : ''}"
            onclick="switchChannel('${ch.id}')"
            title="${ch.desc}">
      <span class="ch-tier-badge">${ch.tierLabel}</span>
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

  // Channel only controls music — scene is controlled by the scene buttons
  document.dispatchEvent(new CustomEvent('channel:changed', { detail: channelId }));

  // Load channel tracks from API
  try {
    const res  = await fetch(`/api/playlist?channel=${channelId}`);
    const data = await res.json();
    if (data.tracks && data.tracks.length > 0) {
      tracks       = data.tracks;
      currentTrack = 0;
      loadTrack(0);
      if (typeof renderTrackList === 'function') renderTrackList(tracks);
    }
  } catch(e) { console.warn('Channel load failed:', e); }

  // Show moat tier toast + feature blurb
  const ch = CHANNELS.find(c => c.id === channelId);
  showChannelToast(ch);
}

function showChannelToast(ch) {
  document.getElementById('ch-toast')?.remove();
  const t = document.createElement('div');
  t.id    = 'ch-toast';
  const featureHtml = ch.features
    ? ch.features.map(f => `<div style="margin-top:2px;font-size:10px;opacity:.75">· ${f}</div>`).join('')
    : '';
  t.innerHTML = `
    <div style="display:flex;align-items:flex-start;gap:10px">
      <span style="font-size:20px;margin-top:1px">${ch.emoji}</span>
      <div>
        <div><strong>${ch.tagline || ch.label.replace(ch.emoji,'').trim()}</strong>
          <span style="margin-left:6px;font-size:9px;opacity:.5;text-transform:uppercase;letter-spacing:.06em">${ch.tierLabel||''}</span></div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:1px">${ch.desc}</div>
        ${featureHtml}
      </div>
    </div>`;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 4000);
}

// Called by score.js after check-in
window.switchChannel = switchChannel;

document.addEventListener('DOMContentLoaded', renderChannelTabs);

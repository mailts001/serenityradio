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
  {
    id: 'event', emoji: '📅',
    label: '📅 Event',
    desc:  'What\'s On SG · Arts & Culture Events',
    tierLabel: 'Live',
    tagline: 'What\'s On in Singapore',
    features: [
      'Curated arts & culture events this week',
      'Theatre, music, dance, exhibitions & more',
      'Subscribe for personalised event alerts',
      'Powered by Serenity Radio & sg-arts-alert',
    ],
    isSpecial: true,   // triggers scene switch, not playlist load
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

// ── Moat section each channel maps to ─────────────────────────
const CHANNEL_SECTION = {
  default: 'browse',
  focus:   'organizer',
  yoga:    'concierge',
  sleep:   'alerts',
  event:   'browse',
};
const SECTION_TITLE = {
  browse:     '📅 What\'s On in Singapore',
  concierge:  '✨ Wellness Concierge',
  alerts:     '🔔 My Alerts',
  organizer:  '🏢 Organizer Intelligence',
};

let _moatOpen = false;   // accordion state

async function switchChannel(channelId) {
  const chDef    = CHANNELS.find(c => c.id === channelId);
  const section  = CHANNEL_SECTION[channelId] || 'browse';
  const panel    = document.getElementById('moat-panel');
  const wasActive = activeChannel === channelId;

  // Toggle: click same tab while panel open → close
  if (wasActive && _moatOpen && panel) {
    panel.classList.remove('open');
    _moatOpen = false;
    document.body.classList.remove('moat-open');
    return;
  }

  activeChannel = channelId;
  localStorage.setItem('sr_channel', channelId);

  // Update tab active highlight
  document.querySelectorAll('.ch-tab').forEach(t =>
    t.classList.toggle('active', t.textContent.trim().includes(
      chDef?.emoji || ''))
  );

  // ── Open accordion + show correct section ────────────────────
  if (panel) {
    // Switch visible section
    document.querySelectorAll('.mp-section').forEach(s => s.classList.remove('active'));
    const sec = document.getElementById('mp-' + section);
    if (sec) sec.classList.add('active');

    // Update panel heading
    const titleEl = document.getElementById('mp-title');
    if (titleEl) titleEl.textContent = SECTION_TITLE[section] || '';

    panel.classList.add('open');
    _moatOpen = true;
    document.body.classList.add('moat-open');

    // Load browse events when opening browse section for first time
    if ((section === 'browse') && typeof _loadEvents === 'function') {
      const list = document.getElementById('events-list');
      if (list && list.querySelector('.events-empty')?.textContent.includes('Loading')) {
        _loadEvents();
      } else if (!list?.children.length) {
        _loadEvents();
      }
    }
  }

  // ── Music: load playlist for non-special channels ─────────────
  if (!chDef?.isSpecial) {
    document.dispatchEvent(new CustomEvent('channel:changed', { detail: channelId }));
    try {
      const musicId = chDef?.isSpecial ? 'default' : channelId;
      const res  = await fetch(`/api/playlist?channel=${musicId}`);
      const data = await res.json();
      if (data.tracks && data.tracks.length > 0) {
        tracks = data.tracks; currentTrack = 0; loadTrack(0);
        if (typeof renderTrackList === 'function') renderTrackList(tracks);
      }
    } catch(e) { console.warn('Channel load failed:', e); }
  }
}

// Close panel (called by × button and _moatClose global)
function _closeMoatPanel() {
  const panel = document.getElementById('moat-panel');
  if (panel) { panel.classList.remove('open'); _moatOpen = false; }
  document.body.classList.remove('moat-open');
}
window._moatClose = _closeMoatPanel;

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

// Expose _loadEvents once DOM is ready (populated by index.html IIFE)
document.addEventListener('DOMContentLoaded', renderChannelTabs);

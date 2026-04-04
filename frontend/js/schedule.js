/* ══════════════════════════════════════════
   SERENITY RADIO — schedule.js
   Daily schedule builder
   ══════════════════════════════════════════ */

const SCHEDULE = [
  { time: '12:00 AM', type: 'music',     name: 'Deep Sleep Frequencies' },
  { time: '02:00 AM', type: 'meditation',name: 'Midnight Meditation Hour' },
  { time: '04:00 AM', type: 'music',     name: 'Dawn Ambient Session' },
  { time: '06:00 AM', type: 'dj',        name: 'Morning Affirmations with DJ Solace' },
  { time: '08:00 AM', type: 'music',     name: 'Gentle Mornings Playlist' },
  { time: '10:00 AM', type: 'dj',        name: 'Midday Mindfulness — Quotes & Calm' },
  { time: '12:00 PM', type: 'music',     name: 'Healing Harmonics' },
  { time: '02:00 PM', type: 'meditation',name: 'Afternoon Stillness Session' },
  { time: '04:00 PM', type: 'music',     name: 'Nature Soundscapes' },
  { time: '06:00 PM', type: 'dj',        name: 'Evening Reflections with DJ Solace' },
  { time: '08:00 PM', type: 'music',     name: 'Twilight Piano Hour' },
  { time: '10:00 PM', type: 'meditation',name: 'Night Wind-Down & Breathing' },
];

// Determine which slot is currently active based on real time
function getActiveIndex() {
  const now   = new Date();
  const hour  = now.getHours();
  const minute = now.getMinutes();
  // Each slot is 2 hours (12 slots for 24 hours)
  const index = Math.floor((hour * 60 + minute) / 120) % SCHEDULE.length;
  return index;
}

function buildSchedule() {
  const el     = document.getElementById('schedule');
  if (!el) return;
  el.innerHTML = '';
  const active = getActiveIndex();

  SCHEDULE.forEach((s, i) => {
    const div = document.createElement('div');
    div.className = 'schedule-item' + (i === active ? ' active' : '');
    div.style.animationDelay = (0.04 * i) + 's';

    const badgeClass = { music: 'badge-music', dj: 'badge-dj', meditation: 'badge-meditation' }[s.type];
    const badgeText  = { music: '♫ Music',     dj: '🎙 DJ',    meditation: '✦ Meditation'    }[s.type];

    div.innerHTML = `
      <span class="sched-time">${s.time}</span>
      <span class="sched-badge ${badgeClass}">${badgeText}</span>
      <span class="sched-name">${s.name}</span>
      ${i === active ? '<span style="font-size:11px;color:var(--sage-light);white-space:nowrap">● LIVE</span>' : ''}
    `;
    el.appendChild(div);
  });
}

// Auto-refresh schedule every minute to update LIVE indicator
setInterval(buildSchedule, 60000);

// Export for use in main script (if needed)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SCHEDULE, buildSchedule, getActiveIndex };
}
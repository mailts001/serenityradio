/* ══════════════════════════════════════════
   SERENITY RADIO — donations.js
   Fetches real donation stats from Flask API
   Donation handled by Buy Me a Coffee
   ══════════════════════════════════════════ */

async function loadDonationStats() {
  try {
    const res  = await fetch('/api/donate/stats');
    if (!res.ok) return;
    const data = await res.json();

    const amountEl = document.getElementById('donated-amount');
    const fillEl   = document.getElementById('donation-fill');
    const pctEl    = document.getElementById('pct-label');
    const countEl  = document.getElementById('contributor-count');
    const remEl    = document.getElementById('remaining-label');

    if (amountEl) amountEl.textContent = '$' + Number(data.total).toLocaleString();
    if (fillEl)   fillEl.style.width   = Math.min(100, data.pct) + '%';
    if (pctEl)    pctEl.textContent    = data.pct + '% reached';
    if (countEl)  countEl.textContent  = Number(data.count).toLocaleString() + ' generous contributors';
    if (remEl)    remEl.textContent    = '$' + Number(data.remaining).toLocaleString() + ' to go';

  } catch (err) {
    // Silently fail — page still looks good with defaults
    console.info('Donation stats unavailable, using defaults.');
  }
}

// Let Flask know a donate link was clicked (for analytics)
function trackDonateClick() {
  fetch('/api/donate/click', { method: 'POST' }).catch(() => {});
}

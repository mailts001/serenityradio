/* ══════════════════════════════════════════
   SERENITY RADIO — auth.js
   Magic-link login modal, session handling
   ══════════════════════════════════════════ */

const Auth = (() => {
  let _user = null;

  function getToken() {
    return localStorage.getItem('sr_session_token') || '';
  }

  function headers() {
    const t = getToken();
    return t ? { 'X-Session-Token': t } : {};
  }

  async function init() {
    try {
      const r = await fetch('/api/auth/me', { headers: headers() });
      const d = await r.json();
      _user = d.logged_in ? d : null;
    } catch { _user = null; }
    _render();
    return _user;
  }

  function user() { return _user; }
  function isLoggedIn() { return !!_user; }
  function isPro() { return _user && (_user.plan === 'pro' || _user.plan === 'pro_teacher'); }
  function isTeacher() { return _user && _user.plan === 'pro_teacher'; }

  function _render() {
    // Always dispatch the auth:changed event so pages without auth-area
    // (e.g. teacher.html) still know the login state.
    document.dispatchEvent(new CustomEvent('auth:changed', { detail: _user }));
    const el = document.getElementById('auth-area');
    if (!el) return;
    if (_user) {
      el.innerHTML = `
        <div class="auth-user" onclick="Auth.openMenu(event)">
          <div class="auth-avatar">${(_user.email||'?')[0].toUpperCase()}</div>
          <span class="auth-name">${_user.name || _user.email.split('@')[0]}</span>
          ${isPro() ? '<span class="auth-badge">PRO</span>' : ''}
        </div>`;
    } else {
      el.innerHTML = `<button class="auth-login-btn" onclick="Auth.openLogin()">Sign in</button>`;
    }
  }

  function openLogin() {
    _removeModal();
    const m = document.createElement('div');
    m.id = 'auth-modal';
    m.innerHTML = `
      <div class="auth-overlay-bg" onclick="Auth.closeModal()"></div>
      <div class="auth-dialog">
        <button class="auth-dialog-close" onclick="Auth.closeModal()">✕</button>
        <div style="font-size:2rem;margin-bottom:.75rem">✦</div>
        <h2 style="font-family:'Playfair Display',serif;font-size:1.5rem;font-weight:400;margin-bottom:.4rem">Welcome to Serenity</h2>
        <p style="font-size:14px;color:#888;margin-bottom:1.5rem;line-height:1.6">Enter your email — we'll send a magic link.<br>No password needed.</p>
        <input type="email" id="auth-email" placeholder="you@example.com" autocomplete="email"
          style="width:100%;padding:12px 16px;border-radius:10px;border:1px solid #444;
                 background:#1e2538;color:#e8e0d5;font-size:15px;font-family:inherit;
                 outline:none;margin-bottom:1rem;box-sizing:border-box;">
        <button id="auth-send-btn" onclick="Auth.sendLink()"
          style="width:100%;padding:13px;border-radius:50px;background:#7a9e7e;
                 color:#fff;border:none;font-size:15px;font-weight:500;
                 cursor:pointer;font-family:inherit;transition:opacity .2s">
          Send Magic Link
        </button>
        <div id="auth-msg" style="font-size:13px;margin-top:.75rem;min-height:1.2em;text-align:center"></div>
      </div>`;
    document.body.appendChild(m);
    // Two rAF frames to guarantee paint before transition
    requestAnimationFrame(() => requestAnimationFrame(() => m.classList.add('visible')));
    setTimeout(() => {
      const inp = document.getElementById('auth-email');
      if (inp) {
        inp.focus();
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') Auth.sendLink(); });
      }
    }, 50);
  }

  async function sendLink() {
    const email = (document.getElementById('auth-email').value || '').trim();
    if (!email || !email.includes('@')) {
      _setMsg('Please enter a valid email.', 'error'); return;
    }
    const btn = document.getElementById('auth-send-btn');
    btn.disabled = true; btn.textContent = 'Sending…';
    try {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const d = await r.json();
      if (d.ok) {
        if (d.dev_link) {
          // Dev mode: no email configured — show clickable link
          _setMsg(`<a href="${d.dev_link}" style="color:#7a9e7e">Click here to sign in (dev mode)</a>`, 'ok');
        } else {
          _setMsg('✓ Check your inbox — magic link sent!', 'ok');
        }
        btn.textContent = 'Sent ✓';
      } else {
        _setMsg(d.error || 'Something went wrong', 'error');
        btn.disabled = false; btn.textContent = 'Send Magic Link';
      }
    } catch {
      _setMsg('Network error. Try again.', 'error');
      btn.disabled = false; btn.textContent = 'Send Magic Link';
    }
  }

  function openMenu(e) {
    e.stopPropagation();
    _removeMenu();
    const menu = document.createElement('div');
    menu.id = 'auth-menu';
    menu.innerHTML = `
      <div class="auth-menu-item" onclick="Favorites&&Favorites.openPanel()">♡ My Favorites</div>
      <div class="auth-menu-item" onclick="Auth.openUpgrade()">★ Upgrade to Pro</div>
      ${isTeacher() ? '<div class="auth-menu-item" onclick="window.location=\"/teacher\"">🧘 Teacher Portal</div>' : ''}
      <div class="auth-menu-sep"></div>
      <div class="auth-menu-item" onclick="Auth.logout()">Sign out</div>`;
    const rect = e.currentTarget.getBoundingClientRect();
    menu.style.top  = (rect.bottom + 8) + 'px';
    menu.style.right = (window.innerWidth - rect.right) + 'px';
    document.body.appendChild(menu);
    requestAnimationFrame(() => menu.classList.add('visible'));
    setTimeout(() => document.addEventListener('click', _removeMenu, { once: true }), 10);
  }

  function openUpgrade() {
    _removeModal(); _removeMenu();
    const m = document.createElement('div');
    m.id = 'auth-modal';
    m.innerHTML = `
      <div class="auth-overlay-bg" onclick="Auth.closeModal()"></div>
      <div class="auth-dialog upgrade-box">
        <button class="auth-dialog-close" onclick="Auth.closeModal()">✕</button>
        <h2 style="font-family:'Playfair Display',serif;font-size:1.5rem;font-weight:400;margin-bottom:1rem">Upgrade Serenity</h2>
        <div class="upgrade-plans">
          <div class="upgrade-plan">
            <div class="plan-name">Listener Pro</div>
            <div class="plan-price">$9<span>/mo</span></div>
            <ul class="plan-feats">
              <li>♡ Unlimited favorites</li>
              <li>📊 Score history 1 year</li>
              <li>🤖 AI companion unlimited</li>
              <li>🎧 Early access channels</li>
            </ul>
            <button class="plan-btn" onclick="Auth.checkout('listener')">Get Listener Pro</button>
          </div>
          <div class="upgrade-plan featured">
            <div class="plan-badge">Most Popular</div>
            <div class="plan-name">Teacher Pro</div>
            <div class="plan-price">$29<span>/mo</span></div>
            <ul class="plan-feats">
              <li>✦ Everything in Listener</li>
              <li>🧘 Public teacher profile</li>
              <li>📋 Custom playlists</li>
              <li>🔗 Embeddable player widget</li>
              <li>📈 Follower analytics</li>
            </ul>
            <button class="plan-btn btn-gold" onclick="Auth.checkout('teacher')">Get Teacher Pro</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(m);
    requestAnimationFrame(() => requestAnimationFrame(() => m.classList.add('visible')));
  }

  async function checkout(plan) {
    if (!isLoggedIn()) { closeModal(); openLogin(); return; }
    try {
      const r = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, headers()),
        body: JSON.stringify({ plan })
      });
      const d = await r.json();
      if (d.url) { window.location.href = d.url; }
      else _setMsg(d.error || 'Billing unavailable', 'error');
    } catch { _setMsg('Network error', 'error'); }
  }

  async function logout() {
    _removeMenu();
    await fetch('/api/auth/logout', { method: 'POST', headers: headers() });
    localStorage.removeItem('sr_session_token');
    localStorage.removeItem('sr_user_email');
    localStorage.removeItem('sr_user_plan');
    _user = null;
    _render();
  }

  function closeModal() { _removeModal(); }

  function _removeModal() {
    const m = document.getElementById('auth-modal');
    if (m) { m.classList.remove('visible'); setTimeout(() => m.remove(), 300); }
  }
  function _removeMenu() {
    const m = document.getElementById('auth-menu');
    if (m) { m.classList.remove('visible'); setTimeout(() => m.remove(), 200); }
  }
  function _setMsg(html, type) {
    const el = document.getElementById('auth-msg');
    if (!el) return;
    el.innerHTML = html;
    el.style.color = type === 'error' ? '#c62828' : type === 'ok' ? '#2e7d32' : '#555';
  }

  // Check for ?upgraded=1 on load
  if (new URLSearchParams(location.search).get('upgraded') === '1') {
    history.replaceState(null, '', '/');
    setTimeout(() => {
      const t = document.createElement('div');
      t.className = 'sr-toast';
      t.innerHTML = '🎉 Welcome to Pro! Enjoy your upgrade.';
      document.body.appendChild(t);
      setTimeout(() => t.remove(), 5000);
    }, 800);
  }

  return { init, user, isLoggedIn, isPro, isTeacher, openLogin, sendLink,
           openMenu, openUpgrade, checkout, logout, closeModal, headers };
})();

// Auto-init
document.addEventListener('DOMContentLoaded', () => Auth.init());

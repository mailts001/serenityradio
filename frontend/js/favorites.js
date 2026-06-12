/* ══════════════════════════════════════════
   SERENITY RADIO — favorites.js
   Heart button on tracks, favorites panel
   ══════════════════════════════════════════ */

const Favorites = (() => {
  let _favSrcs = new Set();

  async function load() {
    if (!Auth.isLoggedIn()) return;
    try {
      const r = await fetch('/api/favorites', { headers: Auth.headers() });
      const d = await r.json();
      _favSrcs = new Set((d.favorites || []).map(f => f.src));
      _refreshHearts();
    } catch {}
  }

  function isFav(src) { return _favSrcs.has(src); }

  async function toggle(src, title, artist, channel) {
    if (!Auth.isLoggedIn()) { Auth.openLogin(); return; }
    const wasFav = _favSrcs.has(src);
    // Optimistic update
    if (wasFav) _favSrcs.delete(src);
    else _favSrcs.add(src);
    _refreshHearts();

    try {
      const method = wasFav ? 'DELETE' : 'POST';
      await fetch('/api/favorites', {
        method,
        headers: Object.assign({ 'Content-Type': 'application/json' }, Auth.headers()),
        body: JSON.stringify({ src, title, artist, channel })
      });
    } catch {
      // Revert on failure
      if (wasFav) _favSrcs.add(src);
      else _favSrcs.delete(src);
      _refreshHearts();
    }
  }

  function _refreshHearts() {
    document.querySelectorAll('.fav-btn[data-src]').forEach(btn => {
      const active = _favSrcs.has(btn.dataset.src);
      btn.classList.toggle('active', active);
      btn.title = active ? 'Remove from favorites' : 'Add to favorites';
    });
  }

  // Called from player when current track changes
  function bindCurrentTrack(track) {
    const btn = document.getElementById('fav-current-btn');
    if (!btn || !track) return;
    btn.dataset.src     = track.src || '';
    btn.dataset.title   = track.title || '';
    btn.dataset.artist  = track.artist || '';
    btn.dataset.channel = track.channel || 'default';
    btn.classList.toggle('active', _favSrcs.has(track.src));
    btn.onclick = () => toggle(track.src, track.title, track.artist, track.channel);
  }

  async function openPanel() {
    if (!Auth.isLoggedIn()) { Auth.openLogin(); return; }
    const r = await fetch('/api/favorites', { headers: Auth.headers() });
    const d = await r.json();
    const favs = d.favorites || [];

    let panel = document.getElementById('fav-panel');
    if (panel) panel.remove();

    panel = document.createElement('div');
    panel.id = 'fav-panel';
    panel.innerHTML = `
      <div class="fav-panel-backdrop" onclick="document.getElementById('fav-panel').remove()"></div>
      <div class="fav-panel-inner">
        <div class="fav-panel-header">
          <h3>♡ My Favorites</h3>
          <button onclick="document.getElementById('fav-panel').remove()">✕</button>
        </div>
        ${favs.length === 0
          ? '<p class="fav-empty">No favorites yet.<br>Tap ♡ on any track to save it here.</p>'
          : favs.map((f, i) => `
            <div class="fav-row" data-src="${f.src}">
              <div class="fav-row-info">
                <div class="fav-row-title">${f.title || f.src.split('/').pop()}</div>
                <div class="fav-row-artist">${f.artist}</div>
              </div>
              <button class="fav-play-btn" onclick="Favorites.playFav('${f.src}','${f.title}','${f.artist}','${f.channel}')">▶</button>
              <button class="fav-remove-btn" onclick="Favorites.removeFav('${f.src}',this)">✕</button>
            </div>`).join('')
        }
      </div>`;
    document.body.appendChild(panel);
    requestAnimationFrame(() => panel.classList.add('visible'));
  }

  async function removeFav(src, btn) {
    _favSrcs.delete(src);
    _refreshHearts();
    btn.closest('.fav-row').remove();
    await fetch('/api/favorites', {
      method: 'DELETE',
      headers: Object.assign({ 'Content-Type': 'application/json' }, Auth.headers()),
      body: JSON.stringify({ src })
    });
  }

  function playFav(src, title, artist, channel) {
    // Inject into current tracklist and play immediately
    const fakeTrack = { src, title, artist, channel: channel || 'default', duration: 180 };
    if (typeof loadFavoriteTrack === 'function') {
      loadFavoriteTrack(fakeTrack);
    }
    document.getElementById('fav-panel')?.remove();
  }

  // React to auth changes
  document.addEventListener('auth:changed', e => {
    if (e.detail) load();
    else { _favSrcs = new Set(); _refreshHearts(); }
  });

  return { load, isFav, toggle, bindCurrentTrack, openPanel, removeFav, playFav };
})();

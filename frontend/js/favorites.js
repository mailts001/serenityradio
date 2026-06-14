/* ══════════════════════════════════════════
   SERENITY RADIO — favorites.js
   Heart, favorites panel, queue & shuffle
   ══════════════════════════════════════════ */

const Favorites = (() => {
  let _favSrcs = new Set();
  let _favList  = [];      // full objects [{src,title,artist,channel}]
  let _selected = new Set(); // srcs selected for "play selected"

  async function load() {
    if (!Auth.isLoggedIn()) return;
    try {
      const r = await fetch('/api/favorites', { headers: Auth.headers() });
      const d = await r.json();
      _favList  = d.favorites || [];
      _favSrcs  = new Set(_favList.map(f => f.src));
      _refreshHearts();
    } catch {}
  }

  function isFav(src) { return _favSrcs.has(src); }

  const FREE_FAV_LIMIT = 20;

  async function toggle(src, title, artist, channel) {
    if (!Auth.isLoggedIn()) {
      Auth.openLogin({ hint: 'Save your favourite tracks — free to join, no password needed.' });
      return;
    }
    const wasFav = _favSrcs.has(src);
    // Free users: cap at FREE_FAV_LIMIT
    if (!wasFav && !Auth.isPro() && _favList.length >= FREE_FAV_LIMIT) {
      Auth.requirePro('Unlimited Favourites',
        `Free accounts can save up to ${FREE_FAV_LIMIT} favourites. Upgrade to Listener Pro to save as many as you like.`);
      return;
    }
    if (wasFav) { _favSrcs.delete(src); _favList = _favList.filter(f => f.src !== src); }
    else        { _favSrcs.add(src);    _favList.push({ src, title, artist, channel }); }
    _refreshHearts();
    try {
      await fetch('/api/favorites', {
        method: wasFav ? 'DELETE' : 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, Auth.headers()),
        body: JSON.stringify({ src, title, artist, channel })
      });
    } catch {
      if (wasFav) { _favSrcs.add(src); _favList.push({ src, title, artist, channel }); }
      else        { _favSrcs.delete(src); _favList = _favList.filter(f => f.src !== src); }
      _refreshHearts();
    }
  }

  function _refreshHearts() {
    document.querySelectorAll('.fav-btn[data-src]').forEach(btn => {
      const active = _favSrcs.has(btn.dataset.src);
      btn.classList.toggle('active', active);
      btn.textContent = active ? '♥' : '♡';
      btn.title = active ? 'Remove from favorites' : 'Add to favorites';
    });
  }

  function bindCurrentTrack(track) {
    const btn = document.getElementById('fav-current-btn');
    if (!btn || !track) return;
    btn.dataset.src     = track.src || '';
    btn.classList.toggle('active', _favSrcs.has(track.src || ''));
    btn.textContent = _favSrcs.has(track.src || '') ? '♥' : '♡';
    btn.onclick = () => toggle(track.src, track.title, track.artist, track.channel);
  }

  // ── Queue helpers ──────────────────────────────────────
  function _buildQueue(list) {
    return list.map(f => ({
      src:     f.src,
      title:   f.title || f.src.split('/').pop().replace(/\.mp3$/i,''),
      artist:  f.artist || 'Serenity Radio',
      channel: f.channel || 'default',
      duration: 180,
      file:    f.src.split('/').pop(),
    }));
  }

  function playAll() {
    const queue = _buildQueue(_favList);
    if (!queue.length) return;
    _loadQueue(queue);
    _closePanel();
  }

  function shuffleAll() {
    const queue = _buildQueue([..._favList].sort(() => Math.random() - 0.5));
    if (!queue.length) return;
    _loadQueue(queue);
    _closePanel();
  }

  function playSelected() {
    const selList = _favList.filter(f => _selected.has(f.src));
    if (!selList.length) return;
    const queue = _buildQueue(selList);
    _loadQueue(queue);
    _closePanel();
  }

  function _loadQueue(queue) {
    // Inject the whole queue into the global tracks array and play from pos 0
    if (typeof tracks !== 'undefined' && typeof loadTrack === 'function') {
      // Prepend favorites queue before existing tracks
      tracks.unshift(...queue);
      currentTrack = 0;
      loadTrack(0);
      if (!isPlaying && typeof togglePlay === 'function') togglePlay();
      if (typeof renderTrackList === 'function') renderTrackList(tracks);
    }
  }

  function _toggleSelect(src, checkbox) {
    if (_selected.has(src)) _selected.delete(src);
    else _selected.add(src);
    checkbox.checked = _selected.has(src);
    const playSelBtn = document.getElementById('fav-play-sel-btn');
    if (playSelBtn) {
      playSelBtn.disabled = _selected.size === 0;
      playSelBtn.textContent = _selected.size
        ? `▶ Play Selected (${_selected.size})` : '▶ Play Selected';
    }
  }

  // ── Panel ──────────────────────────────────────────────
  async function openPanel() {
    if (!Auth.isLoggedIn()) { Auth.openLogin(); return; }
    await load();  // refresh from server
    _selected.clear();
    _renderPanel();
  }

  function _renderPanel() {
    let panel = document.getElementById('fav-panel');
    if (panel) panel.remove();

    const favs = _favList;
    panel = document.createElement('div');
    panel.id = 'fav-panel';
    panel.innerHTML = `
      <div class="fav-panel-backdrop" onclick="Favorites._closePanel()"></div>
      <div class="fav-panel-inner">
        <div class="fav-panel-header">
          <h3>♥ My Favorites <span style="font-size:13px;color:var(--muted);font-weight:400">${favs.length} songs</span></h3>
          <button onclick="Favorites._closePanel()" style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:18px">✕</button>
        </div>
        ${favs.length === 0
          ? `<p class="fav-empty">No favorites yet.<br>Tap ♡ on any track to save it here.</p>`
          : `<div class="fav-queue-btns">
              <button class="fav-q-btn" onclick="Favorites.playAll()">▶ Play All</button>
              <button class="fav-q-btn" onclick="Favorites.shuffleAll()">🔀 Shuffle All</button>
              <button class="fav-q-btn fav-q-disabled" id="fav-play-sel-btn" disabled onclick="Favorites.playSelected()">▶ Play Selected</button>
             </div>
             <div class="fav-list">
             ${favs.map((f) => {
               const title = f.title || f.src.split('/').pop().replace(/\.mp3$/i,'');
               return `<div class="fav-row" data-src="${f.src}">
                 <input type="checkbox" class="fav-check" onchange="Favorites._toggleSelect('${f.src}',this)">
                 <div class="fav-row-info">
                   <div class="fav-row-title">${title}</div>
                   <div class="fav-row-artist">${f.artist || 'Serenity Radio'} · ${f.channel || 'default'}</div>
                 </div>
                 <button class="fav-play-btn" onclick="Favorites._playOne('${f.src}','${title}','${f.artist||''}','${f.channel||'default'}')">▶</button>
                 <button class="fav-remove-btn" onclick="Favorites._removeRow('${f.src}',this)">✕</button>
               </div>`;
             }).join('')}
             </div>`
        }
      </div>`;
    document.body.appendChild(panel);
    requestAnimationFrame(() => panel.classList.add('visible'));
  }

  function _closePanel() {
    const p = document.getElementById('fav-panel');
    if (p) { p.classList.remove('visible'); setTimeout(() => p.remove(), 300); }
  }

  function _playOne(src, title, artist, channel) {
    _closePanel();
    // Station/schedule favorite — switch to its channel
    if (src.startsWith('/channel/') || src.startsWith('/sched/')) {
      // channel is stored in the artist field as "Serenity Radio · <ch> channel"
      const chMatch = (artist || '').match(/· (\w+) channel/);
      const ch = chMatch ? chMatch[1] : 'default';
      if (typeof switchChannel === 'function') switchChannel(ch);
      return;
    }
    const track = { src, title, artist, channel: channel||'default', duration:180, file: src.split('/').pop() };
    if (typeof loadFavoriteTrack === 'function') loadFavoriteTrack(track);
  }

  async function _removeRow(src, btn) {
    _favSrcs.delete(src);
    _favList = _favList.filter(f => f.src !== src);
    _selected.delete(src);
    _refreshHearts();
    btn.closest('.fav-row').remove();
    // Update count
    const h3 = document.querySelector('#fav-panel h3 span');
    if (h3) h3.textContent = _favList.length + ' songs';
    await fetch('/api/favorites', {
      method: 'DELETE',
      headers: Object.assign({ 'Content-Type': 'application/json' }, Auth.headers()),
      body: JSON.stringify({ src })
    });
  }

  // ── Expose internals needed by inline HTML onclick ──
  function removeFav(src, btn) { _removeRow(src, btn); }
  function playFav(src, title, artist, channel) { _playOne(src, title, artist, channel); }

  document.addEventListener('auth:changed', e => {
    if (e.detail) load();
    else { _favSrcs = new Set(); _favList = []; _refreshHearts(); }
  });

  return {
    load, isFav, toggle, bindCurrentTrack,
    openPanel, playAll, shuffleAll, playSelected,
    _closePanel, _toggleSelect, _playOne, _removeRow,
    // legacy
    removeFav, playFav,
  };
})();

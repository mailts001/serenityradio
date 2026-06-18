# ══════════════════════════════════════════
#   SERENITY RADIO — server.py (AUTO-SCAN VERSION)
#   Automatically plays ALL MP3s in music folder
#   NO JSON file required!
# ══════════════════════════════════════════

import os
import json
import random
import datetime
import threading
import time
from flask import Flask, send_from_directory, request, jsonify
from dotenv import load_dotenv

# Try to import mutagen for MP3 metadata extraction
try:
    from mutagen.mp3 import MP3
    MUTAGEN_AVAILABLE = True
except ImportError:
    MUTAGEN_AVAILABLE = False
    print("⚠️  mutagen not installed. Install with: pip install mutagen")

# ── Backend imports ──
from backend.db import init_db, get_connection
from backend.api.donate import (
    get_donation_stats,
    handle_bmc_webhook,
    track_donate_click,
)
from backend.api.subscribe import handle_subscribe
from backend.api.upload import handle_upload
from backend.api.tracks import get_tracks
from backend.api.monitor import handle_heartbeat, handle_stats, record_bytes
from backend.api.score import init_score_table, handle_checkin, handle_history
from backend.api.ai_companion import handle_companion, handle_provider_status
from backend.api.admin import (
    require_admin, admin_list_tracks, admin_upload_tracks,
    admin_delete_track, admin_list_submissions,
    admin_approve_submission, admin_reject_submission,
)
from backend.api.auth import (
    init_auth_tables, handle_request_login, handle_verify_token,
    handle_me, handle_logout,
)
from backend.api.favorites import init_favorites_table, handle_add_favorite, handle_remove_favorite, handle_list_favorites
from backend.api.teacher import (
    init_teacher_tables, handle_list_teachers, handle_get_teacher,
    handle_upsert_profile, handle_my_profile,
    handle_create_playlist, handle_add_to_playlist,
    handle_follow, handle_unfollow, handle_embed,
)
from backend.api.billing import handle_create_checkout, handle_portal, handle_webhook, handle_plans

load_dotenv()

# Get paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.join(BASE_DIR, 'frontend')
MUSIC_DIR = os.path.join(FRONTEND_DIR, 'assets', 'music')

print(f"\n{'='*50}")
print(f"SERENITY RADIO - Starting...")
print(f"Music directory: {MUSIC_DIR}")
print(f"Directory exists: {os.path.exists(MUSIC_DIR)}")

# Create music directory if it doesn't exist
if not os.path.exists(MUSIC_DIR):
    os.makedirs(MUSIC_DIR)
    print(f"✅ Created music directory: {MUSIC_DIR}")
    print("   Add your MP3 files here!")

app = Flask(
    __name__,
    static_folder=FRONTEND_DIR,
    static_url_path=''
)
# Add this after app = Flask(...)
@app.after_request
def add_header(response):
    """Disable caching for all responses"""
    response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, post-check=0, pre-check=0, max-age=0'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '-1'
    return response
app.config['MAX_CONTENT_LENGTH'] = 55 * 1024 * 1024

# ── Global variables ──
playlist_cache = []
shuffle_mode = False
last_scan_time = 0
SCAN_INTERVAL = 30  # Scan every 30 seconds

def scan_music_folder(force=False):
    """Scan music folder — uses cache if < SCAN_INTERVAL seconds old."""
    global last_scan_time, playlist_cache

    # Return cached result if recent enough and not forced
    if not force and playlist_cache and (time.time() - last_scan_time) < SCAN_INTERVAL:
        return playlist_cache

    tracks = []

    if not os.path.exists(MUSIC_DIR):
        print(f"❌ Music directory not found: {MUSIC_DIR}")
        return tracks

    # Collect all MP3s from root + channel subdirs.
    # Deduplicate by BOTH real path (symlinks) AND filename — same filename in
    # multiple directories counts as the same track; root folder wins.
    seen_paths = set()   # resolved real paths
    seen_names = set()   # bare filenames (case-insensitive)
    all_mp3s   = []
    CHANNEL_DIRS = ['', 'sleep', 'focus', 'yoga', 'nature']
    for ch in CHANNEL_DIRS:
        d = os.path.join(MUSIC_DIR, ch) if ch else MUSIC_DIR
        if not os.path.isdir(d):
            continue
        for f in sorted(os.listdir(d)):
            if not f.lower().endswith('.mp3'):
                continue
            real  = os.path.realpath(os.path.join(d, f))
            fname = f.lower()
            if real in seen_paths or fname in seen_names:
                print(f"  ⚠️ Skipping duplicate: {f}")
                continue
            seen_paths.add(real)
            seen_names.add(fname)
            all_mp3s.append((ch, f, os.path.join(d, f)))

    print(f"📁 Found {len(all_mp3s)} unique MP3 files")

    for idx, (ch, mp3_file, filepath) in enumerate(all_mp3s):
        duration = 180
        if MUTAGEN_AVAILABLE:
            try:
                audio = MP3(filepath)
                duration = int(audio.info.length)
            except Exception as e:
                print(f"  ⚠️ Could not read duration for {mp3_file}: {e}")

        title = mp3_file.replace('.mp3', '').replace('-', ' ').replace('_', ' ').title()
        src   = f'/assets/music/{ch}/{mp3_file}' if ch else f'/assets/music/{mp3_file}'

        tracks.append({
            'id':      idx,
            'file':    mp3_file,
            'title':   title,
            'artist':  'Serenity Radio',
            'duration': duration,
            'channel': ch or 'default',
            'src':     src,
        })
        print(f"  ✅ [{ch or 'default'}] {title} ({duration}s)")

    playlist_cache = tracks
    last_scan_time = time.time()

    print(f"\n🎵 Playlist ready: {len(tracks)} unique tracks" if tracks
          else f"\n⚠️ No MP3 files found in: {MUSIC_DIR}")
    return tracks

def get_time_based_playlist():
    """Return playlist filtered by time of day."""
    all_tracks = scan_music_folder()
    
    if not all_tracks:
        return [], "No tracks"
    
    current_hour = datetime.datetime.now().hour
    
    # Define time-based moods
    if 5 <= current_hour < 9:
        mood = "🌅 Morning - Gentle Energy"
    elif 9 <= current_hour < 12:
        mood = "☀️ Late Morning - Uplifting"
    elif 12 <= current_hour < 17:
        mood = "🌤️ Afternoon - Focus & Flow"
    elif 17 <= current_hour < 20:
        mood = "🌆 Evening - Wind Down"
    elif 20 <= current_hour < 23:
        mood = "🌙 Night - Deep Relaxation"
    else:
        mood = "✨ Late Night - Sleep & Meditation"
    
    # Return all tracks (no filtering for now, just show mood)
    if shuffle_mode:
        shuffled = all_tracks.copy()
        random.shuffle(shuffled)
        return shuffled, mood
    return all_tracks, mood

# Initial scan
initial_tracks = scan_music_folder()

# ── Background scanner thread ──
def background_scanner():
    """Periodically scan for new files"""
    while True:
        time.sleep(SCAN_INTERVAL)
        old_count = len(playlist_cache)
        new_tracks = scan_music_folder()
        new_count = len(new_tracks)
        if new_count != old_count:
            print(f"🔄 Playlist updated: {old_count} -> {new_count} tracks")
        elif new_count > 0:
            print(f"✓ Scan complete: {new_count} tracks available")

scanner_thread = threading.Thread(target=background_scanner, daemon=True)
scanner_thread.start()

# ── Initialise database ──
init_db()
init_auth_tables()
init_favorites_table()
init_teacher_tables()

# ════════════════════════════════════
#  Page routes
# ════════════════════════════════════

@app.route('/')
def index():
    return send_from_directory(os.path.join(FRONTEND_DIR, 'pages'), 'index.html')

@app.route('/css/<path:filename>')
def serve_css(filename):
    return send_from_directory(os.path.join(FRONTEND_DIR, 'css'), filename)

@app.route('/js/<path:filename>')
def serve_js(filename):
    return send_from_directory(os.path.join(FRONTEND_DIR, 'js'), filename)

@app.route('/favicon.ico')
def favicon():
    favicon_path = os.path.join(FRONTEND_DIR, 'assets', 'favicon.ico')
    if os.path.exists(favicon_path):
        return send_from_directory(os.path.join(FRONTEND_DIR, 'assets'), 'favicon.ico')
    return '', 204

@app.route('/assets/<path:filename>')
def serve_assets(filename):
    return send_from_directory(os.path.join(FRONTEND_DIR, 'assets'), filename)

@app.route('/assets/music/<path:filename>')
def serve_music(filename):
    """Serve music files - NO JSON required!"""
    music_dir = MUSIC_DIR
    if filename.endswith('.mp3'):
        filepath = os.path.join(music_dir, filename)
        if os.path.exists(filepath):
            print(f"🎵 Serving music: {filename}")
            return send_from_directory(music_dir, filename)
        else:
            print(f"❌ Music file not found: {filename}")
            return jsonify({'error': 'File not found'}), 404
    return jsonify({'error': 'Invalid file type'}), 404

# ════════════════════════════════════
#  Radio API routes
# ════════════════════════════════════

@app.route('/api/playlist', methods=['GET'])
def api_playlist():
    channel = request.args.get('channel', 'default')
    import os as _os
    ch_dir  = _os.path.join(MUSIC_DIR, channel) if channel != 'default' else None
    if ch_dir and _os.path.isdir(ch_dir):
        mp3s   = sorted(f for f in _os.listdir(ch_dir) if f.lower().endswith('.mp3'))
        tracks = [{'id':i,'file':f,'title':f.rsplit('.',1)[0].replace('-',' ').replace('_',' ').title(),
                   'artist':'Serenity Radio','duration':180,'src':f'/assets/music/{channel}/{f}'}
                  for i,f in enumerate(mp3s)] or scan_music_folder()
    else:
        tracks, _ = get_time_based_playlist()
    return jsonify({'tracks': tracks, 'total_tracks': len(tracks), 'channel': channel})

@app.route('/api/playlist/shuffle', methods=['POST'])
def api_toggle_shuffle():
    """Toggle shuffle mode"""
    global shuffle_mode
    data = request.get_json()
    shuffle_mode = data.get('enabled', not shuffle_mode)
    return jsonify({
        'shuffle_mode': shuffle_mode,
        'message': f'Shuffle {"ON" if shuffle_mode else "OFF"}'
    })

@app.route('/api/playlist/refresh', methods=['POST'])
def api_refresh_playlist():
    """Force a manual refresh of the playlist"""
    tracks = scan_music_folder()
    return jsonify({
        'message': f'Playlist refreshed! Found {len(tracks)} tracks.',
        'count': len(tracks)
    })

@app.route('/api/playlist/status', methods=['GET'])
def api_playlist_status():
    """Get current playlist status"""
    tracks, mood = get_time_based_playlist()
    return jsonify({
        'total_tracks': len(tracks),
        'music_directory': MUSIC_DIR,
        'directory_exists': os.path.exists(MUSIC_DIR),
        'shuffle_mode': shuffle_mode,
        'current_mood': mood
    })

@app.route('/api/tracks', methods=['GET'])
def api_tracks():
    """Legacy endpoint — redirects to /api/playlist for backwards compatibility."""
    tracks, _ = get_time_based_playlist()
    # Return same format as /api/playlist so old callers don't break
    return jsonify({'tracks': tracks, 'count': len(tracks)})

# ════════════════════════════════════
#  Other API routes
# ════════════════════════════════════

@app.route('/api/donate/stats', methods=['GET'])
def api_donate_stats():
    return get_donation_stats()

@app.route('/api/donate/webhook', methods=['POST'])
def api_donate_webhook():
    return handle_bmc_webhook()

@app.route('/api/donate/click', methods=['POST'])
def api_donate_click():
    return track_donate_click()

@app.route('/api/subscribe', methods=['POST'])
def api_subscribe():
    return handle_subscribe()

@app.route('/api/upload', methods=['POST'])
def api_upload():
    return handle_upload()

# ════════════════════════════════════
#  Error handlers
# ════════════════════════════════════


@app.route('/admin')
def admin_page():
    return send_from_directory(os.path.join(FRONTEND_DIR, 'pages'), 'admin.html')

@app.route('/api/heartbeat', methods=['POST'])
def api_heartbeat(): return handle_heartbeat()

@app.route('/api/monitor', methods=['GET'])
def api_monitor(): return handle_stats()

@app.route('/api/score/checkin', methods=['POST'])
def api_checkin(): return handle_checkin()

@app.route('/api/score/history', methods=['GET'])
def api_score_history(): return handle_history()

@app.route('/api/companion', methods=['POST'])
def api_companion(): return handle_companion()

@app.route('/api/companion/status', methods=['GET'])
def api_companion_status(): return handle_provider_status()

@app.route('/api/admin/tracks', methods=['GET'])
@require_admin
def api_admin_list_tracks(): return admin_list_tracks()

@app.route('/api/admin/upload', methods=['POST'])
@require_admin
def api_admin_upload(): return admin_upload_tracks()

@app.route('/api/admin/tracks/<path:filename>', methods=['DELETE'])
@require_admin
def api_admin_delete_track(filename): return admin_delete_track(filename)

@app.route('/api/admin/submissions', methods=['GET'])
@require_admin
def api_admin_submissions(): return admin_list_submissions()

@app.route('/api/admin/submissions/<int:sub_id>/approve', methods=['POST'])
@require_admin
def api_admin_approve(sub_id): return admin_approve_submission(sub_id)

@app.route('/api/admin/submissions/<int:sub_id>/reject', methods=['POST'])
@require_admin
def api_admin_reject(sub_id): return admin_reject_submission(sub_id)

@app.route('/api/admin/set-plan', methods=['POST'])
@require_admin
def api_admin_set_plan():
    """Set a user's plan for testing. Body: {email, plan}
    plan: 'free' | 'pro' | 'pro_teacher'
    """
    data  = request.get_json() or {}
    email = data.get('email', '').strip().lower()
    plan  = data.get('plan', 'free')
    if plan not in ('free', 'pro', 'pro_teacher'):
        return jsonify({'error': 'plan must be free, pro, or pro_teacher'}), 400
    if not email:
        return jsonify({'error': 'email required'}), 400
    conn = get_connection()
    row  = conn.execute('SELECT id FROM users WHERE email=?', (email,)).fetchone()
    if not row:
        return jsonify({'error': f'No user with email {email}'}), 404
    conn.execute('UPDATE users SET plan=? WHERE email=?', (plan, email))
    conn.commit()
    conn.close()
    return jsonify({'ok': True, 'email': email, 'plan': plan})

# ════════════════════════════════════
#  Auth routes
# ════════════════════════════════════
@app.route('/api/auth/login', methods=['POST'])
def api_auth_login(): return handle_request_login()

@app.route('/auth/verify')
def auth_verify(): return handle_verify_token()

@app.route('/api/auth/me')
def api_auth_me(): return handle_me()

@app.route('/api/auth/logout', methods=['POST'])
def api_auth_logout(): return handle_logout()

# ════════════════════════════════════
#  Favorites routes
# ════════════════════════════════════
@app.route('/api/favorites', methods=['GET'])
def api_favorites_list(): return handle_list_favorites()

@app.route('/api/favorites', methods=['POST'])
def api_favorites_add(): return handle_add_favorite()

@app.route('/api/favorites', methods=['DELETE'])
def api_favorites_remove(): return handle_remove_favorite()

# ════════════════════════════════════
#  Teacher routes
# ════════════════════════════════════
@app.route('/teacher')
def teacher_page():
    return send_from_directory(os.path.join(FRONTEND_DIR, 'pages'), 'teacher.html')

@app.route('/teachers')
def teachers_directory():
    return send_from_directory(os.path.join(FRONTEND_DIR, 'pages'), 'teachers.html')

@app.route('/api/teachers', methods=['GET'])
def api_teachers(): return handle_list_teachers()

@app.route('/api/teachers/<int:user_id>', methods=['GET'])
def api_teacher(user_id): return handle_get_teacher(user_id)

@app.route('/api/teacher/profile', methods=['GET'])
def api_teacher_profile_get(): return handle_my_profile()

@app.route('/api/teacher/profile', methods=['POST'])
def api_teacher_profile_post(): return handle_upsert_profile()

@app.route('/api/teacher/playlists', methods=['POST'])
def api_teacher_create_pl(): return handle_create_playlist()

@app.route('/api/teacher/playlists/<int:playlist_id>/tracks', methods=['POST'])
def api_teacher_pl_tracks(playlist_id): return handle_add_to_playlist(playlist_id)

@app.route('/api/teachers/<int:teacher_id>/follow', methods=['POST'])
def api_teacher_follow(teacher_id): return handle_follow(teacher_id)

@app.route('/api/teachers/<int:teacher_id>/follow', methods=['DELETE'])
def api_teacher_unfollow(teacher_id): return handle_unfollow(teacher_id)

@app.route('/api/teachers/<int:teacher_id>/embed', methods=['GET'])
def api_teacher_embed(teacher_id): return handle_embed(teacher_id)

@app.route('/widget/teacher/<int:teacher_id>')
def teacher_widget(teacher_id):
    """Lightweight embeddable player for teacher playlists"""
    return f'''<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
body{{margin:0;font-family:system-ui,sans-serif;background:#0d1117;color:#e8e0d5;padding:1rem;}}
h4{{font-size:.9rem;color:#b8d4bb;margin-bottom:.5rem;}}
.tr{{font-size:12px;padding:4px 0;cursor:pointer;color:#9a9590;border-bottom:1px solid rgba(255,255,255,.05);}}
.tr:hover{{color:#e8e0d5;}}
.powered{{font-size:10px;color:#555;margin-top:.5rem;text-align:right;}}
</style></head>
<body>
<h4 id="name">Loading...</h4>
<div id="tracks"></div>
<div class="powered">powered by <a href="https://serenityradio.duckdns.org" style="color:#7a9e7e">Serenity Radio</a></div>
<script>
fetch("/api/teachers/{teacher_id}/embed").then(r=>r.json()).then(d=>{{
  document.getElementById("name").textContent = d.display_name || "Teacher Playlist";
  const tl = (d.playlists||[]).flatMap(p=>p.tracks||[]).slice(0,8);
  document.getElementById("tracks").innerHTML = tl.map(t=>`<div class="tr" onclick="new Audio('${{t.src}}').play()">▶ ${{t.title}}</div>`).join("");
}});
</script>
</body></html>'''

# ════════════════════════════════════
#  Billing routes
# ════════════════════════════════════
@app.route('/api/billing/plans', methods=['GET'])
def api_billing_plans(): return handle_plans()

@app.route('/api/billing/checkout', methods=['POST'])
def api_billing_checkout(): return handle_create_checkout()

@app.route('/api/billing/portal', methods=['POST'])
def api_billing_portal(): return handle_portal()

@app.route('/api/billing/webhook', methods=['POST'])
def api_billing_webhook(): return handle_webhook()

# ────────────────────────────────────────────────────────────────
#  SG Arts & Events  (reads from sg-arts-alert SQLite on same VPS)
# ────────────────────────────────────────────────────────────────
def _events_db_path():
    import os as _os
    return '/root/sg-arts-alert/sg_arts.db'

def _urgency(date_str):
    """Return sell-out urgency label based on days until event."""
    from datetime import date as _date
    if not date_str:
        return None
    try:
        ev_date = _date.fromisoformat(date_str[:10])
        days = (ev_date - _date.today()).days
        if days <= 0:   return 'today'
        if days <= 2:   return 'soon'
        if days <= 7:   return 'this_week'
        return None
    except Exception:
        return None

def _fmt_event_row(r, json_loads):
    cats = json_loads(r['categories'] or '[]')
    pmin = r['price_min']
    date_s = (r['date_start'] or '')[:10]
    return {
        'title':      r['title'],
        'url':        r['url'],
        'date':       date_s,
        'venue':      r['venue'] or '',
        'categories': cats[:3],
        'price':      f'SGD {pmin:.0f}' if pmin else 'Free / Check site',
        'source':     r['source'] or '',
        'urgency':    _urgency(date_s),
    }

@app.route('/api/events/upcoming', methods=['GET'])
def api_events_upcoming():
    """Return upcoming SG arts events; supports ?category= and ?q= filters."""
    import sqlite3 as _sqlite3, json as _json, os as _os
    limit    = min(int(request.args.get('limit', 10)), 40)
    category = (request.args.get('category') or '').strip().lower()
    q        = (request.args.get('q') or '').strip().lower()
    db_path  = _events_db_path()
    if not _os.path.exists(db_path):
        return jsonify({'events': [], 'notice': 'Events DB not found — scanner may not have run yet'})
    try:
        conn = _sqlite3.connect(db_path)
        conn.row_factory = _sqlite3.Row

        where_clauses = ["date_start >= date('now')"]
        params = []

        if category:
            where_clauses.append("lower(categories) LIKE ?")
            params.append(f'%{category}%')
        if q:
            where_clauses.append("(lower(title) LIKE ? OR lower(venue) LIKE ? OR lower(categories) LIKE ?)")
            params.extend([f'%{q}%', f'%{q}%', f'%{q}%'])

        where_sql = ' AND '.join(where_clauses)
        params.append(limit)

        rows = conn.execute(
            f"""SELECT title, url, date_start, venue, categories,
                       price_min, price_max, source
                FROM events
                WHERE {where_sql}
                ORDER BY date_start
                LIMIT ?""",
            params
        ).fetchall()
        conn.close()
        events = [_fmt_event_row(r, _json.loads) for r in rows]
        return jsonify({'events': events, 'count': len(events)})
    except Exception as e:
        app.logger.error('Events API error: %s', e)
        return jsonify({'events': [], 'error': 'Temporarily unavailable'})

@app.route('/api/events/subscribe', methods=['POST'])
def api_events_subscribe():
    """Store a user's event notification subscription (contact + categories)."""
    import sqlite3 as _sqlite3, json as _json, os as _os, re as _re
    from datetime import datetime as _dt
    data = request.get_json(silent=True) or {}
    contact    = (data.get('contact') or '').strip()[:120]
    categories = data.get('categories') or []
    if not contact:
        return jsonify({'ok': False, 'error': 'Contact is required'}), 400
    if not isinstance(categories, list) or not categories:
        return jsonify({'ok': False, 'error': 'Select at least one category'}), 400
    # Basic validation: must look like @handle or email
    if not (_re.match(r'^@[\w.]{2,}$', contact) or _re.match(r'^[^@\s]+@[^@\s]+\.[^@\s]+$', contact)):
        return jsonify({'ok': False, 'error': 'Enter a Telegram @username or a valid email'}), 400
    db_path = '/root/sg-arts-alert/sg_arts.db'
    if not _os.path.exists(db_path):
        return jsonify({'ok': False, 'error': 'Events service not ready yet'}), 503
    try:
        conn = _sqlite3.connect(db_path)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS subscriptions (
                id        INTEGER PRIMARY KEY AUTOINCREMENT,
                contact   TEXT NOT NULL,
                categories TEXT NOT NULL,
                created_at TEXT NOT NULL,
                active    INTEGER DEFAULT 1,
                UNIQUE(contact)
            )""")
        conn.execute("""
            INSERT INTO subscriptions (contact, categories, created_at)
            VALUES (?, ?, ?)
            ON CONFLICT(contact) DO UPDATE SET
                categories = excluded.categories,
                created_at = excluded.created_at,
                active = 1""",
            (contact, _json.dumps(categories), _dt.utcnow().isoformat()))
        conn.commit()
        conn.close()
        return jsonify({'ok': True})
    except Exception as e:
        app.logger.error('Events subscribe error: %s', e)
        return jsonify({'ok': False, 'error': 'Temporarily unavailable'}), 500

@app.route('/api/events/concierge', methods=['POST', 'OPTIONS'])
def api_events_concierge():
    """
    Wellness + Arts Concierge (Tier 3).
    POST body: { "query": "I'm stressed and have Saturday free" }
    Returns top matched events + a short explanation sentence.
    """
    import sqlite3 as _sqlite3, json as _json, os as _os, re as _re
    from datetime import date as _date

    if request.method == 'OPTIONS':
        return '', 204
    data      = request.get_json(silent=True) or {}
    query     = (data.get('query') or '').strip().lower()[:300]
    date_from  = (data.get('date_from') or '').strip()[:10]   # YYYY-MM-DD
    date_to    = (data.get('date_to')   or '').strip()[:10]
    budget     = data.get('budget')                           # numeric or None
    free_only  = bool(data.get('free_only', False))           # True = filter price_min=0
    if len(query) < 3:
        return jsonify({'ok': False, 'error': 'Tell me a bit more about what you\'re looking for'}), 400

    db_path = _events_db_path()
    if not _os.path.exists(db_path):
        return jsonify({'ok': False, 'events': [], 'reply': 'Our events database is warming up — check back soon!'}), 200

    # ── Mood / intent → category keyword mapping ──────────────────
    MOOD_MAP = {
        'stressed|stress|anxious|overwhelmed|burnout|tense|tired':
            (['meditation', 'wellness', 'sound', 'yoga', 'nature', 'mindfulness', 'healing'], 'calm'),
        'relax|unwind|chill|peace|quiet|soothe':
            (['jazz', 'classical', 'ambient', 'spa', 'wellness', 'meditation', 'garden'], 'relaxing'),
        'inspire|creative|art|gallery|museum|exhibition|photography':
            (['art', 'exhibition', 'museum', 'gallery', 'photography', 'design', 'craft'], 'inspiring'),
        'music|concert|live|band|jazz|classical|indie|pop|orchestra':
            (['music', 'concert', 'jazz', 'classical', 'performance', 'orchestra', 'band'], 'musical'),
        'family|kids|children|daughter|son|child|educational':
            (['family', 'children', 'educational', 'workshop', 'science', 'interactive'], 'family-friendly'),
        'date|romantic|partner|couple|girlfriend|boyfriend|anniversary':
            (['theatre', 'dance', 'concert', 'dinner', 'wine', 'exhibition', 'film'], 'romantic'),
        'social|friend|group|party|festival|outdoor|picnic|market':
            (['festival', 'outdoor', 'food', 'market', 'community', 'social'], 'social'),
        'japanese|japan|anime|manga|tea|kimono|sakura':
            (['japanese', 'japan', 'anime', 'asia', 'asian', 'cultural'], 'Japanese-cultural'),
        'active|sport|dance|movement|physical|workshop|class':
            (['dance', 'workshop', 'sports', 'outdoor', 'fitness', 'active'], 'active'),
        'culture|heritage|history|traditional|folk|chinese|malay|indian':
            (['heritage', 'cultural', 'traditional', 'history', 'folk', 'community'], 'cultural'),
        'free|cheap|budget|affordable':
            (['free', 'community', 'public', 'open'], 'budget-friendly'),
    }

    matched_mood  = 'curated'
    keyword_scores = {}   # event_id → score
    search_cats   = []

    for mood_pattern, (cats, label) in MOOD_MAP.items():
        if _re.search(mood_pattern, query):
            matched_mood = label
            search_cats.extend(cats)

    # Also extract any bare category words from the query itself
    bare_words = _re.findall(r'\b[a-z]{3,}\b', query)
    search_cats.extend(bare_words)
    search_cats = list(dict.fromkeys(search_cats))[:12]   # dedupe, cap

    try:
        conn = _sqlite3.connect(db_path)
        conn.row_factory = _sqlite3.Row

        # Build date filter: use provided range or fall back to 'from today'
        where_clauses = ["date_start >= date('now')"]
        params        = []
        if date_from:
            where_clauses = [f"date_start >= ?"]
            params.append(date_from)
        if date_to:
            where_clauses.append("date_start <= ?")
            params.append(date_to)
        # Free-only filter
        if free_only:
            where_clauses.append("(price_min IS NULL OR price_min = 0)")
        # Budget filter (price_min = 0 counts as free)
        elif budget is not None:
            try:
                bval = float(budget)
                where_clauses.append("(price_min IS NULL OR price_min <= ?)")
                params.append(bval)
            except (ValueError, TypeError):
                pass

        def _query_events(clauses, prms):
            return conn.execute(
                f"""SELECT title, url, date_start, venue, categories,
                          price_min, price_max, source
                   FROM events
                   WHERE {' AND '.join(clauses)}
                   ORDER BY date_start
                   LIMIT 80""",
                prms
            ).fetchall()

        def _score_rows(rows):
            out = []
            for r in rows:
                cats_str  = (r['categories'] or '').lower()
                title_str = r['title'].lower()
                score = sum(1 for kw in search_cats
                            if kw in cats_str or kw in title_str)
                if score > 0:
                    ev = _fmt_event_row(r, _json.loads)
                    ev['_score'] = score
                    out.append(ev)
            out.sort(key=lambda e: (-e['_score'], e['date'] or 'z'))
            return out[:4]

        rows = _query_events(where_clauses, params)
        scored = _score_rows(rows)

        # ── If no keyword matches, fall back: drop date/budget filter, score all upcoming ──
        used_fallback = False
        if not scored:
            fallback_rows = _query_events(["date_start >= date('now')"], [])
            scored = _score_rows(fallback_rows)
            if scored:
                used_fallback = True
            else:
                # Last resort: return ANY upcoming events sorted by date
                any_rows = conn.execute(
                    """SELECT title, url, date_start, venue, categories,
                              price_min, price_max, source
                       FROM events WHERE date_start >= date('now')
                       ORDER BY date_start LIMIT 4"""
                ).fetchall()
                scored = [_fmt_event_row(r, _json.loads) for r in any_rows]
                if scored:
                    used_fallback = True

        conn.close()
        top = scored
        for e in top:
            e.pop('_score', None)

        if top:
            ctx_parts = []
            if date_from and date_to:
                ctx_parts.append(f"{date_from} – {date_to}")
            elif date_from:
                ctx_parts.append(f"from {date_from}")
            if budget is not None:
                ctx_parts.append(f"within ${budget} budget")
            ctx_str = f" ({', '.join(ctx_parts)})" if ctx_parts else " right now"
            if used_fallback and (date_from or date_to or budget is not None):
                reply = (f"No events found for those exact dates/budget, but here are "
                         f"{len(top)} {matched_mood} upcoming experiences you might enjoy:")
            else:
                reply = (f"Here are {len(top)} {matched_mood} experiences in Singapore{ctx_str}:")
        else:
            reply = ("I couldn't find a perfect match — adjust your dates, budget, or mood and try again.")

        return jsonify({'ok': True, 'events': top, 'reply': reply})

    except Exception as e:
        app.logger.error('Concierge error: %s', e)
        return jsonify({'ok': False, 'events': [], 'reply': 'Something went wrong — try again shortly.'}), 500

@app.errorhandler(404)
def not_found(e):
    return jsonify({'error': 'Not found'}), 404

@app.errorhandler(413)
def too_large(e):
    return jsonify({'error': 'File too large. Maximum is 50MB.'}), 413

@app.errorhandler(500)
def server_error(e):
    return jsonify({'error': 'Internal server error'}), 500

# ════════════════════════════════════
#  Run
# ════════════════════════════════════

if __name__ == '__main__':
    print(f"\n{'='*50}")
    print(f"✅ SERENITY RADIO IS RUNNING!")
    print(f"📍 Music folder: {MUSIC_DIR}")
    print(f"🎵 Total MP3 files found: {len(playlist_cache)}")
    print(f"📋 Tracks: {[t['file'] for t in playlist_cache]}")
    print(f"🔄 Auto-scan every {SCAN_INTERVAL} seconds")
    print(f"🎲 Shuffle mode: {'ON' if shuffle_mode else 'OFF'}")
    print(f"🌐 Server: http://localhost:8080")
    print(f"🌐 Network: http://0.0.0.0:8080")
    print(f"{'='*50}\n")
    
    debug_mode = os.getenv('FLASK_ENV', 'production') == 'development'
    app.run(debug=debug_mode, host='0.0.0.0', port=8080)
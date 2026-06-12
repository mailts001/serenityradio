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
from backend.db import init_db
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

def scan_music_folder():
    """Automatically scan music folder for ALL MP3 files"""
    global last_scan_time, playlist_cache
    
    tracks = []
    
    if not os.path.exists(MUSIC_DIR):
        print(f"❌ Music directory not found: {MUSIC_DIR}")
        return tracks
    
    # Get ALL MP3 files recursively (root + channel subfolders)
    all_mp3s = []
    CHANNELS = ['', 'sleep', 'focus', 'yoga', 'nature']
    for ch in CHANNELS:
        d = os.path.join(MUSIC_DIR, ch) if ch else MUSIC_DIR
        if not os.path.isdir(d):
            continue
        for f in sorted(os.listdir(d)):
            if f.lower().endswith('.mp3'):
                all_mp3s.append((ch, f, os.path.join(d, f)))

    print(f"📁 Found {len(all_mp3s)} MP3 files across all channels")

    for idx, (ch, mp3_file, filepath) in enumerate(all_mp3s):
        # Try to get duration from MP3
        duration = 180  # Default 3 minutes
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
    
    if tracks:
        print(f"\n🎵 Playlist ready: {len(tracks)} tracks available!")
    else:
        print(f"\n⚠️ No MP3 files found in: {MUSIC_DIR}")
        print("   Please add some .mp3 files to this folder.")
    
    return tracks

def get_time_based_playlist():
    """Return playlist filtered by time of day"""
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
    """Legacy tracks endpoint"""
    tracks, _ = get_time_based_playlist()
    return jsonify(tracks)

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
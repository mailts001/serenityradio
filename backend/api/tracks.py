# ══════════════════════════════════════════
#   SERENITY RADIO — api/tracks.py
#   Scans the music folder and returns the
#   track list to the frontend player
# ══════════════════════════════════════════

import os
import json
from flask import jsonify

MUSIC_FOLDER = os.path.join(
    os.path.dirname(__file__), '..', '..', 'frontend', 'assets', 'music'
)

# Optional: metadata sidecar file
# Place a tracks.json in the music folder to add artist names & durations.
# If a file appears in tracks.json it uses that metadata,
# otherwise the filename is used as the title.
METADATA_FILE = os.path.join(MUSIC_FOLDER, 'tracks.json')

ALLOWED_EXTS = {'.mp3', '.wav', '.flac', '.ogg'}


def load_metadata():
    """Load optional tracks.json for rich metadata."""
    if os.path.exists(METADATA_FILE):
        try:
            with open(METADATA_FILE, 'r', encoding='utf-8') as f:
                items = json.load(f)
                # Index by filename for quick lookup
                return {item['file']: item for item in items}
        except Exception as e:
            print(f'[Tracks] Could not load tracks.json: {e}')
    return {}


def get_tracks():
    """GET /api/tracks — returns JSON list of available tracks."""
    os.makedirs(MUSIC_FOLDER, exist_ok=True)
    metadata = load_metadata()

    tracks = []
    try:
        files = sorted(os.listdir(MUSIC_FOLDER))
    except Exception:
        files = []

    for filename in files:
        ext = os.path.splitext(filename)[1].lower()
        if ext not in ALLOWED_EXTS:
            continue
        if filename == 'tracks.json':
            continue

        # Use metadata if available, otherwise derive from filename
        meta   = metadata.get(filename, {})
        title  = meta.get('title',  _title_from_filename(filename))
        artist = meta.get('artist', 'Serenity Radio')
        dur    = meta.get('duration', 0)

        tracks.append({
            'title':    title,
            'artist':   artist,
            'src':      f'/assets/music/{filename}',
            'duration': dur,
            'file':     filename,
        })

    return jsonify({'tracks': tracks, 'count': len(tracks)})


def _title_from_filename(filename):
    """Convert 'gentle-morning-rain.mp3' → 'Gentle Morning Rain'"""
    name = os.path.splitext(filename)[0]
    return name.replace('-', ' ').replace('_', ' ').title()

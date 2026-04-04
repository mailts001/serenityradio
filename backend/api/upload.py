# ══════════════════════════════════════════
#   SERENITY RADIO — api/upload.py
#   Musician music file upload handler
# ══════════════════════════════════════════

import os
import uuid
from flask import request, jsonify
from werkzeug.utils import secure_filename
#from db import add_submission
from backend.db import (
    add_submission,
)

UPLOAD_FOLDER  = os.path.join(os.path.dirname(__file__), '..', 'uploads')
ALLOWED_EXTS   = {'mp3', 'wav', 'flac'}
MAX_SIZE_BYTES = 50 * 1024 * 1024   # 50 MB


def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTS


def handle_upload():
    """POST /api/upload — multipart/form-data"""

    # ── Validate fields ──
    artist = request.form.get('artist', '').strip()
    email  = request.form.get('email',  '').strip()
    title  = request.form.get('title',  '').strip()
    genre  = request.form.get('genre',  '').strip()

    if not artist or not email or not title:
        return jsonify({
            'status':  'error',
            'message': 'Artist name, email and track title are required.',
        }), 400

    # ── Validate file ──
    if 'file' not in request.files:
        return jsonify({'status': 'error', 'message': 'No file attached.'}), 400

    file = request.files['file']

    if file.filename == '':
        return jsonify({'status': 'error', 'message': 'No file selected.'}), 400

    if not allowed_file(file.filename):
        return jsonify({
            'status':  'error',
            'message': 'Only MP3, WAV or FLAC files are accepted.',
        }), 400

    # ── Save file ──
    # Generate a unique filename so duplicates don't overwrite each other
    ext           = file.filename.rsplit('.', 1)[1].lower()
    safe_artist   = secure_filename(artist)[:30]
    safe_title    = secure_filename(title)[:40]
    unique_id     = uuid.uuid4().hex[:8]
    stored_name   = f"{safe_artist}_{safe_title}_{unique_id}.{ext}"

    os.makedirs(UPLOAD_FOLDER, exist_ok=True)
    save_path = os.path.join(UPLOAD_FOLDER, stored_name)

    file.save(save_path)

    # ── Record in database ──
    add_submission(artist, email, title, genre, stored_name)

    print(f"[Upload] New submission: '{title}' by {artist} ({stored_name})")

    return jsonify({
        'status':  'ok',
        'message': 'Submission received. Our curators will review within 5–7 days.',
    }), 200

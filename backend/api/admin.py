import os, shutil
from functools import wraps
from flask import request, jsonify
from werkzeug.utils import secure_filename

BASE_DIR   = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
MUSIC_DIR  = os.path.join(BASE_DIR, 'frontend', 'assets', 'music')
UPLOAD_DIR = os.path.join(BASE_DIR, 'backend', 'uploads')
ALLOWED    = {'mp3', 'wav', 'flac'}
ADMIN_PASSWORD = os.getenv('ADMIN_PASSWORD', 'serenity2024')

def require_admin(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get('X-Admin-Token') or request.args.get('token')
        if token != ADMIN_PASSWORD: return jsonify({'error': 'Unauthorized'}), 401
        return f(*args, **kwargs)
    return decorated

def _allowed(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED

def admin_list_tracks():
    os.makedirs(MUSIC_DIR, exist_ok=True)
    result = []
    for ch in ['default', 'sleep', 'focus', 'yoga', 'nature']:
        d = MUSIC_DIR if ch == 'default' else os.path.join(MUSIC_DIR, ch)
        if not os.path.isdir(d): continue
        for f in sorted(os.listdir(d)):
            if any(f.lower().endswith(f'.{e}') for e in ALLOWED):
                result.append({'filename': f, 'channel': ch,
                    'size_mb': round(os.path.getsize(os.path.join(d,f))/1024/1024,2),
                    'title': f.rsplit('.',1)[0].replace('-',' ').replace('_',' ').title()})
    return jsonify({'tracks': result, 'count': len(result)})

def admin_upload_tracks():
    channel = request.form.get('channel', 'default')
    dest_dir = MUSIC_DIR if channel == 'default' else os.path.join(MUSIC_DIR, channel)
    os.makedirs(dest_dir, exist_ok=True)
    files = request.files.getlist('files')
    if not files: return jsonify({'error': 'No files'}), 400
    saved, errors = [], []
    for f in files:
        if not f.filename: continue
        if not _allowed(f.filename): errors.append(f'{f.filename}: not audio'); continue
        name = secure_filename(f.filename)
        f.save(os.path.join(dest_dir, name))
        os.chmod(os.path.join(dest_dir, name), 0o644)
        saved.append(name)
    return jsonify({'saved': saved, 'errors': errors, 'count': len(saved)})

def admin_delete_track(filename):
    # Search across all channel dirs
    for ch in ['', 'sleep', 'focus', 'yoga', 'nature']:
        d    = os.path.join(MUSIC_DIR, ch) if ch else MUSIC_DIR
        path = os.path.join(d, secure_filename(filename))
        if os.path.exists(path):
            os.remove(path)
            return jsonify({'deleted': filename})
    return jsonify({'error': 'Not found'}), 404

def admin_list_submissions():
    from backend.db import get_connection
    conn = get_connection()
    rows = conn.execute("SELECT id,artist,title,genre,filename,status,created_at FROM submissions ORDER BY created_at DESC").fetchall()
    conn.close()
    return jsonify({'submissions': [dict(r) for r in rows]})

def admin_approve_submission(sub_id):
    from backend.db import get_connection
    conn = get_connection()
    row  = conn.execute("SELECT * FROM submissions WHERE id=?", (sub_id,)).fetchone()
    if not row: conn.close(); return jsonify({'error': 'Not found'}), 404
    src  = os.path.join(UPLOAD_DIR, row['filename'])
    dest = os.path.join(MUSIC_DIR,  row['filename'])
    if os.path.exists(src): shutil.move(src, dest); os.chmod(dest, 0o644)
    conn.execute("UPDATE submissions SET status='approved' WHERE id=?", (sub_id,))
    conn.commit(); conn.close()
    return jsonify({'approved': row['filename']})

def admin_reject_submission(sub_id):
    from backend.db import get_connection
    conn = get_connection()
    row  = conn.execute("SELECT filename FROM submissions WHERE id=?", (sub_id,)).fetchone()
    if row:
        src = os.path.join(UPLOAD_DIR, row['filename'])
        if os.path.exists(src): os.remove(src)
        conn.execute("UPDATE submissions SET status='rejected' WHERE id=?", (sub_id,))
        conn.commit()
    conn.close()
    return jsonify({'rejected': sub_id})

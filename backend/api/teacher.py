# ══════════════════════════════════════════
#   SERENITY RADIO — teacher.py
#   Teacher profiles, playlists, follower system
# ══════════════════════════════════════════

import os, uuid
from flask import request, jsonify, send_from_directory
from werkzeug.utils import secure_filename
from backend.db import get_connection
from backend.api.auth import get_current_user

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), '..', '..', 'frontend', 'assets', 'teacher')
os.makedirs(UPLOAD_DIR, exist_ok=True)
ALLOWED_EXT = {'.mp3', '.wav', '.flac'}


def init_teacher_tables():
    conn = get_connection()
    conn.executescript('''
        CREATE TABLE IF NOT EXISTS teacher_profiles (
            user_id     INTEGER PRIMARY KEY,
            display_name TEXT DEFAULT '',
            bio          TEXT DEFAULT '',
            specialty    TEXT DEFAULT '',
            avatar_url   TEXT DEFAULT '',
            website      TEXT DEFAULT '',
            approved     INTEGER DEFAULT 0,
            created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS teacher_playlists (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            teacher_id  INTEGER NOT NULL,
            name        TEXT NOT NULL,
            description TEXT DEFAULT '',
            public      INTEGER DEFAULT 1,
            created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS teacher_playlist_tracks (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            playlist_id INTEGER NOT NULL,
            src         TEXT NOT NULL,
            title       TEXT DEFAULT '',
            artist      TEXT DEFAULT '',
            sort_order  INTEGER DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS teacher_follows (
            follower_id INTEGER NOT NULL,
            teacher_id  INTEGER NOT NULL,
            created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (follower_id, teacher_id)
        );
    ''')
    conn.commit()
    conn.close()


# ── Public: list approved teachers ──
def handle_list_teachers():
    """GET /api/teachers"""
    conn = get_connection()
    rows = conn.execute('''
        SELECT tp.*, u.email,
               (SELECT COUNT(*) FROM teacher_follows WHERE teacher_id=tp.user_id) AS followers
        FROM teacher_profiles tp
        JOIN users u ON u.id=tp.user_id
        WHERE tp.approved=1
        ORDER BY followers DESC
    ''').fetchall()
    conn.close()
    return jsonify({'teachers': [dict(r) for r in rows]})


def handle_get_teacher(user_id):
    """GET /api/teachers/<id>"""
    conn = get_connection()
    prof = conn.execute(
        'SELECT * FROM teacher_profiles WHERE user_id=? AND approved=1', (user_id,)
    ).fetchone()
    if not prof:
        conn.close()
        return jsonify({'error': 'Not found'}), 404
    playlists = conn.execute(
        'SELECT * FROM teacher_playlists WHERE teacher_id=? AND public=1', (user_id,)
    ).fetchall()
    result = dict(prof)
    result['playlists'] = []
    for pl in playlists:
        tracks = conn.execute(
            'SELECT * FROM teacher_playlist_tracks WHERE playlist_id=? ORDER BY sort_order',
            (pl['id'],)
        ).fetchall()
        p = dict(pl)
        p['tracks'] = [dict(t) for t in tracks]
        result['playlists'].append(p)
    conn.close()
    return jsonify(result)


# ── Auth: create / update own profile ──
def handle_upsert_profile():
    """POST /api/teacher/profile"""
    user = get_current_user()
    if not user:
        return jsonify({'error': 'Login required'}), 401
    d = request.get_json() or {}
    conn = get_connection()
    conn.execute('''
        INSERT INTO teacher_profiles (user_id,display_name,bio,specialty,website)
        VALUES (?,?,?,?,?)
        ON CONFLICT(user_id) DO UPDATE SET
            display_name=excluded.display_name,
            bio=excluded.bio,
            specialty=excluded.specialty,
            website=excluded.website
    ''', (user['id'], d.get('display_name',''), d.get('bio',''),
          d.get('specialty',''), d.get('website','')))
    conn.commit()
    conn.close()
    return jsonify({'ok': True, 'pending_approval': True})


def handle_my_profile():
    """GET /api/teacher/profile"""
    user = get_current_user()
    if not user:
        return jsonify({'error': 'Login required'}), 401
    conn = get_connection()
    row = conn.execute(
        'SELECT * FROM teacher_profiles WHERE user_id=?', (user['id'],)
    ).fetchone()
    conn.close()
    return jsonify(dict(row) if row else {})


# ── Teacher playlist management ──
def handle_create_playlist():
    """POST /api/teacher/playlists"""
    user = get_current_user()
    if not user:
        return jsonify({'error': 'Login required'}), 401
    d = request.get_json() or {}
    conn = get_connection()
    cur = conn.execute(
        'INSERT INTO teacher_playlists (teacher_id,name,description,public) VALUES (?,?,?,?)',
        (user['id'], d.get('name','My Playlist'), d.get('description',''), d.get('public',1))
    )
    conn.commit()
    pl_id = cur.lastrowid
    conn.close()
    return jsonify({'ok': True, 'playlist_id': pl_id})


def handle_add_to_playlist(playlist_id):
    """POST /api/teacher/playlists/<id>/tracks"""
    user = get_current_user()
    if not user:
        return jsonify({'error': 'Login required'}), 401
    # Ownership check
    conn = get_connection()
    pl = conn.execute(
        'SELECT * FROM teacher_playlists WHERE id=? AND teacher_id=?', (playlist_id, user['id'])
    ).fetchone()
    if not pl:
        conn.close()
        return jsonify({'error': 'Not found or not yours'}), 404
    d = request.get_json() or {}
    max_sort = conn.execute(
        'SELECT COALESCE(MAX(sort_order),0) FROM teacher_playlist_tracks WHERE playlist_id=?',
        (playlist_id,)
    ).fetchone()[0]
    conn.execute(
        'INSERT INTO teacher_playlist_tracks (playlist_id,src,title,artist,sort_order) VALUES (?,?,?,?,?)',
        (playlist_id, d.get('src',''), d.get('title',''), d.get('artist',''), max_sort+1)
    )
    conn.commit()
    conn.close()
    return jsonify({'ok': True})


# ── Follow / unfollow ──
def handle_follow(teacher_id):
    """POST /api/teachers/<id>/follow"""
    user = get_current_user()
    if not user:
        return jsonify({'error': 'Login required'}), 401
    if user['id'] == teacher_id:
        return jsonify({'error': 'Cannot follow yourself'}), 400
    conn = get_connection()
    conn.execute(
        'INSERT OR IGNORE INTO teacher_follows (follower_id,teacher_id) VALUES (?,?)',
        (user['id'], teacher_id)
    )
    conn.commit()
    count = conn.execute(
        'SELECT COUNT(*) FROM teacher_follows WHERE teacher_id=?', (teacher_id,)
    ).fetchone()[0]
    conn.close()
    return jsonify({'ok': True, 'followers': count})


def handle_unfollow(teacher_id):
    """DELETE /api/teachers/<id>/follow"""
    user = get_current_user()
    if not user:
        return jsonify({'error': 'Login required'}), 401
    conn = get_connection()
    conn.execute(
        'DELETE FROM teacher_follows WHERE follower_id=? AND teacher_id=?',
        (user['id'], teacher_id)
    )
    conn.commit()
    count = conn.execute(
        'SELECT COUNT(*) FROM teacher_follows WHERE teacher_id=?', (teacher_id,)
    ).fetchone()[0]
    conn.close()
    return jsonify({'ok': True, 'followers': count})


# ── Embed widget data ──
def handle_embed(teacher_id):
    """GET /api/teachers/<id>/embed — public, no auth, for widget iframes"""
    conn = get_connection()
    prof = conn.execute(
        'SELECT * FROM teacher_profiles WHERE user_id=? AND approved=1', (teacher_id,)
    ).fetchone()
    if not prof:
        conn.close()
        return jsonify({'error': 'Not found'}), 404
    playlists = conn.execute(
        'SELECT * FROM teacher_playlists WHERE teacher_id=? AND public=1 LIMIT 3', (teacher_id,)
    ).fetchall()
    data = dict(prof)
    data['playlists'] = []
    for pl in playlists:
        tracks = conn.execute(
            'SELECT src,title,artist FROM teacher_playlist_tracks WHERE playlist_id=? ORDER BY sort_order LIMIT 20',
            (pl['id'],)
        ).fetchall()
        p = dict(pl)
        p['tracks'] = [dict(t) for t in tracks]
        data['playlists'].append(p)
    conn.close()
    return jsonify(data)

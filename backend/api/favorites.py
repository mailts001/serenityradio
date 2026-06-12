# ══════════════════════════════════════════
#   SERENITY RADIO — favorites.py
#   Per-user song favorites
# ══════════════════════════════════════════

from flask import request, jsonify
from backend.db import get_connection
from backend.api.auth import get_current_user


def init_favorites_table():
    conn = get_connection()
    conn.execute('''
        CREATE TABLE IF NOT EXISTS favorites (
            user_id  INTEGER NOT NULL,
            src      TEXT    NOT NULL,
            title    TEXT    DEFAULT '',
            artist   TEXT    DEFAULT '',
            channel  TEXT    DEFAULT 'default',
            added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, src)
        )
    ''')
    conn.commit()
    conn.close()


def handle_add_favorite():
    """POST /api/favorites  {src, title, artist, channel}"""
    user = get_current_user()
    if not user:
        return jsonify({'error': 'Login required'}), 401
    d = request.get_json() or {}
    src = d.get('src', '').strip()
    if not src:
        return jsonify({'error': 'src required'}), 400
    conn = get_connection()
    conn.execute(
        'INSERT OR IGNORE INTO favorites (user_id,src,title,artist,channel) VALUES (?,?,?,?,?)',
        (user['id'], src, d.get('title',''), d.get('artist',''), d.get('channel','default'))
    )
    conn.commit()
    conn.close()
    return jsonify({'ok': True})


def handle_remove_favorite():
    """DELETE /api/favorites  {src}"""
    user = get_current_user()
    if not user:
        return jsonify({'error': 'Login required'}), 401
    d = request.get_json() or {}
    src = d.get('src', '').strip()
    conn = get_connection()
    conn.execute('DELETE FROM favorites WHERE user_id=? AND src=?', (user['id'], src))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})


def handle_list_favorites():
    """GET /api/favorites"""
    user = get_current_user()
    if not user:
        return jsonify({'favorites': []}), 200
    conn = get_connection()
    rows = conn.execute(
        'SELECT src,title,artist,channel,added_at FROM favorites WHERE user_id=? ORDER BY added_at DESC',
        (user['id'],)
    ).fetchall()
    conn.close()
    return jsonify({'favorites': [dict(r) for r in rows]})

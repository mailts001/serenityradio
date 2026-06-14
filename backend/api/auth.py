# ══════════════════════════════════════════
#   SERENITY RADIO — auth.py
#   Magic-link email auth, no passwords
#   Email via Resend (free 100/day)
# ══════════════════════════════════════════

import os, secrets, datetime
from flask import request, jsonify, make_response
from backend.db import get_connection

RESEND_API_KEY  = os.getenv('RESEND_API_KEY', '')
APP_URL         = os.getenv('APP_URL', 'https://serenityradio.duckdns.org')
SESSION_DAYS    = 30
TOKEN_MINUTES   = 15


def init_auth_tables():
    conn = get_connection()
    conn.executescript('''
        CREATE TABLE IF NOT EXISTS users (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            email      TEXT UNIQUE NOT NULL,
            name       TEXT DEFAULT '',
            plan       TEXT DEFAULT 'free',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS magic_tokens (
            token      TEXT PRIMARY KEY,
            email      TEXT NOT NULL,
            expires_at TIMESTAMP NOT NULL,
            used       INTEGER DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS sessions (
            token      TEXT PRIMARY KEY,
            user_id    INTEGER NOT NULL,
            expires_at TIMESTAMP NOT NULL
        );
    ''')
    conn.commit()
    conn.close()


def _send_magic_email(email: str, token: str) -> bool:
    link = f"{APP_URL}/auth/verify?token={token}"
    if not RESEND_API_KEY:
        print(f"[Auth] Magic link (no email configured): {link}")
        return True
    try:
        import requests as req
        r = req.post('https://api.resend.com/emails',
            headers={'Authorization': f'Bearer {RESEND_API_KEY}',
                     'Content-Type': 'application/json'},
            json={
                'from':    'Serenity Radio <hello@serenityradio.com>',
                'to':      [email],
                'subject': '✦ Your Serenity Radio login link',
                'html':    f'''
                    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:2rem">
                    <h2 style="color:#7a9e7e">✦ Serenity Radio</h2>
                    <p>Click below to sign in. Link expires in 15 minutes.</p>
                    <a href="{link}" style="display:inline-block;background:#7a9e7e;color:#fff;
                       padding:12px 28px;border-radius:8px;text-decoration:none;margin:1rem 0">
                       Sign In to Serenity</a>
                    <p style="color:#999;font-size:13px">If you didn't request this, ignore it.</p>
                    </div>'''
            }, timeout=5)
        return r.status_code == 200
    except Exception as e:
        print(f"[Auth] Email error: {e}")
        return False


def handle_request_login():
    """POST /api/auth/login  {email}"""
    data  = request.get_json() or {}
    email = data.get('email', '').strip().lower()
    if not email or '@' not in email:
        return jsonify({'error': 'Valid email required'}), 400

    token   = secrets.token_urlsafe(32)
    expires = (datetime.datetime.utcnow() +
               datetime.timedelta(minutes=TOKEN_MINUTES)).isoformat()

    conn = get_connection()
    # Upsert user
    conn.execute('INSERT OR IGNORE INTO users (email) VALUES (?)', (email,))
    # Store token
    conn.execute('INSERT OR REPLACE INTO magic_tokens (token,email,expires_at) VALUES (?,?,?)',
                 (token, email, expires))
    conn.commit()
    conn.close()

    sent = _send_magic_email(email, token)
    return jsonify({'ok': True, 'sent': sent,
                    'dev_link': f'/auth/verify?token={token}' if not RESEND_API_KEY else None})


def handle_verify_token():
    """GET /auth/verify?token=xxx"""
    token = request.args.get('token', '')
    conn  = get_connection()
    row   = conn.execute(
        'SELECT * FROM magic_tokens WHERE token=? AND used=0', (token,)
    ).fetchone()

    if not row:
        conn.close()
        return '<h2>❌ Invalid or expired link. <a href="/">Go back</a></h2>', 400

    if row['expires_at'] < datetime.datetime.utcnow().isoformat():
        conn.close()
        return '<h2>⏱ Link expired. <a href="/">Request a new one</a></h2>', 400

    # Mark token used
    conn.execute('UPDATE magic_tokens SET used=1 WHERE token=?', (token,))

    # Get user
    user = conn.execute('SELECT * FROM users WHERE email=?', (row['email'],)).fetchone()

    # Create session
    sess_token = secrets.token_urlsafe(32)
    sess_exp   = (datetime.datetime.utcnow() +
                  datetime.timedelta(days=SESSION_DAYS)).isoformat()
    conn.execute('INSERT INTO sessions (token,user_id,expires_at) VALUES (?,?,?)',
                 (sess_token, user['id'], sess_exp))
    conn.commit()
    conn.close()

    resp = make_response(f'''
        <script>
        localStorage.setItem("sr_session_token", "{sess_token}");
        localStorage.setItem("sr_user_email", "{user['email']}");
        localStorage.setItem("sr_user_plan", "{user['plan']}");
        sessionStorage.setItem("sr_just_verified", "1");
        window.location = "/";
        </script>''')
    resp.set_cookie('sr_session', sess_token, max_age=SESSION_DAYS*86400,
                    httponly=True, samesite='Lax')
    return resp


def get_current_user():
    """Returns user dict or None. Checks cookie + Authorization header."""
    token = (request.cookies.get('sr_session') or
             request.headers.get('X-Session-Token') or
             (request.get_json(silent=True) or {}).get('session_token'))
    if not token:
        return None
    conn = get_connection()
    row  = conn.execute(
        '''SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id
           WHERE s.token=? AND s.expires_at > ?''',
        (token, datetime.datetime.utcnow().isoformat())
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def handle_me():
    """GET /api/auth/me"""
    user = get_current_user()
    if not user:
        return jsonify({'logged_in': False}), 200
    return jsonify({'logged_in': True, 'email': user['email'],
                    'name': user['name'], 'plan': user['plan'], 'id': user['id']})


def handle_logout():
    """POST /api/auth/logout"""
    token = request.cookies.get('sr_session')
    if token:
        conn = get_connection()
        conn.execute('DELETE FROM sessions WHERE token=?', (token,))
        conn.commit()
        conn.close()
    resp = jsonify({'ok': True})
    resp.delete_cookie('sr_session')
    return resp

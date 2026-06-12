# ══════════════════════════════════════════
#   SERENITY RADIO — score.py
#   Serenity Score™ — daily check-in + history
# ══════════════════════════════════════════

import json, datetime
from flask import request, jsonify
from backend.db import get_connection


def init_score_table():
    conn = get_connection()
    conn.execute('''
        CREATE TABLE IF NOT EXISTS serenity_scores (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id  TEXT NOT NULL,
            date        TEXT NOT NULL,
            stress      INTEGER,
            sleep       INTEGER,
            energy      INTEGER,
            anxiety     INTEGER,
            mood        INTEGER,
            score       INTEGER,
            channel_rec TEXT,
            created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(session_id, date)
        )
    ''')
    conn.commit()
    conn.close()


def _calc_score(stress, sleep, energy, anxiety, mood) -> tuple[int, str]:
    """
    Returns (serenity_score 0-100, recommended_channel).
    Higher score = more serene.
    Inputs are 1-10 user ratings (stress/anxiety inverted).
    """
    # Invert stress and anxiety (high stress = bad)
    s = (
        (10 - stress)  * 20 +   # 20% weight
        sleep          * 25 +   # 25% weight — sleep is biggest factor
        energy         * 15 +   # 15%
        (10 - anxiety) * 20 +   # 20%
        mood           * 20     # 20%
    ) // 10  # normalise to 0-100

    score = max(0, min(100, s))

    # Channel recommendation logic
    if sleep <= 4 or score < 30:
        channel = 'sleep'
    elif anxiety >= 7 or stress >= 7:
        channel = 'nature'
    elif energy <= 3:
        channel = 'focus'
    elif mood >= 7 and energy >= 6:
        channel = 'yoga'
    else:
        channel = 'default'

    return score, channel


def handle_checkin():
    """POST /api/score/checkin"""
    data       = request.get_json() or {}
    session_id = data.get('session_id', request.remote_addr)
    today      = datetime.date.today().isoformat()

    try:
        stress  = int(data.get('stress',  5))
        sleep   = int(data.get('sleep',   5))
        energy  = int(data.get('energy',  5))
        anxiety = int(data.get('anxiety', 5))
        mood    = int(data.get('mood',    5))
    except (ValueError, TypeError):
        return jsonify({'error': 'Invalid values'}), 400

    score, channel = _calc_score(stress, sleep, energy, anxiety, mood)

    conn = get_connection()
    try:
        conn.execute(
            '''INSERT INTO serenity_scores
               (session_id,date,stress,sleep,energy,anxiety,mood,score,channel_rec)
               VALUES (?,?,?,?,?,?,?,?,?)
               ON CONFLICT(session_id,date) DO UPDATE SET
               stress=excluded.stress,sleep=excluded.sleep,
               energy=excluded.energy,anxiety=excluded.anxiety,
               mood=excluded.mood,score=excluded.score,
               channel_rec=excluded.channel_rec''',
            (session_id, today, stress, sleep, energy, anxiety, mood, score, channel)
        )
        conn.commit()
    finally:
        conn.close()

    # Build human-readable insight
    insight = _insight(score, stress, sleep, energy, anxiety, mood)

    return jsonify({
        'score':       score,
        'channel_rec': channel,
        'insight':     insight,
        'breakdown': {
            'stress':  stress,
            'sleep':   sleep,
            'energy':  energy,
            'anxiety': anxiety,
            'mood':    mood,
        }
    })


def handle_history():
    """GET /api/score/history?session_id=xxx&days=30"""
    session_id = request.args.get('session_id', request.remote_addr)
    days       = min(int(request.args.get('days', 30)), 90)
    since      = (datetime.date.today() - datetime.timedelta(days=days)).isoformat()

    conn  = get_connection()
    rows  = conn.execute(
        'SELECT date,score,stress,sleep,energy,anxiety,mood,channel_rec FROM serenity_scores '
        'WHERE session_id=? AND date>=? ORDER BY date ASC',
        (session_id, since)
    ).fetchall()
    conn.close()

    return jsonify({'history': [dict(r) for r in rows], 'days': days})


def _insight(score, stress, sleep, energy, anxiety, mood) -> str:
    if score >= 75:
        return "You're in a great place today. Ride this energy."
    if score >= 55:
        return "Balanced day. Some gentle focus music will keep you grounded."
    if sleep <= 4:
        return "Rest is your priority. Sleep sounds will help you recover."
    if anxiety >= 7:
        return "Anxiety is elevated. Nature sounds and box breathing can help right now."
    if stress >= 7:
        return "High stress detected. Start with 5 minutes of breathing before anything else."
    if energy <= 3:
        return "Low energy today. Slow ambient music — don't push."
    return "Take it easy today. Let the music do the work."
